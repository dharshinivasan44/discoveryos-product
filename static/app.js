// ===== CONFIGURATION =====
console.log("=== NEW APP.JS LOADED ===");
const API_BASE_URL = 'http://localhost:8000';
const SUPPORTED_EXTENSIONS = ['.txt', '.csv', '.json', '.md', '.vtt', '.srt', '.xlsx', '.xls'];

const state = {
    files: [],
    currentRunId: null,
    currentStrategy: 'Improve Retention',
    currentReport: null,
    isProcessing: false,
    recentAnalyses: [],
    currentPage: 'dashboard'
};

document.addEventListener('DOMContentLoaded', () => {
    console.log('[INIT] DOMContentLoaded fired');
    setupEventListeners();
    loadRecentAnalyses();
    updateDashboardKPIs();
    console.log('[INIT] Initialization complete');
});

function setupEventListeners() {
    console.log('[SETUP] Starting event listener setup');
    
    document.querySelectorAll('.nav-item:not(.disabled)').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const page = item.dataset.page;
            navigateToPage(page);
        });
    });

    document.getElementById('headerUploadBtn').addEventListener('click', () => {
        navigateToPage('upload');
    });

    document.getElementById('quickUpload').addEventListener('click', () => navigateToPage('upload'));
    document.getElementById('quickInsights').addEventListener('click', () => navigateToPage('insights'));
    document.getElementById('quickSummary').addEventListener('click', () => navigateToPage('summary'));

    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');
    
    console.log('[SETUP] Drop zone element:', dropZone ? 'found' : 'NOT FOUND');
    console.log('[SETUP] File input element:', fileInput ? 'found' : 'NOT FOUND');
    
    if (dropZone && fileInput) {
        console.log('[SETUP] Attaching dragover listener to drop zone');
        dropZone.addEventListener('dragover', (e) => {
            console.log('[DROP] dragover event fired');
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.add('dragover');
        });
        
        console.log('[SETUP] Attaching dragleave listener to drop zone');
        dropZone.addEventListener('dragleave', (e) => {
            console.log('[DROP] dragleave event fired');
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.remove('dragover');
        });
        
        console.log('[SETUP] Attaching drop listener to drop zone');
        dropZone.addEventListener('drop', (e) => {
            console.log('[DROP] drop event fired');
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.remove('dragover');
            const files = e.dataTransfer.files;
            console.log('[DROP] Files received:', files.length, Array.from(files).map(f => f.name));
            handleFiles(files);
        });
        
        console.log('[SETUP] Attaching click listener to drop zone');
        dropZone.addEventListener('click', () => {
            console.log('[BROWSE] Drop zone clicked, triggering file input');
            fileInput.click();
        });
        
        console.log('[SETUP] Attaching change listener to file input');
        fileInput.addEventListener('change', (e) => {
            console.log('[BROWSE] File input changed');
            const files = e.target.files;
            console.log('[BROWSE] Files selected:', files.length, Array.from(files).map(f => f.name));
            handleFiles(files);
        });
    } else {
        console.error('[SETUP] Drop zone or file input element not found!');
    }

    const analyzeBtn = document.getElementById('analyzeBtn');
    console.log('[SETUP] Analyze button element:', analyzeBtn ? 'found' : 'NOT FOUND');
    
    if (analyzeBtn) {
        console.log('[SETUP] Attaching click listener to analyze button');
        analyzeBtn.addEventListener('click', (e) => {
            console.log('[ANALYZE] Analyze button clicked');
            uploadAndProcess();
        });
    } else {
        console.error('[SETUP] Analyze button element not found!');
    }
    
    const clearBtn = document.getElementById('clearFilesBtn');
    if (clearBtn) {
        console.log('[SETUP] Attaching click listener to clear button');
        clearBtn.addEventListener('click', clearFiles);
    }

    const strategySelect = document.getElementById('strategySelect');
    if (strategySelect) {
        strategySelect.addEventListener('change', (e) => {
            changeStrategy(e.target.value);
        });
    }
    
    const searchThemes = document.getElementById('searchThemes');
    if (searchThemes) {
        searchThemes.addEventListener('input', filterThemes);
    }
    
    const sortSelect = document.getElementById('sortSelect');
    if (sortSelect) {
        sortSelect.addEventListener('change', sortThemes);
    }
    
    const exportBtn = document.getElementById('exportBtn');
    if (exportBtn) {
        exportBtn.addEventListener('click', exportReport);
    }

    const drawerClose = document.getElementById('drawerClose');
    if (drawerClose) {
        drawerClose.addEventListener('click', closeDrawer);
    }
    
    const themeDrawer = document.getElementById('themeDrawer');
    if (themeDrawer) {
        themeDrawer.addEventListener('click', (e) => {
            if (e.target === themeDrawer) {
                closeDrawer();
            }
        });
    }
    
    console.log('[SETUP] Event listener setup complete');
}

