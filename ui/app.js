// VicsSearch - Enterprise Document Search
// Version 2.1 - Clean release

const API = '/api';

// Application State
const state = {
    query: '',
    mode: 'search',
    results: [],
    selectedResult: null,
    aiContext: [],
    savedSearches: [],
    recentSearches: [],
    folders: [],
    currentBrowsePath: '/'
};

// File Type Icons
const ICONS = {
    pdf: '📄', docx: '📝', doc: '📝', txt: '📃', md: '📑', html: '🌐',
    xlsx: '📊', xls: '📊', csv: '📊', json: '📋', xml: '📋',
    png: '🖼️', jpg: '🖼️', jpeg: '🖼️', gif: '🖼️', default: '📁'
};

// ============================================
// INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', function() {
    console.log('VicsSearch initializing...');
    
    // Load saved data from localStorage
    try {
        state.savedSearches = JSON.parse(localStorage.getItem('savedSearches') || '[]');
        state.recentSearches = JSON.parse(localStorage.getItem('recentSearches') || '[]');
    } catch (e) {
        console.error('Error loading saved data:', e);
    }
    
    // Initialize theme
    initTheme();
    
    // Initialize search input
    var searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                performSearch();
            } else if (e.key === 'Enter' && e.shiftKey) {
                e.preventDefault();
                setSearchMode('ai');
                performSearch();
            }
        });
    }
    
    // Initialize keyboard shortcuts
    document.addEventListener('keydown', function(e) {
        // Focus search with /
        if (e.key === '/' && !isInputFocused()) {
            e.preventDefault();
            var input = document.getElementById('search-input');
            if (input) input.focus();
        }
        // Command palette with Cmd/Ctrl + K
        if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
            e.preventDefault();
            toggleCommandPalette();
        }
        // Close with Escape
        if (e.key === 'Escape') {
            closeAllModals();
            closePreview();
        }
    });
    
    // Render UI
    renderRecentSearches();
    renderSavedSearches();
    renderFolders();
    loadStats();
    
    console.log('VicsSearch ready');
});

function isInputFocused() {
    var el = document.activeElement;
    return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA');
}

// ============================================
// THEME
// ============================================

function initTheme() {
    var theme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', theme);
}

function toggleTheme() {
    var current = document.documentElement.getAttribute('data-theme');
    var next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
    showToast('Theme: ' + next, 'info');
}

// ============================================
// VIEW SWITCHING
// ============================================

function switchView(view, preserveInput) {
    console.log('Switching to view:', view);
    
    // Update nav buttons
    document.querySelectorAll('.nav-btn').forEach(function(btn) {
        btn.classList.toggle('active', btn.getAttribute('data-view') === view);
    });
    
    // Update views
    document.querySelectorAll('.view').forEach(function(v) {
        v.classList.toggle('active', v.id === 'view-' + view);
    });
    
    // View-specific actions
    if (view === 'settings') {
        loadStats();
    }
    if (view === 'search' && !preserveInput) {
        // Reset search view only if not preserving input
        var searchInput = document.getElementById('search-input');
        if (searchInput) searchInput.value = '';
        
        var aiSection = document.getElementById('ai-answer-section');
        if (aiSection) aiSection.classList.add('hidden');
        
        var emptyState = document.getElementById('empty-state');
        if (emptyState) emptyState.classList.remove('hidden');
        
        var resultsList = document.getElementById('results-list');
        if (resultsList) {
            var cards = resultsList.querySelectorAll('.result-card');
            cards.forEach(function(c) { c.remove(); });
        }
        
        var header = document.getElementById('search-header');
        if (header) header.classList.remove('collapsed');
        
        var resultsCount = document.getElementById('results-count');
        if (resultsCount) resultsCount.textContent = 'Ready to search';
        
        var resultsTime = document.getElementById('results-time');
        if (resultsTime) resultsTime.textContent = '';
        
        closePreview();
    }
}

// ============================================
// SEARCH MODE
// ============================================

function setSearchMode(mode) {
    console.log('Setting search mode:', mode);
    
    // If mode is changing, clear previous results
    if (state.mode !== mode) {
        clearAllResults();
    }
    
    state.mode = mode;
    
    document.querySelectorAll('.mode-chip').forEach(function(chip) {
        chip.classList.toggle('active', chip.getAttribute('data-mode') === mode);
    });
    
    var searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.placeholder = mode === 'ai' 
            ? 'Ask a question about your documents...' 
            : 'Search your documents...';
    }
}

