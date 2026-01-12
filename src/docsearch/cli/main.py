"""Command-line interface for DocSearch."""
import sys
from pathlib import Path
from typing import Optional
import logging

import typer
from rich.console import Console
from rich.table import Table
from rich.panel import Panel
from rich.progress import Progress, SpinnerColumn, TextColumn

from docsearch.config import Config, set_config
from docsearch.db import Database, init_db
from docsearch.indexer import IndexManager
from docsearch.search import SearchEngine
from docsearch.extractors import get_registry


app = typer.Typer(
    name="docsearch",
    help="Local document search engine",
    no_args_is_help=True,
)
console = Console()


def setup_logging(verbose: bool = False):
    """Configure logging."""
    level = logging.DEBUG if verbose else logging.INFO
    logging.basicConfig(
        level=level,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    )


@app.command()
def search(
    query: str = typer.Argument(..., help="Search query"),
    page: int = typer.Option(1, "--page", "-p", help="Page number"),
    size: int = typer.Option(20, "--size", "-s", help="Results per page"),
    config_path: Optional[Path] = typer.Option(None, "--config", "-c", help="Config file path"),
):
    """
    Search indexed documents.
    
    Query syntax:
    
    - Keywords: contract texas
    
    - Phrases: "state of texas"
    
    - Boolean: contract AND texas, contract NOT amendment
    
    - Field: filename:report, type:pdf, author:smith
    
    - Dates: after:2022-01-01, before:2023-12-31, year:2023
    """
    if config_path:
        set_config(Config.load(config_path))
    
    engine = SearchEngine()
    result = engine.search(query, page=page, page_size=size)
    
    if result.total == 0:
        console.print("[yellow]No results found.[/yellow]")
        return
    
    console.print(f"\n[bold]Found {result.total} results[/bold] (page {result.page}, {result.took_ms}ms)\n")
    
    for r in result.results:
        # Result header
        console.print(f"[bold blue]{r.filename}[/bold blue]  [dim]{r.file_type.upper()}[/dim]  [green]Score: {r.score:.2f}[/green]")
        console.print(f"  [dim]{r.file_path}[/dim]")
        
        if r.doc_title:
            console.print(f"  [italic]Title: {r.doc_title}[/italic]")
        if r.doc_author:
            console.print(f"  [italic]Author: {r.doc_author}[/italic]")
        if r.doc_created:
            console.print(f"  [italic]Date: {r.doc_created}[/italic]")
        
        # Snippets
        for snippet in r.snippets:
            # Convert HTML marks to Rich markup
            highlighted = snippet.replace("<mark>", "[bold yellow]").replace("</mark>", "[/bold yellow]")
            console.print(f"  {highlighted}")
        
        console.print()


@app.command()
def status(
    config_path: Optional[Path] = typer.Option(None, "--config", "-c", help="Config file path"),
):
    """Show indexing status."""
    if config_path:
        set_config(Config.load(config_path))
    
    index_manager = IndexManager()
    stats = index_manager.get_stats()
    
    table = Table(title="Index Status")
    table.add_column("Metric", style="cyan")
    table.add_column("Value", style="green")
    
    table.add_row("Indexed Documents", str(stats["indexed_count"]))
    table.add_row("Pending", str(stats["pending"]))
    table.add_row("Failed", str(stats["failed"]))
    
    console.print(table)
    
    if stats["by_type"]:
        type_table = Table(title="Documents by Type")
        type_table.add_column("Type", style="cyan")
        type_table.add_column("Count", style="green")
        
        for file_type, count in sorted(stats["by_type"].items()):
            type_table.add_row(file_type, str(count))
        
        console.print(type_table)


@app.command()
def reindex(
    path: Optional[Path] = typer.Argument(None, help="File or folder to reindex (default: all)"),
    config_path: Optional[Path] = typer.Option(None, "--config", "-c", help="Config file path"),
    verbose: bool = typer.Option(False, "--verbose", "-v", help="Verbose output"),
):
    """Reindex documents."""
    setup_logging(verbose)
    
    if config_path:
        set_config(Config.load(config_path))
    
    index_manager = IndexManager()
    
    if path:
        path = path.expanduser().resolve()
        if not path.exists():
            console.print(f"[red]Path not found: {path}[/red]")
            raise typer.Exit(1)
        
        if path.is_file():
            with Progress(
                SpinnerColumn(),
                TextColumn("[progress.description]{task.description}"),
                console=console,
            ) as progress:
                progress.add_task(f"Indexing {path.name}...", total=None)
                success = index_manager.index_file(path)
            
            if success:
                console.print(f"[green]✓ Indexed: {path}[/green]")
            else:
                console.print(f"[red]✗ Failed: {path}[/red]")
        else:
            # Index all files in folder
            files = list(path.rglob("*"))
            files = [f for f in files if f.is_file() and get_registry().can_extract(f)]
            
            success_count = 0
            fail_count = 0
            
            with Progress(console=console) as progress:
                task = progress.add_task("Indexing...", total=len(files))
                
                for file_path in files:
                    if index_manager.index_file(file_path):
                        success_count += 1
                    else:
                        fail_count += 1
                    progress.advance(task)
            
            console.print(f"\n[green]✓ Indexed: {success_count}[/green]  [red]✗ Failed: {fail_count}[/red]")
    else:
        # Reindex all watched folders
        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            console=console,
        ) as progress:
            progress.add_task("Reindexing all watched folders...", total=None)
            success, failed = index_manager.reindex_all()
        
        console.print(f"\n[green]✓ Indexed: {success}[/green]  [red]✗ Failed: {failed}[/red]")