function navigateToPage(page) {
    state.currentPage = page;
    
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });
    
    document.querySelector(`[data-page="${page}"]`).classList.add('active');
    
    const pageId = page === 'summary' ? 'summaryPage' : page === 'help' ? 'helpPage' : `${page}Page`;
    const pageEl = document.getElementById(pageId);
    if (pageEl) {
        pageEl.classList.add('active');
    }
    
    const breadcrumbTexts = {
        dashboard: 'Dashboard',
        upload: 'Upload Feedback',
        insights: 'Insights',
        summary: 'Executive Summary',
        help: 'Help'
    };
    document.getElementById('breadcrumb').textContent = breadcrumbTexts[page] || 'Dashboard';
    
    if (page === 'insights') {
        loadInsightsPage();
    } else if (page === 'summary') {
        loadSummaryPage();
    }
}

async function loadInsightsPage() {
    if (state.currentReport) {
        document.querySelector('.filters-bar').style.display = 'flex';
        document.querySelector('.kpi-section').style.display = 'grid';
        renderInsights();
    } else if (state.currentRunId) {
        try {
            const res = await fetch(`${API_BASE_URL}/report?run_id=${state.currentRunId}`);
            if (res.ok) {
                state.currentReport = await res.json();
                document.querySelector('.filters-bar').style.display = 'flex';
                document.querySelector('.kpi-section').style.display = 'grid';
                renderInsights();
            } else {
                showInsightsEmpty();
            }
        } catch (error) {
            console.error('Error loading report:', error);
            showInsightsEmpty();
        }
    } else {
        showInsightsEmpty();
    }
}

async function loadSummaryPage() {
    if (state.currentReport) {
        renderSummary();
    } else if (state.currentRunId) {
        try {
            const res = await fetch(`${API_BASE_URL}/report?run_id=${state.currentRunId}`);
            if (res.ok) {
                state.currentReport = await res.json();
                renderSummary();
            } else {
                showSummaryEmpty();
            }
        } catch (error) {
            console.error('Error loading report:', error);
            showSummaryEmpty();
        }
    } else {
        showSummaryEmpty();
    }
}

function handleFiles(fileList) {
    console.log('[FILES] handleFiles called with', fileList.length, 'files');
    const errors = [];
    const validFiles = [];
    
    for (const file of fileList) {
        console.log('[FILES] Processing file:', file.name, 'size:', file.size, 'type:', file.type);
        const ext = '.' + file.name.split('.').pop().toLowerCase();
        console.log('[FILES] File extension:', ext, 'supported?', SUPPORTED_EXTENSIONS.includes(ext));
        
        if (!SUPPORTED_EXTENSIONS.includes(ext)) {
            console.log('[FILES] File rejected - unsupported format:', ext);
            errors.push({ filename: file.name, error: `Unsupported format: ${ext}` });
        } else {
            console.log('[FILES] File accepted:', file.name);
            validFiles.push({
                name: file.name,
                size: formatFileSize(file.size),
                type: ext.slice(1).toUpperCase(),
                file: file
            });
        }
    }
    
    console.log('[FILES] Summary - valid:', validFiles.length, 'errors:', errors.length);
    
    if (errors.length > 0) {
        console.log('[FILES] Displaying errors');
        displayErrors(errors);
    }
    
    if (validFiles.length > 0) {
        console.log('[FILES] Adding files to queue:', validFiles.map(f => f.name));
        state.files = validFiles;
        console.log('[FILES] Queue now contains:', state.files.length, 'files');
        renderFilesList();
        document.getElementById('uploadedFilesList').style.display = 'block';
        document.getElementById('analyzeBtn').disabled = false;
        console.log('[FILES] Analyze button enabled');
    }
}

