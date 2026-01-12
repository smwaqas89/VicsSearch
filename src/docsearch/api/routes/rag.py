"""RAG API routes."""
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional
import json

from docsearch.rag import RAGEngine, get_rag_config


router = APIRouter()


class AskRequest(BaseModel):
    """Ask question request."""
    question: str
    top_k: Optional[int] = None
    file_path: Optional[str] = None  # Filter to specific file
    stream: bool = False


class AskResponse(BaseModel):
    """Ask question response."""
    answer: str
    sources: list[dict]
    query: str
    took_ms: float


class SummarizeRequest(BaseModel):
    """Summarize request."""
    query: str
    doc_ids: Optional[list[int]] = None


class IndexRequest(BaseModel):
    """Index document request."""
    doc_id: int
    file_path: str
    filename: str
    content: str


@router.post("/rag/ask", response_model=None)
async def ask_question(request: AskRequest):
    """
    Ask a question and get an answer from indexed documents.
    
    Uses RAG (Retrieval-Augmented Generation):
    1. Retrieves relevant document chunks
    2. Uses LLM to generate answer based on retrieved context
    """
    engine = RAGEngine()
    
    if not engine.llm.is_available:
        raise HTTPException(
            status_code=503,
            detail="LLM not available. Configure Ollama or API key."
        )
    
    if request.stream:
        # Streaming response
        async def generate():
            for token in engine.ask_stream(
                request.question,
                top_k=request.top_k,
                file_path_filter=request.file_path,
            ):
                yield f"data: {json.dumps({'token': token})}\n\n"
            yield "data: [DONE]\n\n"
        
        return StreamingResponse(
            generate(),
            media_type="text/event-stream",
        )
    
    # Non-streaming response
    response = engine.ask(
        request.question,
        top_k=request.top_k,
        file_path_filter=request.file_path,
    )
    
    return AskResponse(
        answer=response.answer,
        sources=[
            {
                "chunk_id": s.chunk_id,
                "doc_id": s.doc_id,
                "file_path": s.file_path,
                "filename": s.filename,
                "content": s.content[:300] + "..." if len(s.content) > 300 else s.content,
                "score": s.score,
                "page": getattr(s, 'page', None),
                "chunk_index": getattr(s, 'chunk_index', None),
            }
            for s in response.sources
        ],
        query=response.query,
        took_ms=response.took_ms,
    )


@router.post("/rag/summarize")
async def summarize_search(request: SummarizeRequest) -> dict:
    """
    Summarize search results using LLM.
    """
    engine = RAGEngine()
    
    if not engine.llm.is_available:
        raise HTTPException(
            status_code=503,
            detail="LLM not available. Configure Ollama or API key."
        )
    
    # Get relevant chunks
    chunks = engine.retriever.retrieve(request.query, top_k=10)
    
    if not chunks:
        return {"summary": "No relevant documents found.", "sources": []}
    
    # Generate summary
    summary = engine.summarize_results(request.query, chunks)
    
    return {
        "summary": summary,
        "query": request.query,
        "sources": [
            {"filename": c.filename, "file_path": c.file_path}
            for c in chunks
        ],
    }


@router.post("/rag/index")
async def index_document(request: IndexRequest) -> dict:
    """
    Index a document for RAG.
    
    This chunks the document, generates embeddings, and stores in vector DB.
    """
    engine = RAGEngine()
    
    chunks_added = engine.index_document(
        doc_id=request.doc_id,
        file_path=request.file_path,
        filename=request.filename,
        content=request.content,
    )
    
    return {
        "doc_id": request.doc_id,
        "chunks_indexed": chunks_added,
    }


@router.delete("/rag/index/{doc_id}")
async def delete_document(doc_id: int) -> dict:
    """Delete document from RAG index."""
    engine = RAGEngine()
    deleted = engine.delete_document(doc_id)
    
    return {
        "doc_id": doc_id,
        "chunks_deleted": deleted,
    }


@router.get("/rag/status")
async def rag_status() -> dict:
    """Get RAG system status."""
    engine = RAGEngine()
    stats = engine.get_stats()
    
    config = get_rag_config()
    
    return {
        "enabled": config.enabled,
        "llm": {
            "provider": config.llm_provider.value,
            "model": config.ollama_model if config.llm_provider.value == "ollama" else config.anthropic_model,
            "available": engine.llm.is_available,
        },
        "embeddings": {
            "provider": config.embedding_provider.value,
            "model": config.embedding_model,
        },
        "vector_store": stats["vector_store"],
        "settings": {
            "chunk_size": config.chunk_size,
            "top_k": config.top_k,
            "hybrid_search": config.hybrid_search,
        },
    }