@app.command()
def serve(
    host: str = typer.Option("127.0.0.1", "--host", "-h", help="Host to bind"),
    port: int = typer.Option(8080, "--port", "-p", help="Port to bind"),
    config_path: Optional[Path] = typer.Option(None, "--config", "-c", help="Config file path"),
    reload: bool = typer.Option(False, "--reload", help="Enable auto-reload"),
):
    """Start the web server."""
    if config_path:
        set_config(Config.load(config_path))
    
    import uvicorn
    
    console.print(f"\n[bold]Starting DocSearch server at http://{host}:{port}[/bold]\n")
    console.print("API docs: http://{host}:{port}/docs")
    console.print("Press Ctrl+C to stop\n")
    
    uvicorn.run(
        "docsearch.api.app:app",
        host=host,
        port=port,
        reload=reload,
    )


@app.command()
def watch(
    start: bool = typer.Option(True, "--start/--stop", help="Start or stop watcher"),
    config_path: Optional[Path] = typer.Option(None, "--config", "-c", help="Config file path"),
    verbose: bool = typer.Option(False, "--verbose", "-v", help="Verbose output"),
):
    """Start folder watcher (runs until interrupted)."""
    setup_logging(verbose)
    
    if config_path:
        set_config(Config.load(config_path))
    
    from docsearch.config import get_config
    from docsearch.queue import WorkerPool
    from docsearch.watcher import FolderWatcher
    
    config = get_config()
    
    console.print("[bold]Starting DocSearch watcher...[/bold]\n")
    console.print("Watching folders:")
    for folder in config.get_watch_folders():
        console.print(f"  • {folder}")
    console.print("\nPress Ctrl+C to stop\n")
    
    # Initialize worker pool
    worker_pool = WorkerPool(num_workers=config.indexer.workers)
    worker_pool.start()
    
    # Initialize watcher
    watcher = FolderWatcher(
        on_created=lambda p: worker_pool.submit(p, "index"),
        on_modified=lambda p: worker_pool.submit(p, "reindex"),
        on_deleted=lambda p: worker_pool.submit(p, "delete", priority=100),
    )
    watcher.start()
    
    try:
        import time
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        console.print("\n[yellow]Stopping watcher...[/yellow]")
    finally:
        watcher.stop()
        worker_pool.stop()
        console.print("[green]Stopped.[/green]")


@app.command()
def config(
    show: bool = typer.Option(True, "--show", help="Show current config"),
    config_path: Optional[Path] = typer.Option(None, "--config", "-c", help="Config file path"),
):
    """Show or edit configuration."""
    if config_path:
        set_config(Config.load(config_path))
    
    from docsearch.config import get_config
    cfg = get_config()
    
    console.print(Panel.fit("[bold]DocSearch Configuration[/bold]"))
    console.print(f"\nData directory: {cfg.get_data_dir()}")
    console.print(f"Database: {cfg.get_db_path()}")
    console.print(f"\nWatch folders:")
    for folder in cfg.get_watch_folders():
        exists = "✓" if folder.exists() else "✗"
        console.print(f"  [{exists}] {folder}")
    console.print(f"\nIndexer workers: {cfg.indexer.workers}")
    console.print(f"OCR enabled: {cfg.ocr.enabled}")
    console.print(f"OCR language: {cfg.ocr.language}")
    console.print(f"\nSupported file types:")
    for ext in get_registry().supported_extensions():
        console.print(f"  {ext}")


@app.command()
def init(
    config_path: Optional[Path] = typer.Option(None, "--config", "-c", help="Config file path"),
):
    """Initialize the database and configuration."""
    if config_path:
        set_config(Config.load(config_path))
    
    from docsearch.config import get_config
    cfg = get_config()
    
    # Create data directory
    data_dir = cfg.get_data_dir()
    data_dir.mkdir(parents=True, exist_ok=True)
    
    # Initialize database
    init_db(cfg.get_db_path())
    
    console.print(f"[green]✓ Created data directory: {data_dir}[/green]")
    console.print(f"[green]✓ Initialized database: {cfg.get_db_path()}[/green]")
    
    # Check config file
    config_file = Path.home() / ".config" / "docsearch" / "config.toml"
    if not config_file.exists():
        console.print(f"\n[yellow]Note: No config file found at {config_file}[/yellow]")
        console.print("Copy config.example.toml to customize settings.")