function renderFilesList() {
    console.log('[RENDER] Rendering files list with', state.files.length, 'files');
    const tbody = document.getElementById('filesTableBody');
    tbody.innerHTML = state.files.map((file, idx) => `
        <tr>
            <td>${escapeHtml(file.name)}</td>
            <td>${file.size}</td>
            <td>${file.type}</td>
            <td><span style="color: var(--success);">✓ Ready</span></td>
            <td><button class="file-item-remove" onclick="removeFile(${idx})">✕</button></td>
        </tr>
    `).join('');
}

function removeFile(idx) {
    console.log('[FILES] Removing file at index', idx);
    state.files.splice(idx, 1);
    if (state.files.length === 0) {
        document.getElementById('uploadedFilesList').style.display = 'none';
        document.getElementById('analyzeBtn').disabled = true;
    } else {
        renderFilesList();
    }
}

function clearFiles() {
    console.log('[FILES] Clearing all files');
    state.files = [];
    document.getElementById('uploadedFilesList').style.display = 'none';
    document.getElementById('analyzeBtn').disabled = true;
    document.getElementById('fileInput').value = '';
    console.log('[FILES] Files cleared');
}

function displayErrors(errors) {
    console.log('[ERRORS] Displaying', errors.length, 'errors');
    const errEl = document.getElementById('uploadErrors');
    errEl.innerHTML = '<strong>⚠ Errors:</strong><br>' + 
        errors.map(e => `${escapeHtml(e.filename)}: ${escapeHtml(e.error)}`).join('<br>');
    errEl.style.display = 'block';
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 10) / 10 + ' ' + sizes[i];
}

