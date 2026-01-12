# 🔍 VicsSearch

<div align="center">

**A privacy-first, AI-powered local document search engine**

[![Python 3.11+](https://img.shields.io/badge/python-3.11+-blue.svg)](https://www.python.org/downloads/)


</div>

---

## ✨ Features

### 🔎 Powerful Search
- **Full-text search** with BM25 ranking
- **Boolean queries**: `contract AND texas NOT amendment`
- **Phrase search**: `"exact phrase match"`
- **Field search**: `filename:report type:pdf author:john`
- **Date filters**: `after:2023-01-01 before:2024-01-01`

### 🤖 AI-Powered Q&A (RAG)
- **Ask questions** about your documents in natural language
- **Get cited answers** with source document references
- **100% local AI** with Ollama - no data leaves your machine
- **Hybrid search** combining keyword + semantic search

### 📁 Wide File Support
| Documents | Spreadsheets | Images | Other |
|-----------|--------------|--------|-------|
| PDF | XLSX | PNG (OCR) | HTML |
| DOCX | XLS | JPG (OCR) | JSON |
| DOC | CSV | TIFF (OCR) | XML |
| TXT/MD | TSV | | |

### 🔒 Privacy First
- **100% Local** - Everything runs on your machine
- **No cloud required** - Works completely offline
- **No telemetry** - Your data stays yours
- **Open source** - Audit the code yourself

---

## 🚀 Installation

### Prerequisites

- Python 3.11+
- [Ollama](https://ollama.com/) (for AI features)
- Tesseract OCR (optional, for scanned documents)

### Quick Install

```bash
# Clone the repository
git clone https://github.com/mwaqas-vics/VicsSearch.git
cd VicsSearch

# Install
pip install -e .

# Initialize
docsearch init

# Start the web UI
./run.sh serve
```

Open http://localhost:8080 in your browser.

### Install with AI Features

```bash
# Install Ollama
curl -fsSL https://ollama.com/install.sh | sh

# Download required models
ollama pull llama3.2
ollama pull nomic-embed-text

# Install VicsSearch with RAG support
pip install -e ".[rag]"
```

### macOS Additional Setup

```bash
# Install Tesseract for OCR support
brew install tesseract

# If using port 5000 conflicts with AirPlay
# The app runs on port 8080 by default
```

### Windows Installation

See [WINDOWS_INSTALL.md](WINDOWS_INSTALL.md) for detailed Windows setup instructions.

---

## 📖 Quick Start

### 1. Add Folders to Index

Open http://localhost:8080, go to **Settings**, and add folders you want to search.

Or via CLI:
```bash
docsearch reindex ~/Documents ~/Projects
```

### 2. Search Your Documents

Type your query and press Enter:
- `contract payment terms` - keyword search
- `"state of texas"` - exact phrase
- `type:pdf after:2023-01-01` - with filters

### 3. Ask AI Questions

Click **Ask AI** and type a natural language question:
- "What are the payment terms in our vendor contracts?"
- "Summarize the key points from the Q3 report"
- "Find documents mentioning Project Alpha"

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `/` | Focus search |
| `Enter` | Search |
| `⇧ Enter` | Ask AI |
| `⌘/Ctrl + K` | Command palette |
| `Esc` | Close panel |

---

## 🛠️ CLI Commands

```bash
# Search
docsearch search "contract texas"
docsearch ask "What are the payment terms?"

# Indexing
docsearch reindex              # Reindex all folders
docsearch reindex ~/Documents  # Index specific folder

# Server
docsearch serve                # Start web server (port 8080)
docsearch watch                # Watch folders for changes

# Status
docsearch status               # Show index statistics
docsearch rag-status           # Show AI system status
```

---

## 📡 API

VicsSearch provides a REST API for integration:

```bash
# Search
curl "http://localhost:8080/api/search?q=contract"

# Ask AI
curl -X POST http://localhost:8080/api/rag/ask \
  -H "Content-Type: application/json" \
  -d '{"question": "What are the payment terms?"}'

# Status
curl http://localhost:8080/api/status
```

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/search?q=...` | Search documents |
| GET | `/api/suggest?q=...` | Get search suggestions |
| GET | `/api/status` | Index statistics |
| GET | `/api/documents/{id}` | Get document details |
| POST | `/api/documents/{id}/open` | Open document in system |
| POST | `/api/rag/ask` | Ask AI a question |
| POST | `/api/index/start` | Start indexing |
| DELETE | `/api/index` | Clear index |

---

## ⚙️ Configuration

Create `~/.config/docsearch/config.toml`:

```toml
[general]
data_dir = "~/.local/share/docsearch"

[watcher]
folders = ["~/Documents", "~/Projects"]
ignore_patterns = ["*.tmp", ".git", "__pycache__"]

[indexer]
workers = 4
max_file_size_mb = 500

[rag]
llm_provider = "ollama"
ollama_model = "llama3.2"
embedding_model = "nomic-embed-text"
```

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Web UI                                │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      FastAPI Server                          │
├─────────────────────┬─────────────────┬─────────────────────┤
│    Search API       │    RAG API      │    Index API        │
└─────────────────────┴─────────────────┴─────────────────────┘
          │                    │                    │
          ▼                    ▼                    ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│  SQLite FTS5    │  │  Vector Store   │  │   Job Queue     │
│  (BM25 Search)  │  │  (Embeddings)   │  │   (Indexing)    │
└─────────────────┘  └─────────────────┘  └─────────────────┘
                              │
                              ▼
                     ┌─────────────────┐
                     │     Ollama      │
                     │  (Local LLM)    │
                     └─────────────────┘
```

---

## 📊 Query Syntax

| Syntax | Example | Description |
|--------|---------|-------------|
| Keywords | `contract texas` | Both words required |
| Phrases | `"state of texas"` | Exact phrase |
| AND | `contract AND texas` | Both terms required |
| OR | `contract OR agreement` | Either term |
| NOT | `contract NOT amendment` | Exclude term |
| filename | `filename:report` | Search filename |
| type | `type:pdf` | Filter by type |
| author | `author:smith` | Filter by author |
| after | `after:2022-01-01` | Date filter |
| before | `before:2023-12-31` | Date filter |

**Example**: `filename:contract "state of texas" type:pdf after:2022-01-01`

---

## 🤝 Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### Development Setup

```bash
# Clone and setup
git clone https://github.com/mwaqas-vics/VicsSearch.git
cd VicsSearch
pip install -e ".[dev]"

# Run tests
pytest

# Format code
ruff format src/
```

---

## 🐛 Troubleshooting

See [TROUBLESHOOTING.md](TROUBLESHOOTING.md) for common issues and solutions.

**Common Issues:**
- Port 5000 conflict on macOS → Use port 8080 (default)
- Ollama not running → Start with `ollama serve`
- OCR not working → Install Tesseract: `brew install tesseract`

---

## 📜 License

[MIT License](LICENSE) © 2025 Muhammad Waqas

---

## 🙏 Acknowledgments

- [SQLite FTS5](https://www.sqlite.org/fts5.html) for full-text search
- [Ollama](https://ollama.com/) for local LLM inference
- [FastAPI](https://fastapi.tiangolo.com/) for the API server
- [PyMuPDF](https://pymupdf.readthedocs.io/) for PDF extraction

---

<div align="center">

**[⬆ Back to Top](#-vicssearch)**

</div>