// Clear all results (both search and AI)
function clearAllResults() {
    // Clear search results
    var resultsList = document.getElementById('results-list');
    if (resultsList) {
        var cards = resultsList.querySelectorAll('.result-card');
        cards.forEach(function(card) { card.remove(); });
        
        var noResults = resultsList.querySelectorAll('.empty-state:not(#empty-state)');
        noResults.forEach(function(el) { el.remove(); });
    }
    
    // Hide AI section
    var aiSection = document.getElementById('ai-answer-section');
    if (aiSection) aiSection.classList.add('hidden');
    
    // Reset results count
    var resultsCount = document.getElementById('results-count');
    if (resultsCount) resultsCount.textContent = 'Ready to search';
    
    var resultsTime = document.getElementById('results-time');
    if (resultsTime) resultsTime.textContent = '';
    
    // Show empty state
    var emptyState = document.getElementById('empty-state');
    if (emptyState) emptyState.classList.remove('hidden');
    
    // Clear state
    state.results = [];
    state.selectedResult = null;
    
    closePreview();
}

// ============================================
// SEARCH
// ============================================

function performSearch() {
    var searchInput = document.getElementById('search-input');
    if (!searchInput) return;
    
    var query = searchInput.value.trim();
    if (!query) {
        showToast('Please enter a search query', 'error');
        return;
    }
    
    console.log('Performing search:', query, 'mode:', state.mode);
    state.query = query;
    addToRecent(query);
    
    // Clear ALL previous results first
    clearAllResults();
    
    // Hide empty state, show skeleton
    var emptyState = document.getElementById('empty-state');
    if (emptyState) emptyState.classList.add('hidden');
    
    var skeleton = document.getElementById('skeleton-loader');
    if (skeleton) skeleton.classList.remove('hidden');
    
    if (state.mode === 'ai') {
        askAI(query);
    } else {
        search(query);
    }
}

function search(query) {
    console.log('Executing search:', query);
    
    var skeleton = document.getElementById('skeleton-loader');
    var aiSection = document.getElementById('ai-answer-section');
    if (aiSection) aiSection.classList.add('hidden');
    
    var url = API + '/search?q=' + encodeURIComponent(query) + '&size=20';
    console.log('Fetching:', url);
    
    fetch(url)
        .then(function(response) {
            console.log('Response status:', response.status);
            if (!response.ok) {
                throw new Error('Server returned ' + response.status);
            }
            return response.json();
        })
        .then(function(data) {
            console.log('Search results:', data);
            state.results = data.results || [];
            if (skeleton) skeleton.classList.add('hidden');
            renderResults(data);
            collapseHeader();
        })
        .catch(function(err) {
            console.error('Search error:', err);
            if (skeleton) skeleton.classList.add('hidden');
            var emptyState = document.getElementById('empty-state');
            if (emptyState) emptyState.classList.remove('hidden');
            showToast('Search failed: ' + err.message, 'error');
        });
}

function askAI(query) {
    console.log('Asking AI:', query);
    
    var skeleton = document.getElementById('skeleton-loader');
    if (skeleton) skeleton.classList.add('hidden');
    
    // Clear any previous search results
    var resultsList = document.getElementById('results-list');
    if (resultsList) {
        var cards = resultsList.querySelectorAll('.result-card');
        cards.forEach(function(card) { card.remove(); });
    }
    
    // Update header
    var resultsCount = document.getElementById('results-count');
    if (resultsCount) resultsCount.textContent = 'AI Answer';
    
    var resultsTime = document.getElementById('results-time');
    if (resultsTime) resultsTime.textContent = '';
    
    // Show thinking animation
    var thinking = document.getElementById('ai-thinking');
    if (thinking) thinking.classList.remove('hidden');
    
    // Show AI section
    var aiSection = document.getElementById('ai-answer-section');
    if (aiSection) aiSection.classList.remove('hidden');
    
    fetch(API + '/rag/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            question: query,
            stream: false
        })
    })
    .then(function(response) {
        console.log('AI response status:', response.status);
        if (!response.ok) {
            return response.json().then(function(data) {
                throw new Error(data.detail || 'Server returned ' + response.status);
            });
        }
        return response.json();
    })
    .then(function(data) {
        console.log('AI response:', data);
        if (thinking) thinking.classList.add('hidden');
        if (resultsTime) resultsTime.textContent = data.took_ms + 'ms';
        state.aiContext.push({ q: query, a: data.answer });
        renderAIResponse(data);
        collapseHeader();
    })
    .catch(function(err) {
        console.error('AI error:', err);
        if (thinking) thinking.classList.add('hidden');
        var body = document.getElementById('ai-response-body');
        if (body) {
            body.innerHTML = '<p style="color: var(--error);">Error: ' + escapeHtml(err.message) + '</p>';
        }
        showToast('AI request failed: ' + err.message, 'error');
    });
}