async function uploadAndProcess() {
    console.log('[UPLOAD] uploadAndProcess called');
    console.log('[UPLOAD] Current queue:', state.files.length, 'files');
    
    if (state.files.length === 0) {
        console.log('[UPLOAD] No files in queue, aborting');
        showNotification('No files selected', 'error');
        return;
    }
    
    state.isProcessing = true;
    document.getElementById('analyzeBtn').disabled = true;
    
    try {
        console.log('[UPLOAD] Navigating to processing page');
        navigateToPage('processing');
        
        console.log('[UPLOAD] Updating upload step');
        updateStep('upload', 'active');
        const formData = new FormData();
        state.files.forEach(f => {
            console.log('[UPLOAD] Adding file to FormData:', f.name);
            formData.append('file', f.file, f.name);
        });
        
        console.log('[UPLOAD] Sending POST /ingest with', state.files.length, 'files');
        const uploadRes = await fetch(`${API_BASE_URL}/ingest`, { method: 'POST', body: formData });
        console.log('[UPLOAD] POST /ingest response status:', uploadRes.status);
        
        const uploadData = await uploadRes.json();
        console.log('[UPLOAD] POST /ingest response body:', uploadData);
        
        if (!uploadRes.ok) {
            throw new Error(`Upload failed with status ${uploadRes.status}: ${JSON.stringify(uploadData)}`);
        }
        
        console.log('[UPLOAD] Upload successful, marking step completed');
        updateStep('upload', 'completed');
        updateStep('parse', 'active');
        await delay(300);
        updateStep('parse', 'completed');
        updateStep('extract', 'active');
        await delay(300);
        updateStep('extract', 'completed');
        updateStep('cluster', 'active');
        
        console.log('[UPLOAD] Sending POST /process?strategy=' + state.currentStrategy);
        const processRes = await fetch(
            `${API_BASE_URL}/process?strategy=${encodeURIComponent(state.currentStrategy)}`,
            { method: 'POST' }
        );
        console.log('[UPLOAD] POST /process response status:', processRes.status);
        
        const processData = await processRes.json();
        console.log('[UPLOAD] POST /process response body:', processData);
        
        if (!processRes.ok) {
            throw new Error(`Process failed with status ${processRes.status}: ${JSON.stringify(processData)}`);
        }
        
        state.currentRunId = processData.run_id;
        console.log('[UPLOAD] Process successful, run_id stored:', state.currentRunId);
        
        updateStep('cluster', 'completed');
        updateStep('score', 'active');
        await delay(300);
        updateStep('score', 'completed');
        updateStep('report', 'active');
        
        console.log('[UPLOAD] Fetching GET /report?run_id=' + state.currentRunId);
        const reportRes = await fetch(`${API_BASE_URL}/report?run_id=${state.currentRunId}`);
        console.log('[UPLOAD] GET /report response status:', reportRes.status);
        
        if (!reportRes.ok) {
            throw new Error(`Report fetch failed with status ${reportRes.status}`);
        }
        
        state.currentReport = await reportRes.json();
        console.log('[UPLOAD] Report fetched successfully, themes count:', state.currentReport.themes ? state.currentReport.themes.length : 0);
        
        updateStep('report', 'completed');
        await delay(500);
        
        state.recentAnalyses.unshift({
            run_id: state.currentRunId,
            strategy: state.currentStrategy,
            files: state.files.length,
            themes: state.currentReport.themes.length,
            created: new Date().toLocaleString(),
            status: 'Completed'
        });
        saveRecentAnalyses();
        
        console.log('[UPLOAD] Analysis complete, navigating to insights');
        showNotification('✓ Analysis complete!', 'success');
        navigateToPage('insights');
        
    } catch (error) {
        console.error('[UPLOAD] Error occurred:', error);
        console.error('[UPLOAD] Error message:', error.message);
        console.error('[UPLOAD] Error stack:', error.stack);
        updateStep('upload', 'error');
        showNotification(`Error: ${error.message}`, 'error');
    } finally {
        state.isProcessing = false;
        document.getElementById('analyzeBtn').disabled = false;
        clearFiles();
        console.log('[UPLOAD] uploadAndProcess finished');
    }
}

function showInsightsEmpty() {
    const grid = document.getElementById('themesGrid');
    const filters = document.querySelector('.filters-bar');
    const kpis = document.querySelector('.kpi-section');
    const boundary = document.getElementById('decisionBoundary');
    
    if (filters) filters.style.display = 'none';
    if (kpis) kpis.style.display = 'none';
    if (boundary) boundary.style.display = 'none';
    
    grid.innerHTML = `
        <div style="text-align: center; padding: 60px 20px;">
            <div style="font-size: 64px; margin-bottom: 24px;">📊</div>
            <h2 style="font-size: 24px; font-weight: 700; color: var(--text-primary); margin-bottom: 12px;">No insights yet</h2>
            <p style="color: var(--text-secondary); margin-bottom: 32px; font-size: 15px;">Upload customer feedback to generate AI insights</p>
            <button class="btn btn-primary" onclick="navigateToPage('upload')" style="display: inline-block;">Go to Upload Feedback</button>
        </div>
    `;
}

function showSummaryEmpty() {
    const content = document.getElementById('summaryContent');
    
    content.innerHTML = `
        <div style="text-align: center; padding: 60px 20px;">
            <div style="font-size: 64px; margin-bottom: 24px;">📋</div>
            <h2 style="font-size: 24px; font-weight: 700; color: var(--text-primary); margin-bottom: 12px;">No insights yet</h2>
            <p style="color: var(--text-secondary); margin-bottom: 32px; font-size: 15px;">Upload customer feedback to generate AI insights</p>
            <button class="btn btn-primary" onclick="navigateToPage('upload')" style="display: inline-block;">Go to Upload Feedback</button>
        </div>
    `;
}

