# Changelog

All notable changes to VicsSearch will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.1.0] - 2025-01-12

### Added
- Enterprise-grade web UI with professional design
- AI-powered Q&A (RAG) with Ollama integration
- Document preview panel with search term highlighting
- Keyboard shortcuts (/, Ctrl+K, Escape, Shift+Enter)
- Command palette for quick actions
- Recent and saved searches
- Export results to JSON/CSV
- Dark/Light theme toggle
- "Why this matched?" explanation for search results
- Relevance score visualization
- File metadata display (size, date, page count)

### Changed
- Improved AI response speed by disabling reranker by default
- Cleaner UI without filter buttons (removed unimplemented features)
- Better search/AI mode switching with proper result clearing

### Fixed
- Recent search clicks now work properly
- AI thinking indicator hides correctly after response
- Results no longer stack when switching between Search and AI modes

## [2.0.0] - 2025-01-11

### Added
- RAG (Retrieval-Augmented Generation) system
- Vector embeddings with Ollama nomic-embed-text
- Hybrid search combining BM25 + semantic search
- AI question answering about documents
- Document chunking for better retrieval
- SQLite WAL mode for better performance

### Changed
- Switched from sentence-transformers to pure Ollama for embeddings
- Improved OCR with automatic detection of scanned documents

## [1.0.0] - 2025-01-09

### Added
- Initial release
- Full-text search with SQLite FTS5
- BM25 ranking algorithm
- Boolean queries (AND, OR, NOT)
- Phrase search
- Field-specific search (filename, content, type, author)
- Date filters (after, before, year)
- File type filters
- PDF extraction with PyMuPDF
- DOCX extraction with python-docx
- XLSX/CSV extraction
- HTML extraction with BeautifulSoup
- Plain text extraction
- OCR support with Tesseract
- Real-time folder watching
- Background job queue
- CLI interface
- REST API
- Web UI

## [Unreleased]

### Planned
- PDF in-browser preview
- Document comparison
- Folder watching for auto re-index
- Encrypted local index
- More AI features (summarize, extract facts)
- Filter by file type, date, folder