// ============================================
// RENDER RESULTS
// ============================================

function renderResults(data) {
    console.log('Rendering results:', data.total);
    
    var resultsCount = document.getElementById('results-count');
    if (resultsCount) resultsCount.textContent = data.total + ' results';
    
    var resultsTime = document.getElementById('results-time');
    if (resultsTime) resultsTime.textContent = data.took_ms + 'ms';
    
    var resultsList = document.getElementById('results-list');
    if (!resultsList) return;
    
    if (!data.results || data.results.length === 0) {
        resultsList.innerHTML = '<div class="empty-state"><p>No results found for "' + escapeHtml(state.query) + '"</p></div>';
        return;
    }
    
    // Render each result
    data.results.forEach(function(r, i) {
        var card = document.createElement('div');
        card.className = 'result-card';
        card.setAttribute('data-index', i);
        card.onclick = function() { selectResult(i); };
        
        var icon = ICONS[r.file_type] || ICONS.default;
        var path = formatPath(r.file_path);
        var size = formatFileSize(r.size_bytes);
        var date = r.modified_date ? formatDate(r.modified_date * 1000) : '';
        var score = Math.min(r.score * 100, 100);
        
        card.innerHTML = 
            '<div class="result-header">' +
                '<div class="result-icon ' + r.file_type + '">' + icon + '</div>' +
                '<div class="result-main">' +
                    '<div class="result-title">' + escapeHtml(r.filename) + '</div>' +
                    '<div class="result-path">' + escapeHtml(path) + '</div>' +
                '</div>' +
                '<div class="result-badges">' +
                    '<span class="badge badge-type">' + r.file_type.toUpperCase() + '</span>' +
                '</div>' +
            '</div>' +
            '<div class="result-meta">' +
                (r.page_count ? '<span>📄 ' + r.page_count + ' pages</span>' : '') +
                '<span>📁 ' + size + '</span>' +
                (date ? '<span>🕐 ' + date + '</span>' : '') +
            '</div>' +
            (r.snippets && r.snippets.length ? '<div class="result-snippet">' + r.snippets[0] + '</div>' : '') +
            '<div class="result-score-bar">' +
                '<div class="score-bar"><div class="score-fill" style="width: ' + score + '%"></div></div>' +
                '<div class="score-label"><span>Relevance</span><span>' + score.toFixed(0) + '%</span></div>' +
            '</div>' +
            '<div class="result-footer">' +
                '<span class="why-match" onclick="event.stopPropagation(); showWhyMatch(' + i + ')">Why this matched?</span>' +
                '<div class="result-actions">' +
                    '<button class="icon-btn-sm" onclick="event.stopPropagation(); openFile(' + r.id + ')" title="Open file">' +
                        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>' +
                    '</button>' +
                    '<button class="icon-btn-sm" onclick="event.stopPropagation(); copyToClipboard(\'' + escapeAttr(r.file_path) + '\')" title="Copy path">' +
                        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>' +
                    '</button>' +
                '</div>' +
            '</div>';
        
        resultsList.appendChild(card);
    });
}