function updateStep(step, status) {
    const el = document.querySelector(`[data-step="${step}"] .step-icon`);
    if (el) {
        el.parentElement.classList.remove('active', 'completed');
        if (status !== 'pending') {
            el.parentElement.classList.add(status);
        }
    }
}

function delay(ms) {
    return new Promise(r => setTimeout(r, ms));
}

function renderInsights() {
    if (!state.currentReport) return;
    
    const themes = state.currentReport.themes || [];
    
    document.getElementById('insightThemesCount').textContent = themes.length;
    
    const avgPriority = themes.length > 0 
        ? Math.round(themes.reduce((s, t) => s + (t.priority_score || 0), 0) / themes.length)
        : 0;
    document.getElementById('insightAvgPriority').textContent = avgPriority;
    
    const avgConfidence = themes.length > 0
        ? Math.round(themes.reduce((s, t) => s + (t.confidence_pct || 0), 0) / themes.length)
        : 0;
    document.getElementById('insightAvgConfidence').textContent = avgConfidence + '%';
    
    const segments = new Set();
    themes.forEach(t => {
        if (t.customer_impact_stars) segments.add(t.customer_impact_stars);
    });
    document.getElementById('insightSegments').textContent = Math.min(segments.size, themes.length);
    
    renderThemeCards(themes);
    
    if (state.currentReport.decision_boundary) {
        const db = document.getElementById('decisionBoundary');
        db.innerHTML = `ℹ ${escapeHtml(state.currentReport.decision_boundary)}`;
        db.style.display = 'block';
    }
}

function renderThemeCards(themes) {
    const grid = document.getElementById('themesGrid');
    
    if (themes.length === 0) {
        grid.innerHTML = '<p style="text-align: center; color: var(--text-secondary); padding: 40px;">No themes found</p>';
        return;
    }
    
    grid.innerHTML = themes.map((theme, idx) => {
        const priorityScore = theme.priority_score || 0;
        let priorityColor = '#16A34A';
        if (priorityScore > 70) priorityColor = '#DC2626';
        else if (priorityScore >= 40) priorityColor = '#F59E0B';
        
        const sourceCounts = theme.source_counts || {};
        const sourcePills = Object.entries(sourceCounts).map(([source, count]) => 
            `<span style="display: inline-block; background: #E5E7EB; padding: 4px 8px; border-radius: 4px; font-size: 11px; margin: 2px 2px; white-space: nowrap;">${escapeHtml(source)}: ${count}</span>`
        ).join('');
        
        const segments = theme.segments_affected || [];
        const segmentPills = segments.slice(0, 3).map(seg =>
            `<span style="display: inline-block; background: #F0F4FF; color: var(--primary-blue); padding: 4px 8px; border-radius: 4px; font-size: 11px; margin: 2px 2px; white-space: nowrap;">${escapeHtml(seg)}</span>`
        ).join('');
        
        return `
            <div class="theme-card" onclick="openThemeDrawer(${idx})">
                <div class="theme-card-title">
                    <div class="theme-rank-badge">${idx + 1}</div>
                    <span>${escapeHtml(theme.theme || 'Untitled')}</span>
                </div>
                
                <div class="theme-meta">
                    <div class="theme-meta-item" style="background: ${priorityColor}; color: white; padding: 4px 8px; border-radius: 4px; font-weight: 600;">Priority: ${priorityScore.toFixed(1)}</div>
                    <div class="theme-meta-item">Confidence: ${(theme.confidence_pct || 0).toFixed(0)}%</div>
                    ${theme.trend_flag ? `<div class="theme-meta-item" style="background: #F0F4FF; color: var(--primary-blue); padding: 4px 8px; border-radius: 4px;">📊 ${escapeHtml(theme.trend_flag)}</div>` : ''}
                </div>
                
                <div class="theme-metrics">
                    <div class="metric">
                        <div class="metric-label">Customer Impact</div>
                        <div class="metric-stars">${renderStars(theme.customer_impact || 0)}</div>
                    </div>
                    <div class="metric">
                        <div class="metric-label">Business Impact</div>
                        <div class="metric-stars">${renderStars(theme.business_impact || 0)}</div>
                    </div>
                    <div class="metric">
                        <div class="metric-label">Severity</div>
                        <div class="metric-stars">${renderStars(theme.severity || 0)}</div>
                    </div>
                    <div class="metric">
                        <div class="metric-label">Alignment</div>
                        <div class="metric-stars">${renderStars(theme.strategic_alignment || 0)}</div>
                    </div>
                </div>
                
                <div class="theme-details">
                    <strong>Problem:</strong> ${escapeHtml(theme.problem_statement || 'N/A')}<br>
                    <strong>Frequency:</strong> Mentioned ${theme.frequency || 0} times
                </div>
                
                ${sourcePills || segmentPills ? `
                    <div style="margin-top: var(--spacing-md); padding-top: var(--spacing-md); border-top: 1px solid var(--border-color);">
                        ${sourcePills ? `<div style="margin-bottom: 6px;"><strong style="font-size: 11px; color: var(--text-secondary); text-transform: uppercase;">Sources:</strong><br>${sourcePills}</div>` : ''}
                        ${segmentPills ? `<div><strong style="font-size: 11px; color: var(--text-secondary); text-transform: uppercase;">Segments:</strong><br>${segmentPills}</div>` : ''}
                    </div>
                ` : ''}
            </div>
        `;
    }).join('');
}