@app.command()
def ask(
    question: str = typer.Argument(..., help="Question to ask about your documents"),
    file: Optional[Path] = typer.Option(None, "--file", "-f", help="Limit to specific file"),
    top_k: int = typer.Option(5, "--top-k", "-k", help="Number of chunks to retrieve"),
    config_path: Optional[Path] = typer.Option(None, "--config", "-c", help="Config file path"),
):
    """
    Ask a question about your documents using RAG.
    
    This retrieves relevant document chunks and uses an LLM to generate an answer.
    
    Requires either:
    - Ollama running locally (ollama serve)
    - ANTHROPIC_API_KEY or OPENAI_API_KEY environment variable
    """
    if config_path:
        set_config(Config.load(config_path))
    
    from docsearch.rag import RAGEngine
    
    engine = RAGEngine()
    
    # Check LLM availability
    if not engine.llm.is_available:
        console.print("[red]Error: No LLM available.[/red]")
        console.print("\nTo use RAG, you need one of:")
        console.print("  1. Ollama running: [cyan]ollama serve[/cyan]")
        console.print("  2. Set [cyan]ANTHROPIC_API_KEY[/cyan] environment variable")
        console.print("  3. Set [cyan]OPENAI_API_KEY[/cyan] environment variable")
        raise typer.Exit(1)
    
    file_path = str(file.resolve()) if file else None
    
    with Progress(
        SpinnerColumn(),
        TextColumn("[progress.description]{task.description}"),
        console=console,
    ) as progress:
        progress.add_task("Thinking...", total=None)
        response = engine.ask(question, top_k=top_k, file_path_filter=file_path)
    
    # Display answer
    console.print(Panel(
        response.answer,
        title="[bold]Answer[/bold]",
        border_style="green",
    ))
    
    # Display sources
    if response.sources:
        console.print("\n[bold]Sources:[/bold]")
        for i, source in enumerate(response.sources[:5], 1):
            console.print(f"  {i}. [blue]{source.filename}[/blue] (score: {source.score:.2f})")
            console.print(f"     [dim]{source.content[:100]}...[/dim]")
    
    console.print(f"\n[dim]Took {response.took_ms}ms[/dim]")


@app.command()
def rag_index(
    config_path: Optional[Path] = typer.Option(None, "--config", "-c", help="Config file path"),
    verbose: bool = typer.Option(False, "--verbose", "-v", help="Verbose output"),
):
    """
    Index all documents for RAG (chunking + embeddings).
    
    This creates vector embeddings for semantic search.
    Run this after initial indexing or when you want to enable RAG features.
    """
    setup_logging(verbose)
    
    if config_path:
        set_config(Config.load(config_path))
    
    from docsearch.rag import RAGEngine
    from docsearch.db import Database
    
    db = Database()
    engine = RAGEngine()
    
    # Get all indexed documents
    with db.connection() as conn:
        docs = conn.execute(
            "SELECT id, file_path, filename, content FROM documents WHERE content IS NOT NULL"
        ).fetchall()
    
    console.print(f"[bold]Indexing {len(docs)} documents for RAG...[/bold]\n")
    
    total_chunks = 0
    with Progress(console=console) as progress:
        task = progress.add_task("Indexing...", total=len(docs))
        
        for doc in docs:
            doc_id, file_path, filename, content = doc
            chunks = engine.index_document(doc_id, file_path, filename, content)
            total_chunks += chunks
            progress.advance(task)
    
    console.print(f"\n[green]✓ Indexed {total_chunks} chunks from {len(docs)} documents[/green]")
    
    # Show stats
    stats = engine.get_stats()
    console.print(f"\nVector store: {stats['vector_store']['total_chunks']} chunks")


@app.command()
def rag_status(
    config_path: Optional[Path] = typer.Option(None, "--config", "-c", help="Config file path"),
):
    """Show RAG system status."""
    if config_path:
        set_config(Config.load(config_path))
    
    from docsearch.rag import RAGEngine, get_rag_config
    
    config = get_rag_config()
    engine = RAGEngine()
    stats = engine.get_stats()
    
    console.print(Panel.fit("[bold]RAG Status[/bold]"))
    
    # LLM Status
    llm_status = "[green]✓ Available[/green]" if engine.llm.is_available else "[red]✗ Not available[/red]"
    console.print(f"\nLLM Provider: {config.llm_provider.value} {llm_status}")
    if config.llm_provider.value == "ollama":
        console.print(f"  Model: {config.ollama_model}")
        console.print(f"  URL: {config.ollama_base_url}")
    
    # Embeddings
    console.print(f"\nEmbeddings: {config.embedding_provider.value}")
    console.print(f"  Model: {config.embedding_model}")
    
    # Vector store
    vs = stats["vector_store"]
    console.print(f"\nVector Store:")
    console.print(f"  Chunks: {vs['total_chunks']}")
    console.print(f"  Documents: {vs['total_documents']}")
    
    # Settings
    console.print(f"\nSettings:")
    console.print(f"  Chunk size: {config.chunk_size} tokens")
    console.print(f"  Top-K: {config.top_k}")
    console.print(f"  Hybrid search: {config.hybrid_search}")


if __name__ == "__main__":
    app()