function renderAIResponse(data) {
    console.log('Rendering AI response');
    
    var body = document.getElementById('ai-response-body');
    if (body) {
        body.innerHTML = formatAIText(data.answer || 'No response received.');
    }
    
    var citations = document.getElementById('ai-citations');
    if (citations) {
        if (data.sources && data.sources.length > 0) {
            var html = '<div class="ai-citations-title">📚 Sources (' + data.sources.length + ')</div>';
            data.sources.forEach(function(s) {
                var icon = ICONS[s.file_path.split('.').pop()] || ICONS.default;
                html += '<span class="citation-chip" onclick="openFile(' + s.doc_id + ')">' + icon + ' ' + escapeHtml(s.filename) + '</span>';
            });
            citations.innerHTML = html;
            citations.classList.remove('hidden');
        } else {
            citations.innerHTML = '';
            citations.classList.add('hidden');
        }
    }
}

function formatAIText(text) {
    if (!text) return '';
    var parts = text.split('\n\n');
    var html = '';
    for (var i = 0; i < parts.length; i++) {
        html += '<p>' + escapeHtml(parts[i]).replace(/\n/g, '<br>') + '</p>';
    }
    return html;
}

// ============================================
// PREVIEW PANEL
// ============================================

function selectResult(index) {
    console.log('Selecting result:', index);
    state.selectedResult = index;
    
    document.querySelectorAll('.result-card').forEach(function(card, i) {
        card.classList.toggle('selected', i === index);
    });
    
    var doc = state.results[index];
    if (doc) {
        showPreview(doc);
    }
}

function showPreview(doc) {
    console.log('Showing preview for:', doc.filename);
    
    var panel = document.getElementById('preview-panel');
    if (panel) panel.classList.remove('hidden');
    
    var title = document.getElementById('preview-title');
    if (title) title.textContent = doc.filename;
    
    var meta = document.getElementById('preview-meta');
    if (meta) {
        meta.innerHTML = '<span>Type: ' + doc.file_type.toUpperCase() + '</span>' +
            (doc.page_count ? '<span>Pages: ' + doc.page_count + '</span>' : '') +
            '<span>Size: ' + formatFileSize(doc.size_bytes) + '</span>';
    }
    
    loadPreviewContent(doc.id);
}

function loadPreviewContent(docId) {
    var content = document.getElementById('preview-content');
    if (!content) return;
    
    content.innerHTML = '<p style="color: var(--text-muted)">Loading preview...</p>';
    
    fetch(API + '/documents/' + docId)
        .then(function(response) {
            if (!response.ok) throw new Error('Failed to load');
            return response.json();
        })
        .then(function(data) {
            var text = escapeHtml(data.content || 'No content available');
            
            // Highlight search terms
            if (state.query) {
                var terms = state.query.split(/\s+/).filter(function(t) { return t.length > 2; });
                terms.forEach(function(term) {
                    var regex = new RegExp('(' + escapeRegex(term) + ')', 'gi');
                    text = text.replace(regex, '<mark>$1</mark>');
                });
            }
            
            content.innerHTML = text;
        })
        .catch(function(err) {
            console.error('Preview error:', err);
            content.innerHTML = '<p style="color: var(--error)">Failed to load preview</p>';
        });
}

function closePreview() {
    var panel = document.getElementById('preview-panel');
    if (panel) panel.classList.add('hidden');
    
    state.selectedResult = null;
    document.querySelectorAll('.result-card').forEach(function(card) {
        card.classList.remove('selected');
    });
}

function openInSystem() {
    if (state.selectedResult !== null && state.results[state.selectedResult]) {
        openFile(state.results[state.selectedResult].id);
    }
}

// ============================================
// FILE OPERATIONS
// ============================================

function openFile(docId) {
    console.log('Opening file:', docId);
    fetch(API + '/documents/' + docId + '/open', { method: 'POST' })
        .then(function(response) {
            if (response.ok) {
                showToast('Opening file...', 'success');
            } else {
                throw new Error('Failed to open');
            }
        })
        .catch(function(err) {
            showToast('Failed to open file', 'error');
        });
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(function() {
        showToast('Copied to clipboard', 'success');
    }).catch(function() {
        showToast('Failed to copy', 'error');
    });
}

function copyAIAnswer() {
    var body = document.getElementById('ai-response-body');
    if (body) {
        copyToClipboard(body.textContent);
    }
}

function exportAIAnswer(format) {
    var body = document.getElementById('ai-response-body');
    if (!body) return;
    
    var content = '# AI Answer\n\n**Query:** ' + state.query + '\n\n' + body.textContent;
    downloadFile('ai-answer.' + format, content);
    showToast('Exported', 'success');
}