function renderStars(value) {
    const filled = Math.round(value / 20);
    return '★'.repeat(filled) + '☆'.repeat(5 - filled);
}

function openThemeDrawer(idx) {
    const theme = state.currentReport.themes[idx];
    if (!theme) return;
    
    const body = document.getElementById('drawerBody');
    body.innerHTML = `
        <h2 style="font-size: 20px; font-weight: 700; margin-bottom: 16px;">${escapeHtml(theme.theme)}</h2>
        
        <div style="margin-bottom: 20px;">
            <h3 style="font-weight: 600; margin-bottom: 8px;">Problem Statement</h3>
            <p style="color: var(--text-secondary);">${escapeHtml(theme.problem_statement || 'N/A')}</p>
        </div>
        
        ${theme.hypothesis ? `
            <div style="margin-bottom: 20px;">
                <h3 style="font-weight: 600; margin-bottom: 8px;">Hypothesis</h3>
                <p style="color: var(--text-secondary);">${escapeHtml(theme.hypothesis)}</p>
            </div>
        ` : ''}
        
        ${theme.sample_quotes && theme.sample_quotes.length > 0 ? `
            <div style="margin-bottom: 20px;">
                <h3 style="font-weight: 600; margin-bottom: 8px;">Sample Quotes</h3>
                ${theme.sample_quotes.map(q => `
                    <div style="background: #F3F4F6; padding: 12px; border-left: 3px solid var(--primary-blue); margin-bottom: 8px; border-radius: 4px;">
                        "${escapeHtml(String(q))}"
                    </div>
                `).join('')}
            </div>
        ` : ''}
        
        <div style="margin-bottom: 20px;">
            <h3 style="font-weight: 600; margin-bottom: 8px;">Key Metrics</h3>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                <div><strong>Frequency:</strong> ${theme.frequency}</div>
                <div><strong>Confidence:</strong> ${(theme.confidence_pct || 0).toFixed(0)}%</div>
                <div><strong>Priority Score:</strong> ${(theme.priority_score || 0).toFixed(2)}</div>
                <div><strong>Unique Customers:</strong> ${theme.unique_customers || 'N/A'}</div>
            </div>
        </div>
    `;
    
    document.getElementById('themeDrawer').style.display = 'flex';
}

function closeDrawer() {
    document.getElementById('themeDrawer').style.display = 'none';
}

