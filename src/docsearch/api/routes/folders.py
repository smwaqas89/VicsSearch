"""Folder browsing API routes."""
import os
from pathlib import Path
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import Optional, List


router = APIRouter()


class FolderInfo(BaseModel):
    """Folder information."""
    name: str
    path: str
    is_dir: bool = True


class BrowseResponse(BaseModel):
    """Browse response."""
    path: str
    parent: Optional[str]
    folders: List[FolderInfo]


@router.get("/folders/browse")
async def browse_folders(
    path: str = Query(default="/", description="Path to browse")
) -> BrowseResponse:
    """
    Browse filesystem folders.
    
    Returns list of subdirectories for the given path.
    """
    # Expand user home directory
    if path.startswith("~"):
        path = os.path.expanduser(path)
    
    # Handle root path
    if not path or path == "/":
        # On macOS/Linux, show common starting points
        home = Path.home()
        folders = []
        
        # Add home directory
        folders.append(FolderInfo(name="Home", path=str(home)))
        
        # Add common directories if they exist
        common_dirs = [
            home / "Documents",
            home / "Desktop",
            home / "Downloads",
            Path("/Users") if os.name != "nt" else Path("C:/Users"),
            Path("/Volumes") if os.name != "nt" else None,
        ]
        
        for d in common_dirs:
            if d and d.exists() and d.is_dir():
                folders.append(FolderInfo(name=d.name, path=str(d)))
        
        return BrowseResponse(
            path="/",
            parent=None,
            folders=folders
        )
    
    # Resolve the path
    try:
        target = Path(path).resolve()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid path")
    
    if not target.exists():
        raise HTTPException(status_code=404, detail="Path not found")
    
    if not target.is_dir():
        raise HTTPException(status_code=400, detail="Path is not a directory")
    
    # Get subdirectories
    folders = []
    try:
        for item in sorted(target.iterdir()):
            # Skip hidden files/folders
            if item.name.startswith("."):
                continue
            
            # Only include directories
            if item.is_dir():
                try:
                    # Check if we can access it
                    list(item.iterdir())
                    folders.append(FolderInfo(
                        name=item.name,
                        path=str(item)
                    ))
                except PermissionError:
                    # Skip inaccessible directories
                    pass
    except PermissionError:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    # Get parent path
    parent = str(target.parent) if target.parent != target else None
    
    return BrowseResponse(
        path=str(target),
        parent=parent,
        folders=folders
    )


class IndexStartRequest(BaseModel):
    """Request to start indexing."""
    path: str
    file_types: Optional[List[str]] = None
    exclude_patterns: Optional[List[str]] = None


@router.post("/index/start")
async def start_indexing(request: IndexStartRequest) -> dict:
    """
    Start indexing a folder with options.
    """
    from docsearch.indexer import IndexManager
    
    path = Path(request.path).expanduser().resolve()
    
    if not path.exists():
        raise HTTPException(status_code=404, detail="Path not found")
    
    if not path.is_dir():
        raise HTTPException(status_code=400, detail="Path must be a directory")
    
    index_manager = IndexManager()
    
    # Get file types to include
    file_types = request.file_types or [
        'pdf', 'docx', 'doc', 'txt', 'md', 'html', 'htm',
        'xlsx', 'xls', 'csv', 'json', 'png', 'jpg', 'jpeg'
    ]
    
    # Get exclude patterns
    exclude_patterns = request.exclude_patterns or [
        'node_modules', '.git', '__pycache__', '.venv', 'venv', '.DS_Store'
    ]
    
    # Count and queue files
    count = 0
    try:
        worker_pool = None
        try:
            from docsearch.api import app as app_module
            worker_pool = getattr(app_module, 'worker_pool', None)
        except:
            pass
        
        for file_path in path.rglob("*"):
            if not file_path.is_file():
                continue
            
            # Check exclude patterns
            path_str = str(file_path)
            skip = False
            for pattern in exclude_patterns:
                if pattern in path_str:
                    skip = True
                    break
            
            if skip:
                continue
            
            # Check file type
            ext = file_path.suffix.lower().lstrip('.')
            if ext not in file_types:
                continue
            
            # Queue or index directly
            if worker_pool:
                worker_pool.submit(str(file_path), "index")
            else:
                index_manager.index_file(file_path)
            
            count += 1
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    
    return {
        "message": f"Indexing started for {count} files",
        "path": str(path),
        "files_queued": count
    }