function showWhyMatch(index) {
    var result = state.results[index];
    if (!result) return;
    
    var modal = document.createElement('div');
    modal.className = 'modal';
    modal.onclick = function(e) { if (e.target === modal) modal.remove(); };
    modal.innerHTML = 
        '<div class="modal-backdrop"></div>' +
        '<div class="modal-content">' +
            '<div class="modal-header">' +
                '<h3>Why This Matched</h3>' +
                '<button class="icon-btn" onclick="this.closest(\'.modal\').remove()">' +
                    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
                '</button>' +
            '</div>' +
            '<div style="padding: 20px;">' +
                '<p><strong>File:</strong> ' + escapeHtml(result.filename) + '</p>' +
                '<p><strong>Score:</strong> ' + (result.score * 100).toFixed(1) + '%</p>' +
                '<p><strong>Query:</strong> "' + escapeHtml(state.query) + '"</p>' +
                '<p><strong>Match Type:</strong> Full-text search (BM25)</p>' +
                (result.snippets && result.snippets.length ? '<p><strong>Context:</strong></p><div class="result-snippet" style="margin-top:8px">' + result.snippets[0] + '</div>' : '') +
            '</div>' +
        '</div>';
    document.body.appendChild(modal);
}

// ============================================
// AI FOLLOWUP
// ============================================

function handleFollowup(e) {
    if (e.key === 'Enter') {
        sendFollowup();
    }
}

function sendFollowup() {
    var input = document.getElementById('ai-followup');
    if (!input) return;
    
    var query = input.value.trim();
    if (!query) return;
    
    input.value = '';
    state.query = query;
    addToRecent(query);
    
    askAI(query);
}

// ============================================
// RECENT & SAVED SEARCHES
// ============================================

function addToRecent(query) {
    state.recentSearches = [query].concat(
        state.recentSearches.filter(function(q) { return q !== query; })
    ).slice(0, 5);
    
    localStorage.setItem('recentSearches', JSON.stringify(state.recentSearches));
    renderRecentSearches();
}

function renderRecentSearches() {
    var container = document.getElementById('recent-searches');
    if (!container) return;
    
    if (state.recentSearches.length === 0) {
        container.innerHTML = '<div style="padding: 8px; font-size: 0.75rem; color: var(--text-muted)">No recent searches</div>';
        return;
    }
    
    var html = '';
    state.recentSearches.forEach(function(q) {
        html += '<div class="recent-item" onclick="useSearch(\'' + escapeAttr(q) + '\')">' + escapeHtml(q) + '</div>';
    });
    container.innerHTML = html;
}

function renderSavedSearches() {
    var container = document.getElementById('saved-searches');
    if (!container) return;
    
    if (state.savedSearches.length === 0) {
        container.innerHTML = '<div style="padding: 8px; font-size: 0.75rem; color: var(--text-muted)">No saved searches</div>';
        return;
    }
    
    var html = '';
    state.savedSearches.forEach(function(s) {
        html += '<div class="saved-item" onclick="useSearch(\'' + escapeAttr(s.query) + '\')">' + escapeHtml(s.name || s.query) + '</div>';
    });
    container.innerHTML = html;
}

function useSearch(query) {
    // Switch to search view but preserve input
    switchView('search', true);
    
    // Set the query
    var searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.value = query;
    }
    
    // Now perform search
    performSearch();
}

function saveCurrentSearch() {
    if (!state.query) {
        showToast('Search something first', 'error');
        return;
    }
    
    var name = prompt('Name this search:', state.query);
    if (name) {
        state.savedSearches.push({ name: name, query: state.query });
        localStorage.setItem('savedSearches', JSON.stringify(state.savedSearches));
        renderSavedSearches();
        showToast('Search saved', 'success');
    }
}

// ============================================
// EXPORT
// ============================================