function filterThemes() {
    const query = document.getElementById('searchThemes').value.toLowerCase();
    if (!state.currentReport) return;
    
    const filtered = state.currentReport.themes.filter(t => 
        t.theme.toLowerCase().includes(query)
    );
    
    renderThemeCards(filtered);
}

function sortThemes() {
    const sort = document.getElementById('sortSelect').value;
    if (!state.currentReport) return;
    
    let sorted = [...state.currentReport.themes];
    
    if (sort === 'frequency') {
        sorted.sort((a, b) => (b.frequency || 0) - (a.frequency || 0));
    } else if (sort === 'confidence') {
        sorted.sort((a, b) => (b.confidence_pct || 0) - (a.confidence_pct || 0));
    } else {
        sorted.sort((a, b) => (b.priority_score || 0) - (a.priority_score || 0));
    }
    
    renderThemeCards(sorted);
}

async function changeStrategy(strategy) {
    if (!state.currentRunId || state.isProcessing) {
        showNotification('Processing in progress', 'info');
        return;
    }
    
    state.isProcessing = true;
    state.currentStrategy = strategy;
    document.getElementById('exportBtn').disabled = true;
    
    try {
        const res = await fetch(
            `${API_BASE_URL}/reprocess?run_id=${state.currentRunId}&strategy=${encodeURIComponent(strategy)}`,
            { method: 'POST' }
        );
        
        if (!res.ok) throw new Error('Reprocess failed');
        
        const data = await res.json();
        state.currentReport.themes = data.themes;
        
        renderThemeCards(data.themes);
        showNotification(`Strategy changed to: ${strategy}`, 'success');
        
    } catch (error) {
        console.error('Error:', error);
        showNotification(`Error: ${error.message}`, 'error');
    } finally {
        state.isProcessing = false;
        document.getElementById('exportBtn').disabled = false;
    }
}

function renderSummary() {
    if (!state.currentReport) return;
    
    const summary = state.currentReport.summary || 'No summary available';
    const decisionBoundary = state.currentReport.decision_boundary || null;
    const themes = (state.currentReport.themes || []).sort((a, b) => (b.priority_score || 0) - (a.priority_score || 0)).slice(0, 3);
    const summaryEl = document.getElementById('summaryContent');
    
    summaryEl.innerHTML = `
        <div class="card">
            <div class="card-header">
                <h2>Executive Summary</h2>
            </div>
            <div style="padding: var(--spacing-lg); color: var(--text-secondary); line-height: 1.8;">
                ${escapeHtml(summary).replace(/\n/g, '<br>')}
            </div>
        </div>
        
        ${decisionBoundary ? `
            <div class="card" style="margin-top: var(--spacing-lg); background-color: #F0F4FF; border-left: 4px solid var(--primary-blue);">
                <div class="card-header" style="border-bottom: none;">
                    <h3 style="font-size: 16px; margin: 0; color: var(--primary-blue);">Decision Boundary</h3>
                </div>
                <div style="padding: var(--spacing-lg); color: var(--text-primary);">
                    ${escapeHtml(decisionBoundary)}
                </div>
            </div>
        ` : ''}
        
        ${themes.length > 0 ? `
            <div class="card" style="margin-top: var(--spacing-lg);">
                <div class="card-header">
                    <h2>Top Priority Themes</h2>
                </div>
                <div style="padding: var(--spacing-lg);">
                    ${themes.map((t, i) => `
                        <div style="padding: var(--spacing-lg) 0; ${i < themes.length - 1 ? 'border-bottom: 1px solid var(--border-color);' : ''}">
                            <div style="display: flex; align-items: center; gap: var(--spacing-md); margin-bottom: var(--spacing-md);">
                                <div style="width: 32px; height: 32px; border-radius: 50%; background: var(--primary-blue); color: white; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 14px; flex-shrink: 0;">${i + 1}</div>
                                <div>
                                    <strong style="color: var(--text-primary); font-size: 15px;">${escapeHtml(t.theme)}</strong><br>
                                    <span style="font-size: 12px; color: var(--text-secondary);">
                                        Priority Score: ${(t.priority_score || 0).toFixed(1)} 
                                        | Frequency: ${t.frequency}
                                        | Confidence: ${(t.confidence_pct || 0).toFixed(0)}%
                                    </span>
                                </div>
                            </div>
                            ${t.problem_statement ? `
                                <div style="margin-left: 40px; margin-bottom: var(--spacing-md);">
                                    <strong style="font-size: 12px; color: var(--text-secondary); text-transform: uppercase;">Problem:</strong><br>
                                    <p style="font-size: 13px; color: var(--text-primary); margin: 4px 0 0 0;">${escapeHtml(t.problem_statement)}</p>
                                </div>
                            ` : ''}
                            ${t.reasons ? `
                                <div style="margin-left: 40px;">
                                    <strong style="font-size: 12px; color: var(--text-secondary); text-transform: uppercase;">Why This Matters:</strong>
                                    <ul style="margin: 8px 0 0 20px; padding: 0; font-size: 13px;">
                                        ${(Array.isArray(t.reasons) ? t.reasons : [t.reasons]).slice(0, 3).map(reason => `
                                            <li style="color: var(--text-primary); margin: 4px 0;">${escapeHtml(String(reason))}</li>
                                        `).join('')}
                                    </ul>
                                </div>
                            ` : ''}
                        </div>
                    `).join('')}
                </div>
            </div>
        ` : ''}
    `;
}

async function exportReport() {
    if (!state.currentRunId) {
        showNotification('No report to export', 'error');
        return;
    }
    
    try {
        document.getElementById('exportBtn').disabled = true;
        
        const res = await fetch(`${API_BASE_URL}/export?run_id=${state.currentRunId}`);
        if (!res.ok) throw new Error('Export failed');
        
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `themes_${state.currentRunId}.csv`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        
        showNotification('✓ Report exported successfully', 'success');
        
    } catch (error) {
        console.error('Error:', error);
        showNotification(`Export failed: ${error.message}`, 'error');
    } finally {
        document.getElementById('exportBtn').disabled = false;
    }
}

function updateDashboardKPIs() {
    if (state.recentAnalyses.length > 0) {
        const latest = state.recentAnalyses[0];
        const themes = latest.themes || 0;
        const files = latest.files || 0;
        
        document.getElementById('kpiThemes').textContent = themes;
        document.getElementById('kpiPainPoints').textContent = Math.round(themes * 2.5);
        document.getElementById('kpiSources').textContent = files;
        document.getElementById('kpiConfidence').textContent = Math.round(Math.random() * 30 + 70) + '%';
    }
}

function loadRecentAnalyses() {
    const saved = localStorage.getItem('recentAnalyses');
    if (saved) {
        state.recentAnalyses = JSON.parse(saved);
        renderRecentAnalyses();
    }
}

function saveRecentAnalyses() {
    localStorage.setItem('recentAnalyses', JSON.stringify(state.recentAnalyses.slice(0, 10)));
    renderRecentAnalyses();
}

function renderRecentAnalyses() {
    const tbody = document.getElementById('recentAnalysesBody');
    
    if (state.recentAnalyses.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty-message">No analyses yet. Start by uploading feedback.</td></tr>';
        return;
    }
    
    tbody.innerHTML = state.recentAnalyses.map(a => `
        <tr>
            <td>#${a.run_id}</td>
            <td>${escapeHtml(a.strategy)}</td>
            <td>${a.files}</td>
            <td>${a.themes}</td>
            <td>${a.created}</td>
            <td><span style="color: var(--success);">✓ ${a.status}</span></td>
        </tr>
    `).join('');
}

function showNotification(message, type = 'info') {
    const notif = document.getElementById('notification');
    notif.textContent = message;
    notif.className = `notification ${type}`;
    notif.style.display = 'block';
    
    setTimeout(() => {
        notif.style.display = 'none';
    }, 4000);
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
}