function exportResults(format) {
    if (state.results.length === 0) {
        showToast('No results to export', 'error');
        return;
    }
    
    if (format === 'json') {
        downloadFile('results.json', JSON.stringify(state.results, null, 2));
    } else if (format === 'csv') {
        var headers = ['filename', 'file_path', 'file_type', 'score'];
        var rows = state.results.map(function(r) {
            return [r.filename, r.file_path, r.file_type, r.score].map(function(v) {
                return '"' + String(v).replace(/"/g, '""') + '"';
            }).join(',');
        });
        downloadFile('results.csv', headers.join(',') + '\n' + rows.join('\n'));
    }
    
    showToast('Exported as ' + format.toUpperCase(), 'success');
}

function downloadFile(name, content) {
    var blob = new Blob([content], { type: 'text/plain' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
}

// ============================================
// SETTINGS & INDEXING
// ============================================

function loadStats() {
    fetch(API + '/status')
        .then(function(response) {
            if (!response.ok) return;
            return response.json();
        })
        .then(function(data) {
            if (!data) return;
            
            var docs = document.getElementById('stat-docs');
            var chunks = document.getElementById('stat-chunks');
            var pending = document.getElementById('stat-pending');
            var errors = document.getElementById('stat-errors');
            
            if (docs) docs.textContent = data.indexed_count || 0;
            if (chunks) chunks.textContent = data.chunks || 0;
            if (pending) pending.textContent = data.pending || 0;
            if (errors) errors.textContent = data.failed || 0;
        })
        .catch(function(err) {
            console.error('Failed to load stats:', err);
        });
}

function startIndexing() {
    if (state.folders.length === 0) {
        showToast('Add folders first', 'error');
        return;
    }
    
    var btn = document.getElementById('btn-index');
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Indexing...';
    }
    
    var progress = document.getElementById('index-progress');
    if (progress) progress.classList.remove('hidden');
    
    var promises = state.folders.map(function(folder) {
        return fetch(API + '/index/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: folder })
        });
    });
    
    Promise.all(promises)
        .then(function() {
            pollProgress();
        })
        .catch(function(err) {
            showToast('Indexing failed: ' + err.message, 'error');
            if (btn) {
                btn.disabled = false;
                btn.textContent = 'Start Indexing';
            }
        });
}

function pollProgress() {
    var interval = setInterval(function() {
        fetch(API + '/status')
            .then(function(r) { return r.json(); })
            .then(function(data) {
                var total = (data.pending || 0) + (data.indexed_count || 0);
                var done = data.indexed_count || 0;
                var pct = total > 0 ? Math.round((done / total) * 100) : 0;
                
                var fill = document.getElementById('progress-fill');
                if (fill) fill.style.width = pct + '%';
                
                var text = document.getElementById('progress-text');
                if (text) text.textContent = pct + '%';
                
                loadStats();
                
                if (data.pending === 0) {
                    clearInterval(interval);
                    
                    var progress = document.getElementById('index-progress');
                    if (progress) progress.classList.add('hidden');
                    
                    var btn = document.getElementById('btn-index');
                    if (btn) {
                        btn.disabled = false;
                        btn.textContent = 'Start Indexing';
                    }
                    
                    showToast('Indexed ' + done + ' documents', 'success');
                }
            })
            .catch(function(err) {
                console.error('Poll error:', err);
            });
    }, 1000);
}

function clearIndex() {
    if (!confirm('Clear all indexed documents? This cannot be undone.')) return;
    
    fetch(API + '/index', { method: 'DELETE' })
        .then(function() {
            loadStats();
            showToast('Index cleared', 'success');
        })
        .catch(function(err) {
            showToast('Failed to clear: ' + err.message, 'error');
        });
}

function viewErrors() {
    fetch(API + '/index/errors')
        .then(function(r) { return r.json(); })
        .then(function(data) {
            if (!data.errors || data.errors.length === 0) {
                showToast('No errors!', 'success');
                return;
            }
            
            var modal = document.createElement('div');
            modal.className = 'modal';
            modal.onclick = function(e) { if (e.target === modal) modal.remove(); };
            
            var errorsHtml = '';
            data.errors.forEach(function(e) {
                errorsHtml += '<div style="padding: 10px; background: var(--bg-elevated); border-radius: 6px; margin-bottom: 8px; border-left: 3px solid var(--error);">' +
                    '<div style="font-weight: 500; word-break: break-all;">' + escapeHtml(e.file_path.split('/').pop()) + '</div>' +
                    '<div style="font-size: 0.8rem; color: var(--error);">' + escapeHtml(e.error || 'Unknown') + '</div>' +
                '</div>';
            });
            
            modal.innerHTML = 
                '<div class="modal-backdrop"></div>' +
                '<div class="modal-content" style="max-width: 600px;">' +
                    '<div class="modal-header">' +
                        '<h3>Errors (' + data.errors.length + ')</h3>' +
                        '<button class="icon-btn" onclick="this.closest(\'.modal\').remove()">' +
                            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
                        '</button>' +
                    '</div>' +
                    '<div style="padding: 16px; max-height: 400px; overflow-y: auto;">' + errorsHtml + '</div>' +
                '</div>';
            document.body.appendChild(modal);
        })
        .catch(function(err) {
            showToast('Failed to load errors', 'error');
        });
}

// ============================================
// FOLDER MANAGEMENT
// ============================================

function openFolderBrowser() {
    var modal = document.getElementById('folder-modal');
    if (modal) modal.classList.remove('hidden');
    navigateTo('/');
}

function closeFolderModal() {
    var modal = document.getElementById('folder-modal');
    if (modal) modal.classList.add('hidden');
}

function navigateTo(path) {
    state.currentBrowsePath = path;
    
    var list = document.getElementById('folder-browser-list');
    if (list) list.innerHTML = '<div style="padding: 20px; color: var(--text-muted)">Loading...</div>';
    
    fetch(API + '/folders/browse?path=' + encodeURIComponent(path))
        .then(function(response) {
            if (!response.ok) throw new Error('Failed to browse');
            return response.json();
        })
        .then(function(data) {
            // Update breadcrumb
            var breadcrumb = document.getElementById('folder-breadcrumb');
            if (breadcrumb) {
                var parts = path.split('/').filter(Boolean);
                var html = '<span onclick="navigateTo(\'/\')" style="cursor:pointer;color:var(--accent)">Home</span>';
                
                parts.forEach(function(p, i) {
                    var fullPath = '/' + parts.slice(0, i + 1).join('/');
                    html += ' / <span onclick="navigateTo(\'' + fullPath + '\')" style="cursor:pointer">' + p + '</span>';
                });
                
                breadcrumb.innerHTML = html;
            }
            
            // Update folder list
            if (list) {
                if (!data.folders || data.folders.length === 0) {
                    list.innerHTML = '<div style="padding: 20px; color: var(--text-muted)">No subfolders</div>';
                } else {
                    var html = '';
                    data.folders.forEach(function(f) {
                        html += '<div class="folder-item-browse" onclick="navigateTo(\'' + escapeAttr(f.path) + '\')">' +
                            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>' +
                            '<span>' + escapeHtml(f.name) + '</span>' +
                        '</div>';
                    });
                    list.innerHTML = html;
                }
            }
        })
        .catch(function(err) {
            if (list) list.innerHTML = '<div style="padding: 20px; color: var(--error)">Error: ' + err.message + '</div>';
        });
}

function selectFolder() {
    if (state.folders.indexOf(state.currentBrowsePath) === -1) {
        state.folders.push(state.currentBrowsePath);
        renderFolders();
    }
    closeFolderModal();
    showToast('Folder added: ' + state.currentBrowsePath, 'success');
}

function renderFolders() {
    var list = document.getElementById('folders-list');
    var dropZone = document.getElementById('drop-zone');
    
    if (state.folders.length === 0) {
        if (dropZone) dropZone.style.display = 'block';
        return;
    }
    
    if (dropZone) dropZone.style.display = 'none';
    
    if (list) {
        var html = '';
        state.folders.forEach(function(f, i) {
            html += '<div class="folder-item">' +
                '<span style="word-break:break-all">' + escapeHtml(f) + '</span>' +
                '<button onclick="removeFolder(' + i + ')" style="font-size:18px;background:none;border:none;color:var(--text-muted);cursor:pointer">×</button>' +
            '</div>';
        });
        list.innerHTML = html;
    }
}

function removeFolder(index) {
    state.folders.splice(index, 1);
    renderFolders();
}

function handleDragOver(e) {
    e.preventDefault();
    e.currentTarget.classList.add('dragover');
}

function handleDragLeave(e) {
    e.currentTarget.classList.remove('dragover');
}

function handleDrop(e) {
    e.preventDefault();
    e.currentTarget.classList.remove('dragover');
    showToast('Use "Add Folder" button', 'info');
}

// ============================================
// COMMAND PALETTE
// ============================================

function toggleCommandPalette() {
    var modal = document.getElementById('command-palette');
    if (!modal) return;
    
    modal.classList.toggle('hidden');
    
    if (!modal.classList.contains('hidden')) {
        var input = document.getElementById('command-input');
        if (input) {
            input.value = '';
            input.focus();
        }
        renderCommands();
    }
}

function closeCommandPalette() {
    var modal = document.getElementById('command-palette');
    if (modal) modal.classList.add('hidden');
}

function renderCommands(filter) {
    filter = filter || '';
    
    var commands = [
        { icon: '🔍', name: 'Search documents', action: 'focusSearch' },
        { icon: '🤖', name: 'Ask AI', action: 'askAI' },
        { icon: '📁', name: 'Add folder', action: 'addFolder' },
        { icon: '⚙️', name: 'Settings', action: 'openSettings' },
        { icon: '🌓', name: 'Toggle theme', action: 'toggleTheme' },
        { icon: '📋', name: 'Export results', action: 'exportJSON' },
        { icon: '💾', name: 'Save search', action: 'saveSearch' }
    ].filter(function(c) {
        return c.name.toLowerCase().indexOf(filter.toLowerCase()) !== -1;
    });
    
    var list = document.getElementById('command-list');
    if (list) {
        var html = '';
        commands.forEach(function(c) {
            html += '<div class="command-item" onclick="executeCommand(\'' + c.action + '\')">' +
                '<span>' + c.icon + '</span>' +
                '<span>' + c.name + '</span>' +
            '</div>';
        });
        list.innerHTML = html;
    }
}

function executeCommand(action) {
    closeCommandPalette();
    
    switch (action) {
        case 'focusSearch':
            switchView('search');
            var input = document.getElementById('search-input');
            if (input) input.focus();
            break;
        case 'askAI':
            switchView('search');
            setSearchMode('ai');
            var input2 = document.getElementById('search-input');
            if (input2) input2.focus();
            break;
        case 'addFolder':
            switchView('settings');
            openFolderBrowser();
            break;
        case 'openSettings':
            switchView('settings');
            break;
        case 'toggleTheme':
            toggleTheme();
            break;
        case 'exportJSON':
            exportResults('json');
            break;
        case 'saveSearch':
            saveCurrentSearch();
            break;
    }
}

function filterCommands(value) {
    renderCommands(value);
}

// ============================================
// MODALS
// ============================================

function closeAllModals() {
    document.querySelectorAll('.modal').forEach(function(m) {
        m.classList.add('hidden');
    });
}

function showKeyboardShortcuts() {
    var modal = document.getElementById('shortcuts-modal');
    if (modal) modal.classList.remove('hidden');
}

function closeShortcutsModal() {
    var modal = document.getElementById('shortcuts-modal');
    if (modal) modal.classList.add('hidden');
}

// ============================================
// UI HELPERS
// ============================================

function collapseHeader() {
    var header = document.getElementById('search-header');
    if (header) header.classList.add('collapsed');
}

function showToast(message, type) {
    type = type || 'info';
    
    var container = document.getElementById('toast-container');
    if (!container) return;
    
    var toast = document.createElement('div');
    toast.className = 'toast ' + type;
    toast.innerHTML = '<span>' + escapeHtml(message) + '</span><button onclick="this.parentElement.remove()">×</button>';
    
    container.appendChild(toast);
    
    setTimeout(function() {
        if (toast.parentElement) toast.remove();
    }, 4000);
}

// ============================================
// UTILITIES
// ============================================

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function escapeAttr(str) {
    if (!str) return '';
    return String(str)
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'")
        .replace(/"/g, '\\"')
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r');
}

function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function formatPath(path) {
    if (!path) return '';
    var parts = path.split('/');
    if (parts.length <= 3) return path;
    return parts.slice(-3).join(' › ');
}

function formatFileSize(bytes) {
    if (!bytes) return '—';
    var k = 1024;
    var sizes = ['B', 'KB', 'MB', 'GB'];
    var i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatDate(timestamp) {
    if (!timestamp) return '';
    var d = new Date(timestamp);
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}
