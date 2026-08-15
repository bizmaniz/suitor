const state = {
  authenticated: false,
  activeView: localStorage.getItem('activeView') || 'applications',
  attachments: [],
  trackerCards: [],
  appFilter: localStorage.getItem('appFilter') || 'all',
  applicationQuery: localStorage.getItem('applicationQuery') || '',
  lastScanRaw: localStorage.getItem('lastScanRaw') || '',
  files: [],
  fileQuery: '',
  dismissedScanCards: readDismissedScanCards(),
  scanChatEvaluations: readScanChatEvaluations(),
  scanDecisions: [],
  assessments: [],
  captures: [],
  learningSummary: null,
  masterResume: null,
  meta: {
    candidateFirst: 'Candidate',
    candidateName: 'Candidate',
    candidateInitials: 'CO',
    assistantName: 'Assistant',
  },
  onboarding: null,
};

localStorage.removeItem('suitorToken');

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const els = {
  loginDialog: $('#loginDialog'),
  loginForm: $('#loginForm'),
  tokenInput: $('#tokenInput'),
  loginError: $('#loginError'),
  authStatus: $('#authStatus'),
  runIndicator: $('#runIndicator'),
  chatContext: $('#chatContext'),
  chatLog: $('#chatLog'),
  chatForm: $('#chatForm'),
  message: $('#message'),
  fileInput: $('#fileInput'),
  attachments: $('#attachments'),
  trackerEditor: $('#trackerEditor'),
  saveTracker: $('#saveTracker'),
  refreshBtn: $('#refreshBtn'),
  addRoleBtn: $('#addRoleBtn'),
  weeklyPlanBtn: $('#weeklyPlanBtn'),
  statusSummary: $('#statusSummary'),
  statusTabs: $('#statusTabs'),
  applicationSearch: $('#applicationSearch'),
  clearApplicationSearch: $('#clearApplicationSearch'),
  navWeeklyProgress: $('#navWeeklyProgress'),
  applicationCards: $('#applicationCards'),
  scanBtn: $('#scanBtn'),
  agentScanBtn: $('#agentScanBtn'),
  lastScanBtn: $('#lastScanBtn'),
  scanResults: $('#scanResults'),
  scanOutput: $('#scanOutput'),
  scanLogWrap: $('#scanLogWrap'),
  filesList: $('#filesList'),
  fileSearch: $('#fileSearch'),
  resumePreview: $('#resumePreview'),
  refreshResume: $('#refreshResume'),
  tailorBtn: $('#tailorBtn'),
  tailorCompany: $('#tailorCompany'),
  tailorRole: $('#tailorRole'),
  tailorJd: $('#tailorJd'),
  tailorHelper: $('#tailorHelper'),
  masterResumeTitle: $('#masterResumeTitle'),
  masterResumeMeta: $('#masterResumeMeta'),
  masterResumeInput: $('#masterResumeInput'),
  masterUpdateKind: $('#masterUpdateKind'),
  reviewMasterResumeBtn: $('#reviewMasterResumeBtn'),
  promoteMasterResumeBtn: $('#promoteMasterResumeBtn'),
  masterResumePending: $('#masterResumePending'),
  clearChat: $('#clearChat'),
  docViewer: $('#docViewer'),
  copyDocBtn: $('#copyDocBtn'),
  connectionsList: $('#connectionsList'),
  editConnectionsBtn: $('#editConnectionsBtn'),
  clearCustomSourcesBtn: $('#clearCustomSourcesBtn'),
  disconnectLinkedInBtn: $('#disconnectLinkedInBtn'),
  backupDbBtn: $('#backupDbBtn'),
  emailImportText: $('#emailImportText'),
  emailImportCompany: $('#emailImportCompany'),
  emailImportRole: $('#emailImportRole'),
  emailImportResult: $('#emailImportResult'),
  importEmailBtn: $('#importEmailBtn'),
  clearEmailImportsBtn: $('#clearEmailImportsBtn'),
  captureCompany: $('#captureCompany'),
  captureRole: $('#captureRole'),
  captureUrl: $('#captureUrl'),
  captureSource: $('#captureSource'),
  captureText: $('#captureText'),
  captureJobBtn: $('#captureJobBtn'),
  captureResult: $('#captureResult'),
  captureList: $('#captureList'),
  refreshCapturesBtn: $('#refreshCapturesBtn'),
  refreshLearningBtn: $('#refreshLearningBtn'),
  learningStats: $('#learningStats'),
  learningOutcomes: $('#learningOutcomes'),
  learningSources: $('#learningSources'),
  learningDecisions: $('#learningDecisions'),
  assessmentInput: $('#assessmentInput'),
  assessmentList: $('#assessmentList'),
  assessmentRoot: $('#assessmentRoot'),
  browserPanel: $('#browserPanel'),
  browserStatusText: $('#browserStatusText'),
  browserPreview: $('#browserPreview'),
  browserPreviewEmpty: $('#browserPreviewEmpty'),
  browserLog: $('#browserLog'),
  browserResults: $('#browserResults'),
  openLinkedInLocalBtn: $('#openLinkedInLocalBtn'),
  openLinkedInBtn: $('#openLinkedInBtn'),
  checkLinkedInBtn: $('#checkLinkedInBtn'),
  linkedinSearchBtn: $('#linkedinSearchBtn'),
  browserCancelBtn: $('#browserCancelBtn'),
  linkedinQuery: $('#linkedinQuery'),
  themeToggle: $('#themeToggle'),
  viewEyebrow: $('#viewEyebrow'),
  viewTitle: $('#viewTitle'),
};

function headers(extra = {}) {
  return { ...extra };
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    credentials: 'same-origin',
    headers: headers({
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    }),
  });
  if (res.status === 401) {
    state.authenticated = false;
    showLogin();
    throw new Error('Unauthorized');
  }
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function showLogin() {
  els.authStatus.textContent = 'Locked';
  if (!els.loginDialog.open) els.loginDialog.showModal();
}

function setBusy(isBusy, label = 'Running') {
  els.runIndicator.innerHTML = isBusy ? `${escapeHtml(label)} <span class="pulse-dots"><i></i><i></i><i></i></span>` : 'Idle';
  els.runIndicator.classList.toggle('busy', isBusy);
  document.body.classList.toggle('agent-running', isBusy);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[ch]);
}

function readDismissedScanCards() {
  try {
    return new Set(JSON.parse(localStorage.getItem('dismissedScanCards') || '[]'));
  } catch {
    return new Set();
  }
}

function saveDismissedScanCards() {
  localStorage.setItem('dismissedScanCards', JSON.stringify([...state.dismissedScanCards].slice(-300)));
}

function readScanChatEvaluations() {
  try {
    return JSON.parse(localStorage.getItem('scanChatEvaluations') || '[]');
  } catch {
    return [];
  }
}

function saveScanChatEvaluations() {
  localStorage.setItem('scanChatEvaluations', JSON.stringify(state.scanChatEvaluations.slice(-120)));
}

function setButtonLoading(button, isLoading, label) {
  if (!button) return;
  if (isLoading) {
    button.dataset.idleLabel = button.textContent.trim();
    button.innerHTML = `${escapeHtml(label || button.dataset.idleLabel || 'Working')} <span class="pulse-dots"><i></i><i></i><i></i></span>`;
    button.disabled = true;
    button.classList.add('is-loading');
    return;
  }
  button.disabled = false;
  button.classList.remove('is-loading');
  if (button.dataset.idleLabel) button.textContent = button.dataset.idleLabel;
}

function setScanButtonsDisabled(disabled) {
  [els.scanBtn, els.agentScanBtn, els.lastScanBtn].forEach(button => {
    if (button) button.disabled = disabled;
  });
}

function showToast(message) {
  let toast = $('#toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.className = 'toast';
    document.body.append(toast);
  }
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('show'), 2600);
}

function updateThemeToggle() {
  const dark = document.body.classList.contains('dark');
  els.themeToggle.textContent = dark ? 'Dark Mode On' : 'Light Mode';
  els.themeToggle.setAttribute('aria-pressed', String(dark));
}

function updateTailorState() {
  const ready = els.tailorCompany.value.trim() && els.tailorRole.value.trim() && els.tailorJd.value.trim();
  const profileLocked = els.tailorBtn?.dataset.profileLocked === '1';
  els.tailorBtn.disabled = !ready || profileLocked;
  if (els.tailorHelper) {
    els.tailorHelper.textContent = profileLocked
      ? 'Complete Tier 2 intake and resume review before generating tailored materials.'
      : ready
      ? 'Ready to create ATS DOCX/PDF files plus an optional designed resume. Use DOCX for large ATS portals unless PDF is requested.'
      : 'Add a company, role, and job description to tailor this resume.';
  }
}

function renderAssessments(files = state.assessments) {
  state.assessments = Array.isArray(files) ? files : [];
  if (!els.assessmentList) return;
  if (!state.assessments.length) {
    els.assessmentList.innerHTML = `<div class="empty-mini">No assessments uploaded yet.</div>`;
    return;
  }
  els.assessmentList.innerHTML = state.assessments.map(file => `
    <div class="assessment-item">
      <div>
        <strong>${escapeHtml(file.name)}</strong>
        <span>${escapeHtml(file.summaryPath ? 'Summary ready for soft grading' : file.textPath ? 'Text extracted for soft grading' : 'Saved; text extraction unavailable')}</span>
      </div>
      ${file.downloadPath ? `<a href="/api/download?path=${encodeURIComponent(file.downloadPath)}" target="_blank" rel="noreferrer">Open</a>` : ''}
    </div>
  `).join('');
}

function renderCaptures(captures = state.captures) {
  state.captures = Array.isArray(captures) ? captures : [];
  if (!els.captureList) return;
  if (!state.captures.length) {
    els.captureList.innerHTML = '<div class="empty-mini">No manual roles captured yet.</div>';
    return;
  }
  els.captureList.innerHTML = state.captures.map(capture => `
    <article class="capture-item">
      <div>
        <strong>${escapeHtml([capture.role, capture.company].filter(Boolean).join(' - ') || 'Captured role')}</strong>
        <span>${escapeHtml([capture.source, capture.createdAt ? new Date(capture.createdAt).toLocaleString() : ''].filter(Boolean).join(' / '))}</span>
        <small>${escapeHtml(capture.notes || capture.jdTextExcerpt || 'No notes saved.')}</small>
      </div>
      <div class="capture-item-actions">
        ${capture.url ? `<a class="button-secondary compact" href="${escapeHtml(capture.url)}" target="_blank" rel="noreferrer">Open</a>` : ''}
        <button class="button-secondary compact" type="button" data-delete-capture="${escapeHtml(capture.id)}">Remove</button>
      </div>
    </article>
  `).join('');
  $$('[data-delete-capture]').forEach(button => button.addEventListener('click', async () => {
    if (!confirm('Remove this capture from profile memory?')) return;
    const response = await api(`/api/captures/${encodeURIComponent(button.dataset.deleteCapture)}`, {
      method: 'DELETE',
      body: JSON.stringify({}),
    });
    renderCaptures(response.captures || []);
    showToast('Capture removed');
  }));
}

function learningRows(entries = [], emptyText = 'No signal yet.') {
  if (!entries.length) return `<div class="empty-mini">${escapeHtml(emptyText)}</div>`;
  return entries.map(entry => {
    const label = entry.label || entry.name || entry.source || entry.title || entry.decision || 'Unknown';
    const value = entry.value ?? entry.count ?? entry.total ?? '';
    const detail = entry.detail || entry.reason || '';
    return `
      <div class="learning-row">
        <div><strong>${escapeHtml(label)}</strong>${detail ? `<small>${escapeHtml(detail)}</small>` : ''}</div>
        <span>${escapeHtml(value)}</span>
      </div>
    `;
  }).join('');
}

function renderLearningInsights(payload = state.learningSummary) {
  state.learningSummary = payload || null;
  if (!els.learningStats || !payload) return;
  const tracker = payload.tracker || {};
  const decisions = payload.scanDecisions || {};
  const statusCounts = tracker.statusCounts || {};
  const stats = [
    ['Applications', tracker.totalCards || 0, 'Tracked roles'],
    ['Still Alive', (statusCounts.submitted || 0) + (statusCounts.interviewing || 0) + (statusCounts.accepted_or_offer || 0), 'Submitted, interviewing, or offer'],
    ['Decisions', decisions.totalDecisions || 0, 'Profile-local scan memory'],
    ['Jobs Seen', payload.sourceHistory?.totalRows || 0, 'Quick-scan source history'],
  ];
  els.learningStats.innerHTML = stats.map(([label, value, detail]) => `
    <div class="learning-stat"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(detail)}</small></div>
  `).join('');

  const outcomes = Object.entries(statusCounts)
    .map(([label, value]) => ({ label: label.replaceAll('_', ' '), value }))
    .sort((a, b) => Number(b.value) - Number(a.value));
  const sources = (tracker.sourceCounts || []).map(item => ({ label: item.name || item.key || item.source, value: item.count || item.total }));
  const recent = (decisions.recentDecisions || []).slice(0, 12).map(item => ({
    label: item.title || item.decision,
    value: item.decision || '',
    detail: [item.source, item.reason].filter(Boolean).join(' / '),
  }));
  els.learningOutcomes.innerHTML = learningRows(outcomes, 'Application outcomes will appear after tracker activity.');
  els.learningSources.innerHTML = learningRows(sources, 'Source patterns will appear after scans or applications.');
  els.learningDecisions.innerHTML = learningRows(recent, 'Durable pass, submitted, and close-out decisions will appear here.');
}

function renderMasterResume(payload = state.masterResume) {
  state.masterResume = payload || null;
  if (!els.masterResumeTitle || !els.masterResumeMeta) return;
  const canonical = payload?.canonical;
  const pending = payload?.pending;
  if (canonical) {
    els.masterResumeTitle.textContent = `${canonical.name || 'Current master resume'}`;
    const bits = [
      canonical.version ? `v${canonical.version}` : '',
      canonical.ext ? canonical.ext.replace('.', '').toUpperCase() : '',
      canonical.modified ? `updated ${new Date(canonical.modified).toLocaleDateString()}` : '',
    ].filter(Boolean);
    els.masterResumeMeta.textContent = `${bits.join(' / ') || 'Current resume'} is the source Resume Studio uses for preview and tailoring. Uploading a new master stages it for review first.`;
  } else {
    els.masterResumeTitle.textContent = 'Master resume not detected';
    els.masterResumeMeta.textContent = 'Upload a DOCX, PDF, Markdown, or text file to stage the first current master.';
  }

  if (els.masterResumePending) {
    if (pending) {
      els.masterResumePending.hidden = false;
      const canOpen = pending.downloadPath ? `/api/download?path=${encodeURIComponent(pending.downloadPath)}` : '';
      els.masterResumePending.innerHTML = `
        <div>
          <strong>Pending review: ${escapeHtml(pending.name || 'New master resume')}</strong>
          <span>${escapeHtml([pending.version ? `v${pending.version}` : '', pending.updateKind || '', pending.uploadedAt ? `uploaded ${new Date(pending.uploadedAt).toLocaleString()}` : ''].filter(Boolean).join(' / '))}</span>
        </div>
        ${canOpen ? `<a href="${canOpen}" target="_blank" rel="noreferrer">Open Pending</a>` : ''}
      `;
    } else {
      els.masterResumePending.hidden = true;
      els.masterResumePending.innerHTML = '';
    }
  }
  if (els.reviewMasterResumeBtn) els.reviewMasterResumeBtn.disabled = !pending;
  if (els.promoteMasterResumeBtn) els.promoteMasterResumeBtn.disabled = !pending;
}

function renderBrowserStatus(browser = {}) {
  if (!els.browserPanel) return;
  const stateText = browser.state || 'idle';
  const count = Number(browser.resultCount || 0);
  const currentUrl = String(browser.currentUrl || '');
  const sessionText = browser.sessionLabel
    ? ` LinkedIn session: ${browser.sessionLabel}${browser.sessionReason ? ` (${browser.sessionReason})` : ''}.`
    : '';
  const urlText = currentUrl
    ? ` Current page: <a href="${escapeHtml(currentUrl)}" target="_blank" rel="noreferrer">${escapeHtml(prettyBrowserUrl(currentUrl))}</a>.`
    : '';
  const resultText = count ? ` ${count} LinkedIn result${count === 1 ? '' : 's'} saved. Run Verified Scan to dedupe, fetch details, score, and route them into Shortlist / Needs Decision / Needs Verification.` : '';
  els.browserStatusText.innerHTML = `${escapeHtml(stateText.replace(/_/g, ' '))}.${escapeHtml(sessionText)}${escapeHtml(resultText)}${urlText} <span class="browser-host-note">Preview below is the Windows host browser, not this device.</span>`;
  const logs = Array.isArray(browser.logs) ? browser.logs : [];
  els.browserLog.textContent = logs.map(item => `${String(item.at || '').replace('T', ' ').replace(/\.\d+Z$/, 'Z')}  ${displayBrandText(item.text || '')}`).join('\n') || 'No browser activity yet.';
  if (browser.screenshotUrl) {
    loadBrowserPreview(browser.screenshotUrl);
  } else {
    if (els.browserPreview.dataset.objectUrl) URL.revokeObjectURL(els.browserPreview.dataset.objectUrl);
    delete els.browserPreview.dataset.objectUrl;
    els.browserPreview.hidden = true;
    els.browserPreview.removeAttribute('src');
    els.browserPreviewEmpty.hidden = false;
  }
}

function displayBrandText(value = '') {
  return String(value || '')
    .replace(/\bsuitor\b/g, 'Suitor-core');
}

function isHostOrSubdomain(hostname, domain) {
  const host = String(hostname || '').replace(/^www\./i, '').toLowerCase();
  const expected = String(domain || '').toLowerCase();
  return host === expected || host.endsWith(`.${expected}`);
}

function linkHostnameIs(value, domain) {
  try {
    return isHostOrSubdomain(new URL(String(value || '')).hostname, domain);
  } catch {
    return false;
  }
}

function prettyBrowserUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    if (isHostOrSubdomain(parsed.hostname, 'linkedin.com')) {
      if (parsed.pathname.includes('/jobs/search')) return 'LinkedIn search results';
      const jobMatch = parsed.pathname.match(/\/jobs\/view\/(\d+)/);
      if (jobMatch) return `LinkedIn job ${jobMatch[1]}`;
      return 'LinkedIn';
    }
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return 'Open current page';
  }
}

function localLinkedInJobsUrl() {
  const query = (els.linkedinQuery?.value || '').trim() || `${state.meta.candidateFirst || ''} operations leadership`.trim() || 'operations leadership';
  const params = new URLSearchParams({
    keywords: query,
    f_WT: '2',
    f_TPR: 'r604800',
  });
  return `https://www.linkedin.com/jobs/search/?${params.toString()}`;
}

async function loadBrowserPreview(url) {
  if (!els.browserPreview || !url) return;
  try {
    const res = await fetch(url, { credentials: 'same-origin', headers: headers() });
    if (!res.ok) throw new Error(`preview ${res.status}`);
    const blob = await res.blob();
    if (els.browserPreview.dataset.objectUrl) URL.revokeObjectURL(els.browserPreview.dataset.objectUrl);
    const objectUrl = URL.createObjectURL(blob);
    els.browserPreview.dataset.objectUrl = objectUrl;
    els.browserPreview.src = objectUrl;
    els.browserPreview.hidden = false;
    els.browserPreviewEmpty.hidden = true;
  } catch {
    els.browserPreview.hidden = true;
    els.browserPreview.removeAttribute('src');
    els.browserPreviewEmpty.hidden = false;
    els.browserPreviewEmpty.textContent = 'Browser preview could not load. The step log and saved results are still available.';
  }
}

function renderBrowserResults(payload = {}) {
  if (!els.browserResults) return;
  const results = Array.isArray(payload.results) ? payload.results : [];
  const activeResults = results.filter(result => !browserResultIsHidden(result));
  if (!activeResults.length) {
    els.browserResults.hidden = true;
    els.browserResults.innerHTML = '';
    return;
  }
  els.browserResults.hidden = false;
  const meta = [
    payload.query ? `Query: ${payload.query}` : '',
    payload.filters ? `Filters: ${payload.filters}` : '',
    payload.generatedAt ? `Saved: ${payload.generatedAt.slice(0, 19).replace('T', ' ')}` : '',
  ].filter(Boolean).join(' · ');
  const routed = Boolean(payload.consumedAt);
  els.browserResults.innerHTML = `
    <div class="browser-results-header">
      <div>
        <strong>${activeResults.length} LinkedIn result${activeResults.length === 1 ? '' : 's'} saved for Verified Scan</strong>
        <span>${escapeHtml(meta || 'Run Verified Scan to score and route these candidates.')}</span>
      </div>
      <span class="browser-results-note">${routed ? 'Routed into scan buckets' : 'Not shortlisted yet'}</span>
    </div>
    <div class="browser-result-list">
      ${activeResults.slice(0, 12).map(result => `
        <article class="browser-result-card">
          <div>
            <strong>${escapeHtml(result.title || 'Untitled LinkedIn role')}</strong>
            <span>${escapeHtml([result.company, result.location].filter(Boolean).join(' · ') || result.snippet || 'LinkedIn browser result')}</span>
          </div>
          ${result.url ? `<a href="${escapeHtml(result.url)}" target="_blank" rel="noreferrer">Open</a>` : ''}
        </article>
      `).join('')}
    </div>
  `;
}

function renderConnections(connections = {}) {
  if (!els.connectionsList) return;
  const providers = Array.isArray(connections.providers) ? connections.providers : [];
  const providerSummary = providers.length
    ? `${providers.filter(item => item.enabled).length}/${providers.length} providers enabled`
    : 'Provider status unavailable';
  const boards = connections.targetCompanies?.generatedBoards || [];
  els.connectionsList.innerHTML = `
    <div class="connection-row">
      <div><strong>Scanned-jobs database</strong><span>Profile-local SQLite storage</span></div>
      <small>${Number(connections.database?.jobCount || 0)} jobs / ${Number(connections.database?.applicationCount || 0)} applications / ${Number(connections.database?.captureCount || 0)} captures</small>
    </div>
    <div class="connection-row">
      <div><strong>LinkedIn</strong><span>${escapeHtml(connections.linkedin?.dataStored || 'Manual browser session only')}</span></div>
      <small>${escapeHtml(connections.linkedin?.status || 'not_set_up')}</small>
    </div>
    <div class="connection-row">
      <div><strong>API/feed providers</strong><span>${escapeHtml(providerSummary)}</span></div>
      <small>${providers.filter(item => item.enabled).map(item => item.name).slice(0, 4).join(', ') || 'none'}</small>
    </div>
    <div class="connection-row">
      <div><strong>Custom RSS</strong><span>User-supplied feeds stored in local config</span></div>
      <small>${Number(connections.customRss?.count || 0)} feed${Number(connections.customRss?.count || 0) === 1 ? '' : 's'}</small>
    </div>
    <div class="connection-row">
      <div><strong>Target company resolver</strong><span>Generates Greenhouse, Lever, and Ashby board candidates</span></div>
      <small>${Number(connections.targetCompanies?.count || 0)} companies / ${boards.length} board candidates</small>
    </div>
    <div class="connection-row">
      <div><strong>Email import</strong><span>${escapeHtml(connections.email?.dataStored || 'Local paste/import only')}</span></div>
      <small>${Number(connections.email?.importedCount || 0)} import${Number(connections.email?.importedCount || 0) === 1 ? '' : 's'}</small>
    </div>
  `;
}

async function refreshBrowserStatus() {
  if (!state.authenticated || !els.browserPanel) return null;
  try {
    const browser = await api('/api/browser/status');
    renderBrowserStatus(browser);
    if (browser.hasResults || Number(browser.resultCount || 0) > 0) {
      const results = await api('/api/browser/results');
      renderBrowserResults(results);
    } else {
      renderBrowserResults({ results: [] });
    }
    return browser;
  } catch {
    return null;
  }
}

async function readFileDataUrl(file) {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(file);
  });
}

function addMessage(kind, text, persist = false) {
  const div = document.createElement('div');
  div.className = `msg ${kind}`;
  if (kind === 'assistant' && !text) {
    div.classList.add('thinking');
    div.innerHTML = `<span class="thinking-label">${escapeHtml(state.meta.assistantName)} is thinking</span><span class="pulse-dots"><i></i><i></i><i></i></span>`;
  } else {
    div.innerHTML = renderMessage(text);
  }
  els.chatLog.append(div);
  els.chatLog.scrollTop = els.chatLog.scrollHeight;
  return div;
}

function renderMessage(text) {
  const publicText = displayBrandText(text)
    .replace(/\r/g, '')
    .split('\n')
    .filter(line => !/^\s*(?:[-*]\s*)?\[app-action\]/.test(line) && !line.startsWith('[process exited'))
    .join('\n')
    .trim();
  const normalizedText = publicText
    .replace(/Applications\s*\n\s*[\\/]/g, 'Applications/')
    .replace(/\.docx\s*\n/g, '.docx\n')
    .replace(/\.pdf\s*\n/g, '.pdf\n')
    .replace(/\.md\s*\n/g, '.md\n')
    .replace(/Blocked:\s*DOCX\s*\+\s*PDF generation[\s\S]*?(?=\n\n[A-Z][^:\n]{0,60}:|\n\n$|$)/gi, 'DOCX/PDF generation was not completed. Use Resume Studio > Tailor for This JD to create final download files.')
    .replace(/```[\s\S]*?(?:python|generate_[\w-]+\.py|D:\/Automation)[\s\S]*?```/gi, '')
    .replace(/^.*target="_blank".*$/gmi, '')
    .replace(/^.*rel="noreferrer".*$/gmi, '')
    .replace(/^Download\s+\S*%[0-9A-F]{2}\S*.*$/gmi, '')
    .replace(/^<\s*$/gm, '')
    .replace(/^.*generate_[\w-]+\.py.*$/gmi, '')
    .replace(/^.*--sandbox\s+.*$/gmi, '')
    .replace(/^.*approve this one command.*$/gmi, '')
    .replace(/^python\s+["'`].*$/gmi, '');
  const diffBlocks = [];
  const tableBlocks = [];
  const withDiffPlaceholders = normalizedText.replace(/```diff\n([\s\S]*?)```/g, (_match, body) => {
    const id = diffBlocks.length;
    diffBlocks.push(renderDiffBlock(body));
    return `@@DIFF_BLOCK_${id}@@`;
  });
  const withTablePlaceholders = withDiffPlaceholders.replace(/((?:^\|.+\|\n?){2,})/gm, (block) => {
    const rows = block.trim().split('\n');
    if (rows.length < 2 || !/^\|\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|$/.test(rows[1])) return block;
    const id = tableBlocks.length;
    tableBlocks.push(renderTableBlock(rows));
    return `@@TABLE_BLOCK_${id}@@`;
  });
  const escaped = escapeHtml(withTablePlaceholders);
  const downloadLinks = escaped.replace(/Download:\s*([^|\n]+?)\s*\|\s*(\/api\/download(?:-by-path)?\?path=[^\s<]+)/g, (_match, label, href) => {
    if (href.includes('&quot;') || href.includes('target=') || href.includes('rel=')) return '';
    const pathParam = href.match(/[?&]path=([^&]+)/)?.[1] || '';
    try {
      if (pathParam && !/\.(pdf|docx|md)$/i.test(decodeURIComponent(pathParam))) return '';
    } catch {
      return '';
    }
    return `<a class="download-card" href="${href}" target="_blank" rel="noreferrer">Download ${label.trim()}</a>`;
  });
  const fileLinked = downloadLinks.replace(/((?:[A-Za-z]:)?[\\/][^\n`<]+?\.(?:pdf|docx|md)|Applications\/[^\n`<]+?\.(?:pdf|docx|md))/g, (path) => {
    const clean = path.trim();
    if (clean.startsWith('/api/')) return clean;
    if (!/\.(pdf|docx|md)$/i.test(clean)) return clean;
    if (clean.includes('/a>') || clean.includes('target=') || clean.includes('rel=') || clean.includes('"') || clean.includes("'") || clean.includes('&quot;') || clean.includes('&lt;')) return clean;
    const fileName = clean.split(/[\\/]/).pop();
    return `<a class="download-card" href="/api/download-by-path?path=${encodeURIComponent(clean)}" target="_blank" rel="noreferrer">Download ${escapeHtml(fileName)}</a>`;
  });
  const linked = linkifyUrls(fileLinked);
  let rendered = linked
    .replace(/^###\s+(.+)$/gm, '<h4>$1</h4>')
    .replace(/^##\s+(.+)$/gm, '<h3>$1</h3>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>');
  diffBlocks.forEach((html, id) => { rendered = rendered.replace(`@@DIFF_BLOCK_${id}@@`, html); });
  tableBlocks.forEach((html, id) => { rendered = rendered.replace(`@@TABLE_BLOCK_${id}@@`, html); });
  return rendered;
}

function linkifyUrls(html) {
  return String(html || '').replace(/(^|[\s(])((?:https?:\/\/|www\.)[^\s<]+)/gi, (match, prefix, rawUrl) => {
    if (match.includes('href=') || match.includes('/a>')) return match;
    const trailing = rawUrl.match(/[).,;:!?]+$/)?.[0] || '';
    const core = trailing ? rawUrl.slice(0, -trailing.length) : rawUrl;
    const href = core.toLowerCase().startsWith('www.') ? `https://${core}` : core;
    if (!/^https?:\/\//i.test(href)) return match;
    return `${prefix}<a href="${href}" target="_blank" rel="noreferrer">${core}</a>${trailing}`;
  });
}

function extractJsonObjectAt(text, start) {
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escape) {
        escape = false;
      } else if (ch === '\\') {
        escape = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === '{') {
      depth += 1;
    } else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return '';
}

function extractAppActions(text = '') {
  const actions = [];
  const source = String(text || '');
  const markerPattern = /(?:^|\n)\s*(?:[-*]\s*)?\[app-action\]\s*/g;
  for (const match of source.matchAll(markerPattern)) {
    const markerEnd = match.index + match[0].length;
    const objectStart = source.indexOf('{', markerEnd);
    if (objectStart === -1) continue;
    const jsonText = extractJsonObjectAt(source, objectStart);
    if (!jsonText) continue;
    try {
      actions.push(JSON.parse(jsonText));
    } catch {}
  }
  return actions;
}

function plainTextFromRendered(html) {
  const div = document.createElement('div');
  div.innerHTML = String(html || '').replace(/<br\s*\/?>/gi, '\n');
  return div.textContent
    .replace(/Run verified agent scan/gi, 'Run Verified Scan')
    .replace(/Use "Run Verified Scan"/g, 'Use Run Verified Scan')
    .trim();
}

function renderTableBlock(rows) {
  const split = (row) => row.replace(/^\||\|$/g, '').split('|').map(cell => cell.trim());
  const header = split(rows[0]);
  const body = rows.slice(2).map(split);
  return `<div class="table-wrap"><table><thead><tr>${header.map(cell => `<th>${escapeHtml(cell)}</th>`).join('')}</tr></thead><tbody>${body.map(row => `<tr>${row.map(cell => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

function renderDiffBlock(body) {
  const removed = [];
  const added = [];
  for (const line of body.split('\n')) {
    if (line.startsWith('-') && !line.startsWith('---')) removed.push(line.slice(1).trim());
    if (line.startsWith('+') && !line.startsWith('+++')) added.push(line.slice(1).trim());
  }
  if (!removed.length && !added.length) return `<pre class="diff-raw">${escapeHtml(body)}</pre>`;
  return `<div class="diff-grid"><div><span>Before</span>${removed.map(line => `<p>${escapeHtml(line)}</p>`).join('')}</div><div><span>After</span>${added.map(line => `<p>${escapeHtml(line)}</p>`).join('')}</div></div>`;
}

function renderHistory(history = []) {
  els.chatLog.innerHTML = '';
  for (const item of history) {
    if (item.role === 'user') addMessage('user', item.message || '');
    if (item.role === 'assistant') addMessage('assistant', item.message || '');
  }
  const restored = mergeScanEvaluationsFromText(history
    .filter(item => item.role === 'assistant')
    .map(item => item.message || '')
    .join('\n\n'));
  if (restored.length && state.lastScanRaw) renderScanResults(state.lastScanRaw);
  if (!history.length) renderCareerBrief();
}

function normalizeText(value) {
  return String(value || '').toLowerCase();
}

function cardCompanyRole(card) {
  const parts = card.title.split(/—|–|\s-\s/).map(part => part.trim()).filter(Boolean);
  return {
    company: parts[0] || card.title,
    role: parts.slice(1).join(' - ') || card.title,
  };
}

function appBucket(card) {
  const stateText = normalizeText(`${card.section} ${card.fields.Status || ''}`);
  const actionText = normalizeText(card.fields['Next action'] || '');
  const haystack = `${stateText} ${actionText}`;
  if (/\b(lost|declined|withdrawn|withdrew)\b/.test(stateText)) return 'lost';
  if (/\b(offer|accepted)\b/.test(stateText)) return 'offers';
  if (stateText.includes('rejected') || stateText.includes('close-out')) return 'rejected';
  if (stateText.includes('passed') || stateText.includes('not applied')) return 'archived';
  if (stateText.includes('watchlist')) return 'archived';
  if (/\b(screen_scheduled|screen scheduled|interviewing|interview)\b/.test(haystack)) return 'interviews';
  if (haystack.includes('package ready') || haystack.includes('packaged')) return 'ready';
  if (haystack.includes('applied') || haystack.includes('submitted')) return 'applied';
  if (stateText.includes('needs_status_confirmation') || stateText.includes('needs status confirmation')) return 'needs-decision';
  return 'needs-decision';
}

function isLiveApplication(card) {
  return !['archived', 'rejected', 'lost'].includes(appBucket(card));
}

function isFollowUpDue(card) {
  const text = normalizeText(`${card.fields['Next action'] || ''} ${card.fields.Notes || ''}`);
  return isLiveApplication(card) && appBucket(card) !== 'interviews' && /\bfollow[- ]?up\b|\bmonitor\b|\btouchpoint\b/.test(text);
}

function applicationDate(card) {
  const raw = card.fields['Date submitted'] || card.fields.Date || card.fields['Date found'] || card.scoreDate || '';
  const match = String(raw || '').match(/\d{4}-\d{2}-\d{2}/);
  return match ? new Date(`${match[0]}T00:00:00`) : null;
}

function isWithinRollingDays(card, days) {
  const date = applicationDate(card);
  if (!date || Number.isNaN(date.getTime())) return false;
  const cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - days + 1);
  return date >= cutoff;
}

function hasUiScore(value) {
  if (value == null) return false;
  if (typeof value === 'string' && value.trim() === '') return false;
  return Number.isFinite(Number(value));
}

function fitLabel(card) {
  const text = normalizeText(`${card.fields.Status || ''} ${card.fields.Notes || ''} ${card.fields['Next action'] || ''}`);
  if (hasUiScore(card.score)) {
    const score = Number(card.score);
    if (score >= 80) return { label: 'High fit', tone: 'strong' };
    if (score >= 65) return { label: 'Good fit', tone: 'good' };
    if (score >= 45) return { label: 'Review', tone: 'watch' };
    return { label: 'Low fit', tone: 'low' };
  }
  if (text.includes('stretch') || text.includes('mismatch')) return { label: 'Watch fit', tone: 'watch' };
  if (text.includes('integration') || text.includes('chief of staff')) return { label: 'Priority', tone: 'good' };
  return { label: 'Needs score', tone: 'neutral' };
}

function primaryAction(card) {
  const bucket = appBucket(card);
  const next = normalizeText(card.fields['Next action'] || card.fields.Status || '');
  if (bucket === 'interviews') return 'Prep Interview';
  if (bucket === 'offers') return 'Review Offer';
  if (bucket === 'lost') return 'Review Close-Out';
  if (bucket === 'rejected') return 'Review Rejection';
  if (isFollowUpDue(card)) return 'Draft Follow-up';
  if (bucket === 'ready') return next.includes('confirm') || next.includes('decide') ? 'Review Package' : 'Submit Application';
  if (bucket === 'applied') return 'Draft Follow-up';
  return 'Review Role';
}

function lastTouch(card) {
  return card.fields['Date submitted'] || card.fields['Date drafted'] || card.fields['Last touch'] || card.scoreDate || 'Not logged';
}

function computeStats(cards) {
  const applicationBuckets = ['applied', 'interviews', 'offers', 'lost', 'rejected'];
  const applied = cards.filter(card => applicationBuckets.includes(appBucket(card))).length;
  const rejected = cards.filter(card => appBucket(card) === 'rejected').length;
  const stats = {
    applied,
    rejected,
    stillAlive: Math.max(0, applied - rejected),
    interviews: cards.filter(card => appBucket(card) === 'interviews').length,
    offers: cards.filter(card => appBucket(card) === 'offers').length,
    lost: cards.filter(card => appBucket(card) === 'lost').length,
  };
  stats.weekly = stats.stillAlive;
  return stats;
}

function renderStatusSummary(cards) {
  if (!els.statusSummary) return;
  const stats = computeStats(cards);
  const items = [
    ['Applied', stats.applied, 'Total applications all time'],
    ['Rejected', stats.rejected, 'Closed out'],
    ['Still Alive', stats.stillAlive, 'Applied minus rejected'],
    ['Interviews', stats.interviews, 'Active interview loops'],
    ['Offers', stats.offers, 'Offer-stage roles'],
    ['Lost', stats.lost, 'Withdrawn or lost'],
  ];
  els.statusSummary.innerHTML = items.map(([label, value, detail]) => `
    <article class="summary-card">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      <small>${escapeHtml(detail)}</small>
    </article>
  `).join('');
  if (els.navWeeklyProgress) els.navWeeklyProgress.textContent = `${stats.stillAlive} still alive`;
}

function renderStatusTabs(cards) {
  if (!els.statusTabs) return;
  const stats = computeStats(cards);
  const validFilters = new Set(['applied', 'rejected', 'stillalive', 'interviews', 'offers', 'lost']);
  if (!validFilters.has(state.appFilter)) {
    state.appFilter = 'applied';
    localStorage.setItem('appFilter', state.appFilter);
  }
  const tabs = [
    ['applied', 'Applied', stats.applied],
    ['rejected', 'Rejected', stats.rejected],
    ['stillalive', 'Still Alive', stats.stillAlive],
    ['interviews', 'Interviews', stats.interviews],
    ['offers', 'Offers', stats.offers],
    ['lost', 'Lost', stats.lost],
  ];
  els.statusTabs.innerHTML = tabs.map(([key, label, count]) => `
    <button class="status-tab ${state.appFilter === key ? 'active' : ''}" data-filter="${escapeHtml(key)}" type="button">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(count)}</strong>
    </button>
  `).join('');
  $$('.status-tab').forEach(button => {
    button.addEventListener('click', () => {
      state.appFilter = button.dataset.filter;
      localStorage.setItem('appFilter', state.appFilter);
      renderApplications(state.trackerCards);
    });
  });
}

function statusFilterLabel(filter) {
  return {
    applied: 'Applied',
    stillalive: 'Still Alive',
    interviews: 'Interviews',
    offers: 'Offers',
    lost: 'Lost',
    rejected: 'Rejected',
  }[filter] || 'Current';
}

function trackedApplicationCards(cards) {
  return cards.filter(card => ['applied', 'interviews', 'offers'].includes(appBucket(card)));
}

function allApplicationCards(cards) {
  return cards.filter(card => ['applied', 'interviews', 'offers', 'lost', 'rejected'].includes(appBucket(card)));
}

function filteredApplicationCards(cards) {
  if (state.appFilter === 'rejected') return cards.filter(card => appBucket(card) === 'rejected');
  if (state.appFilter === 'stillalive') return allApplicationCards(cards).filter(card => appBucket(card) !== 'rejected');
  if (state.appFilter === 'applied' || state.appFilter === 'all') return allApplicationCards(cards);
  if (state.appFilter === 'interviews') return cards.filter(card => appBucket(card) === 'interviews');
  if (state.appFilter === 'offers') return cards.filter(card => appBucket(card) === 'offers');
  if (state.appFilter === 'lost') return cards.filter(card => appBucket(card) === 'lost');
  return allApplicationCards(cards);
}

function applicationSearchText(card) {
  const fields = card.fields || {};
  return [
    card.title,
    card.section,
    fields.Status,
    fields['Date submitted'],
    fields['Comp posted'],
    fields.Location,
    fields['Next action'],
    fields.Notes,
    card.score,
    card.scoreBreakdown,
    card.scoreDate,
    card.scoreSource,
  ].filter(value => value != null && value !== '').join(' ').toLowerCase();
}

function applyApplicationSearch(cards) {
  const query = normalizeText(state.applicationQuery).trim();
  if (!query) return cards;
  const terms = query.split(/\s+/).filter(Boolean);
  return cards.filter(card => {
    const haystack = applicationSearchText(card);
    return terms.every(term => haystack.includes(term));
  });
}

function roleActionPrompt(card) {
  const label = primaryAction(card);
  if (label === 'Draft Follow-up') return `Draft a follow-up for ${card.title}.`;
  if (label === 'Submit Application') return `Help me submit ${card.title}. Confirm the package and next step.`;
  if (label === 'Prep Interview') return `Prep me for an interview for ${card.title}.`;
  if (label === 'Review Rejection') return `Summarize the rejection for ${card.title} and update any pattern notes.`;
  return `Review the package and fit risks for ${card.title}.`;
}

function renderCareerBrief() {
  const cards = state.trackerCards || [];
  const stats = computeStats(cards);
  const suggestedPrompts = [
    'Review the strongest still-alive opportunity.',
    'Prep for the next active interview loop.',
    'Run a verified scan for the primary target lanes.',
  ].slice(0, 3);
  els.chatLog.innerHTML = `
    <section class="career-brief msg assistant">
      <p class="eyebrow">Career Brief</p>
      <h3>${escapeHtml(state.meta.assistantName)} is ready to operate from the current tracker.</h3>
      <p>${stats.applied} total applications are logged, ${stats.rejected} are rejected, and ${stats.stillAlive} are still alive.</p>
      <div class="brief-block">
        <strong>Suggested prompts</strong>
        ${suggestedPrompts.map(prompt => `<button class="brief-prompt" type="button">${escapeHtml(prompt)}</button>`).join('')}
      </div>
    </section>
  `;
  $$('.brief-prompt').forEach(button => button.addEventListener('click', () => {
    els.message.value = button.textContent.trim();
    els.message.focus();
  }));
}

function refreshCareerBriefIfOpen() {
  const children = Array.from(els.chatLog.children);
  const onlyCareerBrief = children.length === 1 && children[0].classList.contains('career-brief');
  if (!children.length || onlyCareerBrief) renderCareerBrief();
}

function renderApplications(cards = []) {
  state.trackerCards = cards;
  renderStatusSummary(cards);
  renderStatusTabs(cards);
  if (els.applicationSearch && els.applicationSearch.value !== state.applicationQuery) {
    els.applicationSearch.value = state.applicationQuery;
  }
  if (els.clearApplicationSearch) els.clearApplicationSearch.hidden = !state.applicationQuery;
  const baseVisible = filteredApplicationCards(cards);
  const visible = applyApplicationSearch(baseVisible);
  els.applicationCards.innerHTML = '';
  if (!visible.length) {
    const query = state.applicationQuery.trim();
    els.applicationCards.innerHTML = query
      ? `<div class="empty-mini">No ${escapeHtml(statusFilterLabel(state.appFilter).toLowerCase())} applications match "${escapeHtml(query)}".</div>`
      : `<div class="empty-mini">No roles in this status yet. Add a role or sync the tracker to refresh the workspace.</div>`;
    refreshCareerBriefIfOpen();
    return;
  }
  for (const card of visible) {
    const div = document.createElement('article');
    const bucket = appBucket(card);
    const fit = fitLabel(card);
    const { company, role } = cardCompanyRole(card);
    const statusText = card.fields.Status || card.section;
    const scoreValue = hasUiScore(card.score) ? `${card.score}/100` : 'Not scored';
    const scoreTooltipParts = [];
    if (card.scoreBreakdown) scoreTooltipParts.push(card.scoreBreakdown);
    if (card.scoreDate) scoreTooltipParts.push(`from ${card.scoreDate} scan`);
    const scoreTooltip = scoreTooltipParts.join(' - ') || 'No verified-scan score on file for this role.';
    div.className = `app-card app-card-${bucket}`;
    div.innerHTML = `
      <header>
        <div>
          <p class="company-name">${escapeHtml(company)}</p>
          <h3>${escapeHtml(role)}</h3>
          <div class="score-row" title="${escapeHtml(scoreTooltip)}">Score <strong>${escapeHtml(scoreValue)}</strong></div>
        </div>
        <span class="badge" title="${escapeHtml(statusText)}">${escapeHtml(statusLabel(statusText))}</span>
      </header>
      <div class="chip-row">
        <span>${escapeHtml(card.fields['Comp posted'] || 'Comp not stated')}</span>
        <span>${escapeHtml(card.fields.Location || 'Location not stated')}</span>
        <span class="fit-pill fit-${fit.tone}">${escapeHtml(fit.label)}</span>
      </div>
      <dl class="card-facts">
        <div><dt>Last touch</dt><dd>${escapeHtml(lastTouch(card))}</dd></div>
        <div><dt>Next action</dt><dd>${escapeHtml(card.fields['Next action'] || 'Review current package and decide next step.')}</dd></div>
      </dl>
      <button class="card-action" type="button">${escapeHtml(primaryAction(card))}</button>
    `;
    div.addEventListener('click', (event) => {
      if (event.target.closest('button')) return;
      state.selectedRole = card;
      addMessage('system', `Viewing ${card.title}. Chat questions now include this role as context.`);
    });
    div.querySelector('.card-action').addEventListener('click', () => {
      state.selectedRole = card;
      els.message.value = roleActionPrompt(card);
      els.message.focus();
    });
    els.applicationCards.append(div);
  }
  refreshCareerBriefIfOpen();
}

function statusLabel(value) {
  const text = String(value || '').toLowerCase();
  if (text.includes('rejected')) return 'Rejected';
  if (text.includes('passed')) return 'Passed';
  if (text.includes('watchlist')) return 'Watchlist';
  if (text.includes('needs_status_confirmation')) return 'Confirm';
  if (text.includes('package ready')) return 'Ready';
  if (text.includes('applied') || text.includes('submitted')) return 'Applied';
  if (text.includes('draft')) return 'Draft';
  if (text.includes('withdraw')) return 'Withdrawn';
  if (text.includes('dead')) return 'Pass';
  return String(value || 'Status').split(/[—-]/)[0].trim().slice(0, 18) || 'Status';
}

function renderFiles(files = []) {
  state.files = files;
  const query = state.fileQuery.trim().toLowerCase();
  const groups = groupLibraryPackages(files);
  const visible = query
    ? groups.filter(group => group.searchText.includes(query))
    : groups;
  els.filesList.innerHTML = '';
  if (!visible.length) {
    els.filesList.innerHTML = `<div class="empty-mini">${query ? 'No matching resume-library files.' : 'Resume packages and master files will appear here.'}</div>`;
    return;
  }
  for (const group of visible) {
    const row = document.createElement('div');
    row.className = 'file';
    const primary = group.files.find(file => file.kind === 'resume' && file.ext === '.pdf')
      || group.files.find(file => file.ext === '.pdf')
      || group.files.find(file => file.ext === '.docx')
      || group.files[0];
    const size = Math.round(group.files.reduce((sum, file) => sum + Number(file.size || 0), 0) / 1024);
    const formats = group.files.map(file => filePackageLabel(file)).join(', ');
    row.innerHTML = `
      <a href="/api/download?path=${encodeURIComponent(primary.downloadPath)}" target="_blank" rel="noreferrer">${escapeHtml(group.title)}</a>
      <div class="file-meta">${escapeHtml(group.area)} / ${escapeHtml(group.folder)}<br>Files: ${escapeHtml(formats)} / ${size} KB / ${new Date(group.modified).toLocaleString()}</div>
      <div class="file-actions">
        ${group.files.map(file => `<a href="/api/download?path=${encodeURIComponent(file.downloadPath)}" target="_blank" rel="noreferrer">${escapeHtml(fileActionLabel(file))}</a>`).join('')}
        <button type="button">Tailor</button>
      </div>
    `;
    row.querySelector('button').addEventListener('click', () => {
      activateView('resume');
      els.message.value = `Use ${group.title} as context for tailoring.`;
      els.message.focus();
    });
    els.filesList.append(row);
  }
}

function groupLibraryPackages(files = []) {
  const groups = new Map();
  for (const file of files) {
    const ext = fileExtension(file.name);
    const folder = String(file.rel || '').split('/').slice(0, -1).join('/') || file.area || 'Resume Library';
    const key = `${String(file.area || '').toLowerCase()}|${normalizeLibraryFolder(folder)}`;
    if (!groups.has(key)) {
      groups.set(key, {
        area: file.area || 'Resume Library',
        folder,
        title: libraryPackageTitle(file, folder),
        modified: file.modified,
        files: [],
        searchText: '',
      });
    }
    const group = groups.get(key);
    group.files.push({ ...file, ext, kind: libraryDocumentKind(file) });
    if (String(file.modified || '').localeCompare(String(group.modified || '')) > 0) group.modified = file.modified;
  }

  return [...groups.values()].map(group => {
    group.files.sort((a, b) =>
      fileKindRank(b.kind) - fileKindRank(a.kind)
      || fileFormatRank(b.ext) - fileFormatRank(a.ext)
      || b.modified.localeCompare(a.modified)
    );
    group.searchText = [
      group.title,
      group.area,
      group.folder,
      ...group.files.flatMap(file => [file.name, file.rel]),
    ].join(' ').toLowerCase();
    return group;
  }).sort((a, b) => b.modified.localeCompare(a.modified));
}

function fileExtension(name = '') {
  return String(name).match(/\.[^.]+$/)?.[0]?.toLowerCase() || '';
}

function fileFormatRank(ext) {
  return { '.docx': 3, '.pdf': 2, '.md': 1 }[ext] || 0;
}

function fileKindRank(kind) {
  return { resume: 4, 'designed-resume': 3, 'cover-letter': 2, document: 1 }[kind] || 0;
}

function filePackageLabel(file) {
  const type = file.kind === 'cover-letter' ? 'Cover' : file.kind === 'designed-resume' ? 'Designed Resume' : file.kind === 'resume' ? 'ATS Resume' : 'File';
  if (file.kind === 'resume' && file.ext === '.docx') return 'ATS Resume DOCX - portal default';
  if (file.kind === 'resume' && file.ext === '.pdf') return 'ATS Resume PDF - text-based';
  if (file.ext === '.pdf') return `${type} PDF - text-based`;
  return `${type} ${file.ext.replace('.', '').toUpperCase()}`;
}

function fileActionLabel(file) {
  const type = file.kind === 'cover-letter' ? 'Cover' : file.kind === 'designed-resume' ? 'Designed Resume' : file.kind === 'resume' ? 'ATS Resume' : 'File';
  if (file.kind === 'resume' && file.ext === '.docx') return 'ATS Resume DOCX';
  if (file.kind === 'resume' && file.ext === '.pdf') return 'ATS Resume PDF';
  if (file.ext === '.pdf') return `${type} PDF`;
  if (file.ext === '.docx') return `${type} DOCX`;
  if (file.ext === '.md') return `${type} Draft`;
  return 'Open';
}

function libraryDocumentKind(file) {
  const name = String(file.name || '').toLowerCase();
  if (name.includes('designed resume')) return 'designed-resume';
  if (name.includes('cover letter')) return 'cover-letter';
  if (name.includes('resume')) return 'resume';
  return 'document';
}

function cleanLibraryTitle(name = '') {
  return String(name).replace(/\.[^.]+$/, '');
}

function libraryPackageTitle(file, folder) {
  if (file.area === 'Master Resume') return `${state.meta.candidateName} - Master Resume`;
  if (file.area === 'Resume Studio' && String(file.name || '').toLowerCase().includes('master resume')) {
    return `${state.meta.candidateName} - Master Resume`;
  }
  return folder || cleanLibraryTitle(file.name);
}

function normalizeLibraryFolder(folder = '') {
  return String(folder || '')
    .replace(new RegExp(state.meta.candidateName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), ' ')
    .replace(new RegExp(state.meta.candidateFirst.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), ' ')
    .replace(/\bcover letter\b/gi, ' ')
    .replace(/\bresume\b/gi, ' ')
    .replace(/\bapplications\b/gi, ' ')
    .replace(/\bpdf\b|\bdocx\b|\bmd\b/gi, ' ')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeScanText(text) {
  return String(text || '')
    .replaceAll('âœ…', '✅')
    .replaceAll('âŒ', '❌')
    .replaceAll('âš ï¸', '⚠️')
    .replaceAll('â€“', '-')
    .replaceAll('â€”', '-')
    .replaceAll('â†’', '->')
    .replaceAll('â‰ˆ', '~')
    .replaceAll('Ã—', 'x');
}

function parseScanReport(raw) {
  const text = normalizeScanText(raw);
  const reportIndex = text.indexOf('# Scan Results');
  const report = reportIndex >= 0 ? text.slice(reportIndex) : text;
  const savedPath = text.match(/Saved\s+(.+?Scan Results(?: - [^-]+)? - \d{4}-\d{2}-\d{2}(?:T\d{2}-\d{2}-\d{2}-\d{3}Z)?\.md)/)?.[1]?.trim() || '';
  const reportTitle = report.match(/#\s+(Scan Results(?: - [^-]+)? - \d{4}-\d{2}-\d{2}(?:T\d{2}-\d{2}-\d{2}-\d{3}Z)?)/)?.[1] || '';
  const reportDate = reportTitle.match(/(\d{4}-\d{2}-\d{2}(?:T\d{2}-\d{2}-\d{2}-\d{3}Z)?)$/)?.[1] || '';
  const reportFile = savedPath.split(/[\\/]/).pop() || (reportTitle ? `${reportTitle}.md` : reportDate ? `Scan Results - ${reportDate}.md` : '');
  const rolesReviewed = text.match(/Roles reviewed:\s*(\d+)/i)?.[1] || '';
  const sections = report.split(/\n###\s+/).slice(1);
  const roles = sections.map(section => {
    const [rawTitle, ...bodyLines] = section.split('\n');
    const body = bodyLines.join('\n');
    const field = (label) => body.match(new RegExp(`- \\*\\*${label}:\\*\\*\\s*(.+)`, 'i'))?.[1]?.trim() || '';
    const verification = field('Verification');
    const scoreText = field('Score');
    const isJsRendered = /JS-RENDERED|REDIRECTED|static fetch|client-side|hydrat|redirected/i.test(verification);
    const parsedScore = Number(scoreText.match(/(\d{1,3})\s*\/\s*100/)?.[1]);
    const score = isJsRendered ? null : parsedScore;
    return {
      title: rawTitle.trim(),
      verification,
      source: field('Source') || (linkHostnameIs(field('Link'), 'linkedin.com') ? 'LinkedIn' : ''),
      applyType: field('Apply type'),
      location: field('Location'),
      comp: field('Posted comp'),
      link: field('Link'),
      score: Number.isFinite(score) ? score : null,
      scoreText,
      action: field('Recommended action'),
      needsDetails: isJsRendered || /withheld|needs full JD|paste/i.test(scoreText),
    };
  }).filter(role => role.title && !role.title.startsWith('WebFetch Evidence'));
  return { savedPath, reportFile, rolesReviewed, roles };
}

function dedupeScanRoles(roles = []) {
  const byKey = new Map();
  for (const role of roles) {
    const parsed = scanCompanyRole(role.title);
    const key = normalizeRoleKey([
      parsed.company,
      parsed.role,
    ].join(' '));
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, role);
      continue;
    }
    const existingScore = Number(existing.score);
    const nextScore = Number(role.score);
    const shouldReplace =
      (!Number.isFinite(existingScore) && Number.isFinite(nextScore))
      || (scanNeedsDetails(existing) && !scanNeedsDetails(role))
      || (!existing.link && role.link)
      || (String(role.action || '').length > String(existing.action || '').length);
    if (shouldReplace) byKey.set(key, role);
  }
  return [...byKey.values()];
}

function scanIsPassRecommendation(role) {
  return /\b(pass|skip|auto-reject|do not pursue|do not package)\b/i.test(role.action || '');
}

function scanTone(role) {
  if (scanIsPassRecommendation(role)) return 'watch';
  if (/skip|hold|borderline/i.test(role.action)) return 'watch';
  if (role.score >= 80) return 'strong';
  if (role.score >= 65) return 'good';
  if (/JS-RENDERED|REDIRECTED|⚠️/.test(role.verification)) return 'verify';
  return 'neutral';
}

function scanSourceBadge(role) {
  const sourceText = `${role.source || ''} ${role.link || ''}`.toLowerCase();
  if (!sourceText.includes('linkedin')) return '';
  return '<span class="linkedin-source-badge" title="LinkedIn source">in</span>';
}

function scanPrimaryAction(role) {
  if (scanIsPassRecommendation(role)) return 'Remove';
  if (role.chatPromoted) return 'Package Role';
  if (/JS-RENDERED|REDIRECTED|⚠️/.test(role.verification)) return 'Verify in Browser';
  if (/hold/i.test(role.action)) return 'Hold for Now';
  if (/skip|auto-reject|lockout/i.test(role.action)) return 'Skip';
  if (/package|submit/i.test(role.action)) return 'Package Role';
  return 'Review Role';
}

function scanDismissKey(role, result) {
  return [
    result.reportFile || result.savedPath || 'current-scan',
    role.title || '',
    role.link || '',
  ].join('|').toLowerCase();
}

function scanPersistentKey(role, result) {
  return normalizeRoleKey([
    result.reportFile || result.savedPath || 'current-scan',
    role.title || '',
    role.link || '',
  ].join(' '));
}

function normalizeUrlKey(value = '') {
  return String(value || '').trim().toLowerCase().replace(/\/+$/, '');
}

function scanReportDateKey(value = '') {
  return String(value || '').match(/\d{4}-\d{2}-\d{2}/)?.[0] || '';
}

function scanSourcePlaceholderCompany(value = '') {
  return /^(builtin|linkedin|wellfound|yc|waas|work at a startup|the muse|muse|websearch|rss)$/i.test(String(value || '').trim());
}

function scanRoleVariantKeys(value = '') {
  const full = String(value || '').trim();
  const variants = [
    full,
    full.split(/\s+-\s+/)[0],
    full.replace(/\s+\([^)]*\)\s*$/g, ''),
  ].map(normalizeRoleKey).filter(Boolean);
  return [...new Set(variants)];
}

function scanIdentityForRole(role = {}) {
  const parsed = scanCompanyRole(role.title);
  const company = parsed.company || '';
  const roleName = parsed.role || role.title || '';
  const roleVariants = scanRoleVariantKeys(roleName);
  return {
    titleKey: normalizeRoleKey(role.title || ''),
    companyKey: normalizeRoleKey(company),
    roleKey: normalizeRoleKey(roleName),
    roleVariants,
    roleCompanyKey: normalizeRoleKey([roleName, company].filter(Boolean).join(' ')),
    companyRoleKey: normalizeRoleKey([company, roleName].filter(Boolean).join(' ')),
    roleCompanyVariants: roleVariants.map(key => normalizeRoleKey([key, company].filter(Boolean).join(' '))).filter(Boolean),
    companyRoleVariants: roleVariants.map(key => normalizeRoleKey([company, key].filter(Boolean).join(' '))).filter(Boolean),
    urlKey: normalizeUrlKey(role.link || ''),
    sourcePlaceholder: scanSourcePlaceholderCompany(company),
  };
}

function scanIdentityForDecision(item = {}) {
  const parsed = scanCompanyRole(item.title || '');
  const company = item.company || parsed.company || '';
  const roleName = item.role || parsed.role || item.title || '';
  const aliases = Array.isArray(item.aliases) ? item.aliases.map(normalizeRoleKey).filter(Boolean) : [];
  const roleVariants = scanRoleVariantKeys(roleName);
  return {
    titleKey: normalizeRoleKey(item.title || ''),
    companyKey: normalizeRoleKey(company),
    roleKey: normalizeRoleKey(roleName),
    roleVariants,
    roleCompanyKey: normalizeRoleKey([roleName, company].filter(Boolean).join(' ')),
    companyRoleKey: normalizeRoleKey([company, roleName].filter(Boolean).join(' ')),
    roleCompanyVariants: roleVariants.map(key => normalizeRoleKey([key, company].filter(Boolean).join(' '))).filter(Boolean),
    companyRoleVariants: roleVariants.map(key => normalizeRoleKey([company, key].filter(Boolean).join(' '))).filter(Boolean),
    urlKey: normalizeUrlKey(item.url || ''),
    aliases,
    sourcePlaceholder: scanSourcePlaceholderCompany(company),
  };
}

function scanIdentityAliasMatch(roleIdentity, decisionIdentity) {
  if (!roleIdentity || !decisionIdentity || !decisionIdentity.aliases?.length) return false;
  const roleAliases = [
    roleIdentity.titleKey,
    roleIdentity.roleCompanyKey,
    roleIdentity.companyRoleKey,
    ...(roleIdentity.roleCompanyVariants || []),
    ...(roleIdentity.companyRoleVariants || []),
    roleIdentity.urlKey,
  ].filter(Boolean);
  return roleAliases.some(alias => decisionIdentity.aliases.includes(alias));
}

function scanVariantRoleMatch(roleIdentity, decisionIdentity) {
  const roleVariants = roleIdentity?.roleVariants || [];
  const decisionVariants = decisionIdentity?.roleVariants || [];
  return roleVariants.some(roleKey => decisionVariants.some(decisionKey =>
    roleKey === decisionKey
    || (roleKey.length > 12 && decisionKey.length > 12 && (roleKey.includes(decisionKey) || decisionKey.includes(roleKey)))
  ));
}

function scanDecisionMatchesRole(item, role, result) {
  const key = scanPersistentKey(role, result);
  const roleIdentity = scanIdentityForRole(role);
  const decisionIdentity = scanIdentityForDecision(item);
  const titleKey = roleIdentity.titleKey;
  const roleCompanyKey = roleIdentity.roleCompanyKey;
  const roleOnlyKey = roleIdentity.roleKey;
  const link = normalizeUrlKey(role.link || '');
  const itemUrl = decisionIdentity.urlKey;
  const itemTitleKey = decisionIdentity.titleKey;
  const itemRoleCompanyKey = decisionIdentity.roleCompanyKey;
  const itemCompanyRoleKey = decisionIdentity.companyRoleKey;
  const itemRoleOnlyKey = decisionIdentity.roleKey;
  const currentReport = String(result.reportFile || result.savedPath || '').trim();
  const itemReport = String(item.reportFile || '').trim();
  const sameReport = currentReport && itemReport && currentReport === itemReport;
  const sameReportDate = scanReportDateKey(currentReport) && scanReportDateKey(currentReport) === scanReportDateKey(itemReport);
  const hiddenDecision = scanDecisionIsHidden(item);
  const durableDecision = scanDecisionIsDurablePass(item);
  const exactUrlMatch = link && itemUrl && itemUrl === link;

  if (item.key === key || exactUrlMatch) return true;
  if (scanIdentityAliasMatch(roleIdentity, decisionIdentity)) return true;

  const sameTitle = titleKey && itemTitleKey === titleKey;
  const sameRoleCompany = roleCompanyKey && (itemRoleCompanyKey === roleCompanyKey || itemCompanyRoleKey === roleCompanyKey);
  const sameCompany = roleIdentity.companyKey && decisionIdentity.companyKey && roleIdentity.companyKey === decisionIdentity.companyKey;
  const sameRoleOnly = roleOnlyKey && itemRoleOnlyKey && roleOnlyKey === itemRoleOnlyKey;
  const sameRoleVariant = sameCompany && scanVariantRoleMatch(roleIdentity, decisionIdentity);
  const sourcePlaceholderRole = (roleIdentity.sourcePlaceholder || decisionIdentity.sourcePlaceholder)
    && scanNeedsDetails(role)
    && sameRoleOnly
    && hiddenDecision
    && (sameReport || sameReportDate || durableDecision);
  const sameIdentity = sameTitle || sameRoleCompany;

  if (sourcePlaceholderRole) return true;
  if (hiddenDecision && sameIdentity) return true;
  if (hiddenDecision && sameRoleOnly && sameCompany) return true;
  if (hiddenDecision && sameRoleVariant) return true;

  if (currentReport && itemReport && !sameReport && !durableDecision) {
    if (sameIdentity && scanDecisionIsDurablePass(item)) return true;
    // Repeat unresolved cards should stay cleared once scored/passed, even when
    // they return in a newer scan. Complete newly-scored cards still get a fresh
    // look so an old no-URL pass cannot hide a real shortlist candidate.
    return sameIdentity && scanNeedsDetails(role) && hiddenDecision;
  }

  return item.key === key || sameIdentity;
}

function scanDecisionForRole(role, result) {
  return state.scanDecisions
    .filter(item => scanDecisionMatchesRole(item, role, result))
    .sort((a, b) => String(b.decidedAt || '').localeCompare(String(a.decidedAt || '')))[0];
}

function scanDecisionIsHidden(decision) {
  return /\b(pass|passed|skip|dismiss|remove|removed|rejected|submitted|applied|screen[_ -]?scheduled|interview|interviewing|offer|accepted|withdrew|withdrawn)\b/i.test(decision?.decision || '');
}

function browserResultRole(result = {}) {
  return {
    title: [result.title, result.company].filter(Boolean).join(' - ') || result.title || 'LinkedIn result',
    link: result.url || '',
    score: null,
  };
}

function browserResultIsHidden(result = {}) {
  const role = browserResultRole(result);
  const pseudoResult = { reportFile: 'LinkedIn Browser Results', savedPath: 'LinkedIn Browser Results' };
  const directDecision = scanDecisionForRole(role, pseudoResult);
  if (scanDecisionIsHidden(directDecision)) return true;
  const resultTitle = normalizeRoleKey(result.title || '');
  const resultCompany = normalizeRoleKey(result.company || '');
  return state.scanDecisions.some(decision => {
    if (!scanDecisionIsHidden(decision)) return false;
    const decisionTitle = normalizeRoleKey(decision.role || decision.title || '');
    const decisionCompany = normalizeRoleKey(decision.company || '');
    const sameTitle = resultTitle && decisionTitle && (decisionTitle === resultTitle || decisionTitle.includes(resultTitle) || resultTitle.includes(decisionTitle));
    const sameCompany = resultCompany && decisionCompany && resultCompany === decisionCompany;
    return sameTitle && (!decisionCompany || sameCompany);
  });
}

function scanDecisionIsShortlisted(decision) {
  return /\b(shortlist|shortlisted|restore|restored|promote|promoted)\b/i.test(decision?.decision || '');
}

function scanDecisionIsDurablePass(decision) {
  if (!scanDecisionIsHidden(decision)) return false;
  const text = `${decision?.decision || ''} ${decision?.reason || ''}`.toLowerCase();
  return /\b(submitted|applied|rejected|withdrew)\b/.test(text)
    || /\b(user|manual|confirmed|no longer open|not open|closed|direct ties|Example|do not resurface|already applied|application submitted|removed from active shortlist|removed from scan card)\b/.test(text);
}

function scanDecisionIsUserPassed(decision) {
  if (!decision || !/\b(pass|passed|skip|dismiss|remove|removed|rejected)\b/i.test(decision.decision || '')) return false;
  return !/\b(submitted|applied)\b/i.test(decision.decision || '');
}

function applyShortlistDecision(role, decision) {
  if (!decision || !scanDecisionIsShortlisted(decision)) return role;
  const scored = hasUiScore(decision.score);
  const score = scored ? Number(decision.score) : NaN;
  return {
    ...role,
    company: decision.company || role.company || '',
    role: decision.role || role.role || '',
    title: decision.title || role.title || [decision.role, decision.company].filter(Boolean).join(' - '),
    link: decision.url || role.link || '',
    comp: decision.comp || decision.compensation || role.comp || '',
    location: decision.location || role.location || '',
    score: scored ? score : role.score,
    scoreText: scored ? `${score}/100 (restored from ${state.meta.assistantName})` : role.scoreText,
    action: decision.reason || role.action || `Restored to shortlist by ${state.meta.assistantName}.`,
    needsDetails: false,
    verification: role.verification || 'Restored from chat decision',
    restoredFromDecision: true,
  };
}

function roleFromShortlistDecision(decision) {
  const scored = hasUiScore(decision.score);
  const score = scored ? Number(decision.score) : NaN;
  return {
    company: decision.company || '',
    role: decision.role || '',
    title: decision.title || [decision.role, decision.company].filter(Boolean).join(' - '),
    verification: 'Restored from chat decision',
    location: decision.location || '',
    comp: decision.comp || decision.compensation || '',
    link: decision.url || '',
    score: scored ? score : null,
    scoreText: scored ? `${score}/100 (restored from ${state.meta.assistantName})` : 'Restored to shortlist',
    action: decision.reason || `Restored to shortlist by ${state.meta.assistantName}.`,
    needsDetails: false,
    restoredFromDecision: true,
  };
}

async function saveScanDecision(role, result, decision = 'passed', reason = '') {
  const parsed = scanCompanyRole(role.title);
  const response = await api('/api/scan-state/decision', {
    method: 'POST',
    body: JSON.stringify({
      decision,
      title: role.title || '',
      company: parsed.company,
      role: parsed.role,
      url: role.link || '',
      source: role.source || '',
      reportFile: result.reportFile || '',
      reason,
      score: role.score ?? null,
      comp: role.comp || '',
      location: role.location || '',
    }),
  });
  state.scanDecisions = response.scanState?.decisions || state.scanDecisions;
  if (scanDecisionIsHidden({ decision })) state.dismissedScanCards.add(scanDismissKey(role, result));
  if (scanDecisionIsShortlisted({ decision })) state.dismissedScanCards.delete(scanDismissKey(role, result));
  saveDismissedScanCards();
  renderScanResults(state.lastScanRaw);
  showToast(scanDecisionIsHidden({ decision }) ? 'Removed from shortlist' : 'Added to shortlist');
}

function scanNeedsDetails(role) {
  return role.needsDetails || role.score == null || /JS-RENDERED|REDIRECTED|static fetch|client-side|hydrat|redirected/i.test(role.verification);
}

function scanCompanyRole(title) {
  const parts = String(title || '').split(' - ').map(part => part.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return { company: parts[parts.length - 1], role: parts.slice(0, -1).join(' - ') };
  }
  return { company: '', role: title || '' };
}

function scanDisplayLooksLikeProse(value = '') {
  const text = String(value || '').trim();
  if (!text) return true;
  const words = text.split(/\s+/).filter(Boolean);
  return text.length > 90
    || words.length > 12
    || /[.!?;]$/.test(text)
    || /\b(requires|ability to|judgment|priorities|initiatives|accelerating|investment|with the goal|meaningfully|this role|the role|what you|you will|we are|company is)\b/i.test(text);
}

function scanDisplayGenericCompany(value = '') {
  return /^(company|role|the role|built?in|linkedin|wellfound|yc|waas|work at a startup|websearch)$/i.test(String(value || '').trim());
}

function scanDisplayParts(role = {}) {
  const parsed = scanCompanyRole(role.title || '');
  const company = String(role.company || parsed.company || '').trim();
  const roleName = String(role.role || parsed.role || role.title || '').trim();
  const validCompany = company && !scanDisplayGenericCompany(company) && !scanDisplayLooksLikeProse(company);
  const validRole = roleName && !scanDisplayGenericCompany(roleName) && !scanDisplayLooksLikeProse(roleName);
  return {
    company: validCompany ? company : '',
    role: validRole ? roleName : '',
  };
}

function scanHasDisplayIdentity(role = {}) {
  const parts = scanDisplayParts(role);
  return Boolean(parts.company && parts.role);
}

function scanDisplayTitle(role = {}) {
  const parts = scanDisplayParts(role);
  if (parts.company && parts.role) return `${parts.company} - ${parts.role}`;
  if (parts.role) return parts.role;
  return 'Needs clean company and title';
}

function normalizeRoleKey(value = '') {
  return String(value)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function scanEvaluationKey(item) {
  return normalizeRoleKey(`${item.role || ''} ${item.company || ''}`);
}

function roleEvaluationKey(role) {
  const parsed = scanCompanyRole(role.title);
  return normalizeRoleKey(`${parsed.role || role.title || ''} ${parsed.company || ''}`);
}

function chatEvaluationsForResult(result) {
  const sourceRoles = new Map(result.roles.map(role => [roleEvaluationKey(role), role]));
  return state.scanChatEvaluations
    .map(item => {
      const key = scanEvaluationKey(item);
      const source = sourceRoles.get(key);
      if (!source) return null;
      return {
        ...source,
        title: source.title || `${item.role} - ${item.company}`,
        score: item.score,
        scoreText: `${item.score}/100 (chat evaluation)`,
        needsDetails: false,
        verification: source.verification || 'JD provided in chat',
        comp: item.comp || source.comp,
        location: item.location || source.location,
        action: item.score >= state.meta.shortlistFloor
          ? `Promoted from ${state.meta.assistantName}'s chat evaluation. ${item.recommendation || 'Package or review this role next.'}`
          : item.recommendation || `Removed from needs-details queue because it scored below the ${state.meta.shortlistFloor} shortlist floor.`,
        chatPromoted: item.score >= state.meta.shortlistFloor,
      };
    })
    .filter(Boolean);
}

function extractChatEvaluations(text = '', sourceText = '') {
  const normalized = normalizeScanText(text)
    .replace(/[—–]/g, ' - ')
    .replace(/â€”|â€“/g, ' - ');
  const evaluations = [];
  const seen = new Set();
  const pattern = /(?:^|\n)\s*(?:#{1,4}\s*)?(?:\d+\.\s*)?([A-Z][^\n-]{1,90}?)\s+-\s+([^\n]+?)\s+-\s+\**\s*Score\s*~?\s*(\d{1,3})\s*\/\s*100([^\n]*)/gi;
  let match;
  while ((match = pattern.exec(normalized))) {
    const company = match[1].trim().replace(/\s+/g, ' ');
    const role = match[2].trim().replace(/\s+/g, ' ');
    const score = Number(match[3]);
    if (!company || !role || !Number.isFinite(score)) continue;
    const key = normalizeRoleKey(`${role} ${company}`);
    if (seen.has(key)) continue;
    seen.add(key);
    const after = normalized.slice(match.index, match.index + 1200);
    const metadataText = `${sourceText || ''}\n${after}`;
    const comp = extractCompFromTextV2(metadataText);
    const location = extractLocationFromText(metadataText);
    const recommendation = score >= state.meta.shortlistFloor
      ? `Recommended next step: package the role or ask ${state.meta.assistantName} to create tailored files from the pasted JD.`
      : `Removed from the unresolved scan queue because it scored below the ${state.meta.shortlistFloor} shortlist floor.`;
    evaluations.push({ company, role, score, comp, location, recommendation, evaluatedAt: new Date().toISOString() });
  }
  return evaluations;
}

function mergeScanEvaluationsFromText(text = '', sourceText = '') {
  const evaluations = extractChatEvaluations(text, sourceText);
  if (!evaluations.length) return [];
  mergeScanEvaluations(evaluations);
  return evaluations;
}

function mergeScanEvaluations(evaluations = []) {
  const byKey = new Map(state.scanChatEvaluations.map(item => [scanEvaluationKey(item), item]));
  const added = [];
  for (const item of evaluations) {
    const key = scanEvaluationKey(item);
    if (!byKey.has(key) || String(item.evaluatedAt || '').localeCompare(String(byKey.get(key).evaluatedAt || '')) >= 0) {
      byKey.set(key, item);
      added.push(item);
    }
  }
  if (added.length) {
    state.scanChatEvaluations = [...byKey.values()];
    saveScanChatEvaluations();
  }
  return added;
}

function applyChatEvaluations(text, target, sourceText = '') {
  const result = parseScanReport(state.lastScanRaw);
  let evaluations = mergeScanEvaluationsFromText(text, sourceText);
  if (!evaluations.length) {
    evaluations = inferScanEvaluationsFromChatScore(text, result, sourceText);
    if (evaluations.length) mergeScanEvaluations(evaluations);
  }
  if (!evaluations.length || !state.lastScanRaw) return;
  const unresolvedKeys = new Set(result.roles.filter(scanNeedsDetails).map(roleEvaluationKey));
  const applicable = evaluations.filter(item => unresolvedKeys.has(scanEvaluationKey(item)));
  if (!applicable.length) return;

  const promoted = applicable.filter(item => item.score >= state.meta.shortlistFloor).map(item => `${item.role} - ${item.company}`);
  const removed = applicable.filter(item => item.score < state.meta.shortlistFloor).map(item => `${item.role} - ${item.company}`);
  renderScanResults(state.lastScanRaw);

  const updateLines = [
    'Scan workflow updated:',
    promoted.length ? `Promoted to shortlist: ${promoted.join('; ')}.` : '',
    removed.length ? `Removed from needs-details queue: ${removed.join('; ')}.` : '',
    promoted.length ? `Recommended next step: package the promoted role or ask ${state.meta.assistantName} to tailor it from the pasted JD.` : 'Recommended next step: no package action needed for the removed roles.',
  ].filter(Boolean);
  target.innerHTML = renderMessage(`${text.trim()}\n\n${updateLines.join('\n')}`);
  els.chatLog.scrollTop = els.chatLog.scrollHeight;
}

function inferScanEvaluationsFromChatScore(text = '', result = { roles: [] }, sourceText = '') {
  const scoreMatch = normalizeScanText(text).match(/\bScore\s*:?\s*(\d{1,3})\s*\/\s*100\b/i);
  if (!scoreMatch) return [];
  const score = Number(scoreMatch[1]);
  if (!Number.isFinite(score)) return [];
  const messageKey = normalizeRoleKey(text);
  const unresolved = (result.roles || []).filter(scanNeedsDetails);
  const matches = unresolved.filter(role => {
    const parsed = scanCompanyRole(role.title);
    const companyKey = normalizeRoleKey(parsed.company);
    const roleKey = normalizeRoleKey(parsed.role || role.title);
    return (companyKey && messageKey.includes(companyKey))
      || (roleKey && roleKey.length > 12 && messageKey.includes(roleKey));
  });
  const selected = matches.length ? matches : (unresolved.length === 1 ? unresolved : []);
  const metadataText = `${sourceText || ''}\n${text || ''}`;
  return selected.map(role => {
    const parsed = scanCompanyRole(role.title);
    return {
      company: parsed.company,
      role: parsed.role || role.title,
      score,
      comp: role.comp || extractCompFromTextV2(metadataText),
      location: role.location || extractLocationFromText(metadataText),
      recommendation: score >= state.meta.shortlistFloor
        ? `Recommended next step: package the role or ask ${state.meta.assistantName} to create tailored files from the pasted JD.`
        : `Removed from the unresolved scan queue because it scored below the ${state.meta.shortlistFloor} shortlist floor.`,
      evaluatedAt: new Date().toISOString(),
    };
  });
}

function compactMetaText(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 140);
}

function cleanCompSnippet(value = '') {
  return compactMetaText(String(value || '')
    .replace(/["']?\s*,\s*"?(?:location|reason|source|score|role|company|decision|title|url)["']?\s*:.*$/i, '')
    .replace(/[}\]"']+$/g, '')
    .trim());
}

function extractCompFromText(text = '') {
  const raw = String(text || '');
  const labeled = raw.match(/\b(?:Compensation|Base Pay Range|Pay Range|Estimated Base Salary)\s*:?\s*\n?\s*(\$[^\n]+)/i)?.[1];
  if (labeled) return cleanCompSnippet(labeled);
  const range = raw.match(/\$\s?\d{2,3}(?:,\d{3})?\s*(?:K|k)?\s*(?:[-–—]\s*)\$?\s?\d{2,3}(?:,\d{3})?\s*(?:K|k)?(?:\s*(?:base|USD|plus equity|offers equity|offers bonus|bonus|OTE|total compensation)[^\n.]*)?/i)?.[0];
  return cleanCompSnippet(range || '');
}

function extractCompFromTextV2(text = '') {
  const raw = String(text || '')
    .replace(/^\s*(?:[-*]\s*)?\[app-action\]\s*\{.*$/gm, '')
    .replace(/[\u2013\u2014]/g, '-');
  const money = '(?:USD\\s*)?\\$\\s?\\d{2,3}(?:,\\d{3})?(?:\\.\\d+)?\\s*(?:K|k)?';
  const moneyNoSymbol = '(?:USD\\s*)?\\$?\\s?\\d{2,3}(?:,\\d{3})?(?:\\.\\d+)?\\s*(?:K|k)?';
  const moneyRange = `${money}\\s*(?:-|\\?|\\u2013|\\u2014|to|and|through)\\s*${moneyNoSymbol}`;
  const qualifier = '(?:\\s*(?:base|salary|OTE|on-target earnings|target earnings|bonus|equity|plus|USD|per year|annually|annual|/yr|total compensation)[^\\n.]*)?';
  const labelPattern = '\\b(?:Compensation|Base Pay Range|Pay Range|Estimated Base Salary|Salary Range|Base Salary Range|Annual Salary|On-target Earnings|On Target Earnings|OTE|Target Earnings|Compensation Range)\\b';
  const labeled = raw.match(new RegExp(`${labelPattern}[^\\n$]{0,80}(${moneyRange}${qualifier})`, 'i'))?.[1];
  if (labeled) return cleanCompSnippet(labeled);
  const sentenceLabeled = raw.match(new RegExp(`(?:salary range|compensation range|base salary|expected salary|pay range)[^\\n.]{0,120}(${moneyRange}${qualifier})`, 'i'))?.[1];
  if (sentenceLabeled) return cleanCompSnippet(sentenceLabeled);
  const between = raw.match(new RegExp(`\\bbetween\\s+(${money})\\s+and\\s+(${moneyNoSymbol}${qualifier})`, 'i'));
  if (between) return cleanCompSnippet(`${between[1]} - ${between[2]}`);
  const range = raw.match(new RegExp(`${moneyRange}${qualifier}`, 'i'))?.[0];
  return cleanCompSnippet(range || extractCompFromText(raw));
}

function extractLocationFromText(text = '') {
  const raw = String(text || '');
  const labeled = raw.match(/\bLocation\s*:?\s*\n\s*([^\n]+)/i)?.[1];
  const locationType = raw.match(/\bLocation Type\s*:?\s*\n\s*([^\n]+)/i)?.[1];
  const combined = [labeled, locationType].filter(Boolean).join(' / ');
  if (combined) return compactMetaText(combined);
  const explicit = raw.match(/\b(US - San Francisco|San Francisco|Redwood City|Santa Monica|Los Angeles|Palo Alto|San Diego|Atlanta|Alpharetta|Remote(?:\s*-\s*US)?|United States)(?:,\s*(?:CA|California|GA|Georgia|USA|United States))?(?:[^\n.]{0,50}\b(?:Hybrid|On-site|Onsite|Remote)\b)?/i)?.[0];
  return compactMetaText(explicit || '');
}

function renderScanResults(raw) {
  if (!els.scanResults) return;
  const result = parseScanReport(raw);
  if (!result.roles.length) {
    els.scanResults.innerHTML = '';
    return;
  }
  state.lastScanRaw = raw;
  localStorage.setItem('lastScanRaw', raw.slice(-120000));
  const chatEvaluations = chatEvaluationsForResult(result);
  const evaluatedKeys = new Set(chatEvaluations.map(roleEvaluationKey));
  const baseRoles = dedupeScanRoles([
    ...result.roles.filter(role => !evaluatedKeys.has(roleEvaluationKey(role))),
    ...chatEvaluations,
  ]);
  const hiddenDecisionEntries = baseRoles
    .map(role => ({ role, decision: scanDecisionForRole(role, result) }))
    .filter(entry => scanDecisionIsUserPassed(entry.decision));
  const rolesWithOverrides = baseRoles
    .filter(role => !scanDecisionIsHidden(scanDecisionForRole(role, result)))
    .map(role => applyShortlistDecision(role, scanDecisionForRole(role, result)));
  const visibleKeys = new Set(rolesWithOverrides.map(roleEvaluationKey));
  const restoredRoles = dedupeScanRoles(state.scanDecisions
    .filter(scanDecisionIsShortlisted)
    .filter(decision => {
      const role = roleFromShortlistDecision(decision);
      const effectiveDecision = scanDecisionForRole(role, result);
      return effectiveDecision && effectiveDecision.key === decision.key && !scanDecisionIsHidden(effectiveDecision);
    })
    .map(roleFromShortlistDecision)
    .filter(role => {
      const key = roleEvaluationKey(role);
      if (!key || visibleKeys.has(key)) return false;
      visibleKeys.add(key);
      return true;
    }));
  const roles = dedupeScanRoles([...rolesWithOverrides, ...restoredRoles]);
  const allScored = roles.filter(role => Number.isFinite(role.score));
  const floor = state.meta.shortlistFloor || 75;
  const needsDetails = roles.filter(role =>
    scanNeedsDetails(role)
    && !evaluatedKeys.has(roleEvaluationKey(role))
    && !scanDecisionForRole(role, result)
  );
  const passedByRecommendation = allScored.filter(scanIsPassRecommendation);
  const belowThreshold = allScored.filter(role => role.score < floor || scanIsPassRecommendation(role));
  const userPassedRoles = dedupeScanRoles(hiddenDecisionEntries.map(({ role, decision }) => ({
    ...role,
    title: decision.title || role.title,
    link: decision.url || role.link || '',
    score: hasUiScore(decision.score) ? Number(decision.score) : role.score,
    scoreText: hasUiScore(decision.score) ? `${Number(decision.score)}/100` : role.scoreText,
    action: decision.reason || 'User marked this role as passed.',
    decision,
  })));
  const visibleRoles = roles.filter(role =>
    Number.isFinite(role.score)
    && role.score >= floor
    && !scanIsPassRecommendation(role)
    && scanHasDisplayIdentity(role)
    && !state.dismissedScanCards.has(scanDismissKey(role, result))
  );
  const hiddenSections = [
    {
      title: 'Needs Verification',
      note: `These need a full JD body, browser verification, or pasted details before ${state.meta.candidateFirst} decides.`,
      roles: needsDetails,
    },
    {
      title: 'User Passed',
      note: 'These were explicitly passed, removed, or rejected and will stay out of active scan flow.',
      roles: userPassedRoles,
    },
    {
      title: 'Rubric Recommended Pass',
      note: `These may have scored ${floor}+, but the recommendation says to pass or not package.`,
      roles: passedByRecommendation,
    },
  ].filter(section => section.roles.length);
  const best = visibleRoles.find(role => role.score >= 80) || visibleRoles[0];
  els.scanResults.innerHTML = `
    <section class="scan-summary">
      <div>
        <p class="eyebrow">Verified Scan Complete</p>
        <h3>${escapeHtml(result.rolesReviewed || result.roles.length)} roles reviewed</h3>
        <p>${escapeHtml(visibleRoles.length)} shortlist ${visibleRoles.length === 1 ? 'card is' : 'cards are'} available at ${floor}+ only. ${userPassedRoles.length ? `${userPassedRoles.length} user-passed ${userPassedRoles.length === 1 ? 'role is' : 'roles are'} kept out of active scan flow.` : ''} ${passedByRecommendation.length ? `${passedByRecommendation.length} ${passedByRecommendation.length === 1 ? 'role was' : 'roles were'} hidden because the rubric recommended passing or not packaging.` : ''} ${belowThreshold.length ? `${belowThreshold.length} below-threshold ${belowThreshold.length === 1 ? 'role is' : 'roles are'} omitted from the board.` : ''} ${needsDetails.length ? `${needsDetails.length} ${needsDetails.length === 1 ? 'role needs' : 'roles need'} a pasted JD before scoring.` : ''}</p>
      </div>
      <div class="scan-summary-actions">
        ${result.reportFile ? `<a class="scan-report-link" href="/api/download-scan-report?file=${encodeURIComponent(result.reportFile)}" target="_blank" rel="noreferrer">View Report</a>` : ''}
        ${result.reportFile ? `<a class="scan-report-link secondary-link" href="/api/download-scan-report?file=${encodeURIComponent(result.reportFile)}" target="_blank" rel="noreferrer">Export Markdown</a>` : ''}
      </div>
    </section>
    <div class="scan-rail-label">
      <span>Shortlist</span>
      <strong>${escapeHtml(best ? `Top score: ${best.score}/100 - ${scanDisplayTitle(best)}` : `No ${floor}+ shortlist cards yet`)}</strong>
    </div>
    ${needsDetails.length ? `
      <section class="scan-review-note">
        <strong>Needs JD details before scoring</strong>
        <p>These were withheld from the scored shortlist because the fetched page did not expose enough JD detail. Open the role, then paste the JD link or full JD into ${escapeHtml(state.meta.assistantName)} to score it properly.</p>
        <div>${needsDetails.slice(0, 5).map(role => role.link ? `<a href="${escapeHtml(role.link)}" target="_blank" rel="noreferrer">${escapeHtml(scanDisplayTitle(role))}</a>` : `<span>${escapeHtml(scanDisplayTitle(role))}</span>`).join('')}</div>
      </section>
    ` : ''}
    <div class="scan-card-grid">
      ${visibleRoles.length ? visibleRoles.map(role => `
        <article class="scan-card scan-${scanTone(role)}">
          <header>
            <div>
              <p class="scan-verification">${escapeHtml(role.verification || 'Verification pending')}</p>
              <h3>${scanSourceBadge(role)}${escapeHtml(scanDisplayTitle(role))}</h3>
            </div>
            <span class="score-badge">${role.score == null ? 'Review' : `${role.score}/100`}</span>
          </header>
          <div class="chip-row">
            <span>${escapeHtml(role.comp || 'Comp not stated')}</span>
            <span>${escapeHtml(role.location || 'Location not stated')}</span>
          </div>
          <p>${escapeHtml(role.action || `Review against ${state.meta.candidateFirst}'s profile before taking action.`)}</p>
          <div class="scan-actions">
            ${role.link ? `<a href="${escapeHtml(role.link)}" target="_blank" rel="noreferrer">Open role</a>` : ''}
            <button type="button" data-key="${escapeHtml(scanDismissKey(role, result))}" data-title="${escapeHtml(scanDisplayTitle(role))}" data-action="${escapeHtml(scanPrimaryAction(role))}">${escapeHtml(scanPrimaryAction(role))}</button>
            <button class="scan-dismiss" type="button" data-key="${escapeHtml(scanDismissKey(role, result))}" data-title="${escapeHtml(scanDisplayTitle(role))}" data-action="Dismiss">Dismiss</button>
          </div>
        </article>
      `).join('') : `<div class="empty-mini">No verified roles cleared the ${floor}+ shortlist threshold. Ask ${escapeHtml(state.meta.assistantName)} to score a pasted JD, or run another scan later.</div>`}
    </div>
    ${hiddenSections.length ? `
      <div class="scan-hidden-groups">
        ${hiddenSections.map(section => `
          <details class="scan-hidden-group">
            <summary>${escapeHtml(section.title)} <span>${section.roles.length}</span></summary>
            <p>${escapeHtml(section.note)}</p>
            <div class="scan-hidden-list">
              ${section.roles.slice(0, 18).map(role => `
                <article>
                  <strong>${escapeHtml(scanDisplayTitle(role))}</strong>
                  <span>${escapeHtml(hasUiScore(role.score) ? `${role.score}/100` : 'Score withheld')}</span>
                  <p>${escapeHtml(role.action || role.verification || 'No recommendation captured.')}</p>
                </article>
              `).join('')}
            </div>
          </details>
        `).join('')}
      </div>
    ` : ''}
  `;
  $$('.scan-actions button').forEach(button => button.addEventListener('click', () => {
    if (button.dataset.action === 'Dismiss' || button.dataset.action === 'Skip' || button.dataset.action === 'Remove') {
      const result = parseScanReport(state.lastScanRaw);
      const role = result.roles.find(item => scanDismissKey(item, result) === button.dataset.key)
        || chatEvaluationsForResult(result).find(item => scanDismissKey(item, result) === button.dataset.key);
      if (role) {
        saveScanDecision(role, result, 'passed', button.dataset.action === 'Skip' ? 'Skipped from scan card' : 'Removed from scan card');
      } else {
        saveScanDecision({ title: button.dataset.title || '', link: '' }, result, 'passed', button.dataset.action === 'Skip' ? 'Skipped from restored scan card' : 'Removed from restored scan card');
      }
      return;
    }
    if (button.dataset.action === 'Package Role') {
      const parsed = scanCompanyRole(button.dataset.title);
      activateView('resume');
      els.tailorCompany.value = parsed.company;
      els.tailorRole.value = parsed.role;
      els.tailorJd.focus();
      updateTailorState();
      showToast('Paste the JD, then tailor the package');
      return;
    }
    els.message.value = `${button.dataset.action} for ${button.dataset.title}.`;
    els.message.focus();
  }));
}

async function loadLastScan() {
  activateView('scans');
  els.scanOutput.textContent = '';
  try {
    const latest = await api('/api/latest-scan-report');
    const raw = latest.markdown ? `Saved ${latest.path}\nRoles reviewed: ${latest.rolesReviewed || ''}\n\n${latest.markdown}` : '';
    if (raw) {
      renderScanResults(raw);
      showToast('Latest scan loaded');
      return;
    }
  } catch (error) {
    console.warn('Could not load latest scan report', error);
  }
  if (state.lastScanRaw) {
    renderScanResults(state.lastScanRaw);
    showToast('Restored cached scan');
    return;
  }
  els.scanResults.innerHTML = `<div class="empty-mini">No scan report is saved yet. Run Verified Scan to create one.</div>`;
}

function applyMeta(data) {
  state.meta = {
    candidateFirst: data.candidateFirst || data.candidate?.split(/\s+/)[0] || 'Candidate',
    candidateName: data.candidate || 'Candidate',
    candidateInitials: data.candidateInitials || 'CO',
    assistantName: data.assistantName || 'Assistant',
    shortlistFloor: Number.isFinite(Number(data.shortlistFloor)) ? Number(data.shortlistFloor) : 75,
  };
  document.title = `Suitor - ${state.meta.candidateFirst}`;
  $('#candidateInitials').textContent = state.meta.candidateInitials;
  $('#candidateName').textContent = state.meta.candidateName;
  $('#lockedTarget').textContent = data.lockedTarget || 'Locked Target';
  $('#compSummary').textContent = data.compSummary || 'Comp floor';
  $('#compDetail').textContent = data.compDetail || '';
  $('#locationSummary').textContent = data.locationSummary || 'Location preferences not set';
  $('#heroSubcopy').textContent = `Track what is submitted, what is ready, and what needs ${state.meta.candidateFirst}'s next decision.`;
  $('#scanExplainer').textContent = `Quick Scan does the fast ATS pull and tracker dedupe. Run Verified Scan direct-fetches each shortlisted URL, scores it against ${state.meta.candidateFirst}'s locked profile, and saves the report.`;
  $('#assistantName').textContent = state.meta.assistantName;
  $('#message').placeholder = `Ask ${state.meta.assistantName} to compare roles, draft a follow-up, tailor a bullet, or review a JD.`;
  $('#loginTitle').textContent = `Unlock Suitor - ${state.meta.candidateFirst}`;
}

function renderOnboardingNudges(onboarding = state.onboarding) {
  const host = $('#statusSummary');
  if (!host || !onboarding) return;
  const notes = [];
  if (!onboarding.tier1Complete) notes.push('Complete Tier 1 intake to unlock scanning.');
  if (onboarding.tier1Complete && !onboarding.tier2Complete) notes.push('Complete Tier 2 and upload a resume before generating tailored materials.');
  if (!onboarding.tier3Complete) notes.push('Optional: add dream companies, exclusions, and weekly targets to improve matches.');
  host.querySelector('.onboarding-nudge')?.remove();
  const existing = host.innerHTML;
  const panel = notes.length ? `
    <div class="onboarding-nudge">
      <strong>Persona progress</strong>
      <span>${notes.map(escapeHtml).join(' ')}</span>
      <button id="resumeOnboardingBtn" class="button-secondary compact" type="button">Edit Profile</button>
    </div>
  ` : '';
  host.innerHTML = panel + existing;
  $('#resumeOnboardingBtn')?.addEventListener('click', () => showOnboardingWizard(true));
}

function applyOnboardingGates(onboarding = state.onboarding) {
  if (!onboarding) return;
  const scanLocked = !onboarding.scanningUnlocked;
  [els.scanBtn, els.agentScanBtn].forEach(button => {
    if (!button) return;
    button.disabled = scanLocked;
    button.title = scanLocked ? 'Complete Tier 1 intake before scanning.' : '';
  });
  if (els.tailorBtn) {
    els.tailorBtn.dataset.profileLocked = onboarding.tailoringUnlocked ? '' : '1';
    els.tailorBtn.title = onboarding.tailoringUnlocked ? '' : 'Complete Tier 2 intake before tailoring.';
  }
}

function intakeText(value) {
  return escapeHtml(String(value || ''));
}

function intakeQuestions(stage) {
  return (stage?.questions || []).map(item => `<li>${escapeHtml(item)}</li>`).join('');
}

function intakeFallbackSections(tier1 = {}, tier2 = {}, tier3 = {}) {
  return `
    <details class="wizard-section" open>
      <summary><h3>Tier 1: unlock scanning</h3></summary>
      <textarea name="basics" required placeholder="Baseline facts: name, location, authorization, links, current search state">${intakeText(tier1.basics)}</textarea>
      <textarea name="targetRole" required placeholder="Role direction: problems to own, title families, altitude, evidence">${intakeText(tier1.targetRole)}</textarea>
      <textarea name="logistics" required placeholder="Location, remote/hybrid/onsite, travel, time zones, availability">${intakeText(tier1.logistics)}</textarea>
      <textarea name="compensation" required placeholder="Compensation floor, target, flexibility, benefits constraints">${intakeText(tier1.compensation)}</textarea>
    </details>
    <details class="wizard-section" open>
      <summary><h3>Tier 2: unlock tailored materials</h3></summary>
      <p class="helper-text">Upload resume last. It backfills proof, but the interview should still capture your own evidence and voice.</p>
      <textarea name="experience" placeholder="Evidence inventory: roles, projects, outcomes, scope, metrics, tools">${intakeText(tier2.experience)}</textarea>
      <textarea name="strengths" placeholder="Strengths, energizers, drainers, repeated wins, proof quality">${intakeText(tier2.strengths)}</textarea>
      <textarea name="voice" placeholder="Voice, words to avoid, claims to avoid, standard answers, writing guardrails">${intakeText(tier2.voice)}</textarea>
      <label class="attach button-secondary compact">Upload resume last<input id="wizardResumeInput" type="file" accept=".pdf,.doc,.docx,.md,.txt"></label>
    </details>
    <details class="wizard-section">
      <summary><h3>Tier 3: enrich matching</h3></summary>
      <textarea name="personalityWorkflow" placeholder="Personality and workflow: ambiguity, structure, pace, collaboration, operating rhythm">${intakeText(tier3.personalityWorkflow)}</textarea>
      <textarea name="managerCulture" placeholder="Manager, team, and culture fit">${intakeText(tier3.managerCulture)}</textarea>
      <textarea name="industryFit" placeholder="Industry, company, customer, and business-model fit">${intakeText(tier3.industryFit)}</textarea>
      <textarea name="careerDirection" placeholder="Career direction, growth appetite, narrative, next-role purpose">${intakeText(tier3.careerDirection)}</textarea>
      <textarea name="tradeoffs" placeholder="Tradeoffs, contradictions, priority tests">${intakeText(tier3.tradeoffs)}</textarea>
      <textarea name="dealbreakers" placeholder="Dealbreakers and hard pass criteria">${intakeText(tier3.dealbreakers || tier3.targeting)}</textarea>
      <textarea name="excludeKeywords" placeholder="Exclude keywords or title/company patterns, one per line">${intakeText(tier3.excludeKeywords)}</textarea>
      <textarea name="automaticRejections" placeholder="Automatic rejection criteria, one per line">${intakeText(tier3.automaticRejections)}</textarea>
      <textarea name="manualReview" placeholder="Manual review criteria, one per line">${intakeText(tier3.manualReview)}</textarea>
      <textarea name="searchStatus" placeholder="Active/passive, weekly target, roles already in flight">${intakeText(tier3.searchStatus)}</textarea>
    </details>
  `;
}

function setIntakeStageQuestions(stages) {
  const select = $('#intakeStageSelect');
  const list = $('#intakeQuestionList');
  const stage = (stages || []).find(item => item.key === select?.value) || stages?.[0];
  if (list && stage) list.innerHTML = intakeQuestions(stage);
}

function wireIntakeChat(stages = []) {
  const select = $('#intakeStageSelect');
  const send = $('#intakeSendBtn');
  const answer = $('#intakeAnswer');
  const reply = $('#intakeReply');
  if (!select || !send || !answer || !reply) return;
  select.addEventListener('change', () => setIntakeStageQuestions(stages));
  setIntakeStageQuestions(stages);
  send.addEventListener('click', async () => {
    const text = answer.value.trim();
    if (!text) {
      reply.textContent = 'Answer the current stage with facts, evidence, constraints, and tradeoffs.';
      return;
    }
    send.disabled = true;
    reply.textContent = 'Saving intake answer...';
    try {
      const result = await api('/api/intake/chat', {
        method: 'POST',
        body: JSON.stringify({ stage: select.value, answer: text }),
      });
      const stage = result.stage || stages.find(item => item.key === select.value);
      if (stage?.field) {
        const target = document.querySelector(`[name="${stage.field}"]`);
        if (target && !target.value.trim()) target.value = text;
      }
      state.onboarding = result.status || state.onboarding;
      applyOnboardingGates(state.onboarding);
      renderOnboardingNudges(state.onboarding);
      reply.innerHTML = [
        `<strong>${escapeHtml(result.classification || 'likely')}</strong>`,
        escapeHtml(result.probe || ''),
        result.nextStage ? `Next: ${escapeHtml(result.nextStage.title)}` : '',
      ].filter(Boolean).join('<br>');
      if (result.nextStage?.key) {
        select.value = result.nextStage.key;
        setIntakeStageQuestions(stages);
      }
      answer.value = '';
    } catch (err) {
      reply.textContent = err.message || 'Could not save intake answer.';
    } finally {
      send.disabled = false;
    }
  });
}

async function showOnboardingWizard(force = false) {
  const payload = await api('/api/onboarding');
  state.onboarding = payload.status;
  if (state.onboarding?.onboarded && !force) return;
  const cfg = payload.config || {};
  const tier1 = cfg.intake?.tier1 || {};
  const tier2 = cfg.intake?.tier2 || {};
  const tier3 = cfg.intake?.tier3 || {};
  const stages = payload.stages || [];
  const activeStage = cfg.intake?.interview?.currentStage || stages[0]?.key || 'baseline';
  const env = await api('/api/env-check');
  let overlay = $('#onboardingOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'onboardingOverlay';
    overlay.className = 'onboarding-overlay';
    document.body.append(overlay);
  }
  const provider = cfg.llm?.provider || 'openai';
  overlay.innerHTML = `
    <form id="onboardingForm" class="onboarding-panel">
      <header>
        <div>
          <p class="eyebrow">Suitor setup</p>
          <h2>${force ? 'Edit profile and connections' : 'Welcome to Suitor'}</h2>
        </div>
        ${force ? '<button class="mini-action" type="button" id="closeOnboardingBtn">Close</button>' : ''}
      </header>
      <section class="wizard-section">
        <h3>Environment</h3>
        <div class="wizard-checks">
          <span class="${env.node.ok ? 'ok' : 'bad'}">Node ${escapeHtml(env.node.version)} ${env.node.ok ? 'ready' : 'needs 22+'}</span>
          <span class="${env.codex.installed ? 'ok' : 'warn'}">Codex CLI ${env.codex.installed ? 'found' : 'not found'}</span>
          <span class="${env.claude.installed ? 'ok' : 'warn'}">Claude CLI ${env.claude.installed ? 'found' : 'not found'}</span>
        </div>
      </section>
      <section class="wizard-section">
        <h3>Assistant</h3>
        <div class="segmented">
          <label><input type="radio" name="provider" value="openai" ${provider === 'openai' ? 'checked' : ''}> ChatGPT via Codex</label>
          <label><input type="radio" name="provider" value="anthropic" ${provider === 'anthropic' ? 'checked' : ''}> Claude via Claude Code</label>
        </div>
        <input name="assistantName" maxlength="40" required placeholder="Assistant name" value="${escapeHtml(cfg.assistantName || state.meta.assistantName)}">
      </section>
      <section class="wizard-section intake-chat">
        <h3>Recruiter interview</h3>
        <div class="intake-expectation">This is thorough by design. Answer the essentials in a few minutes to start scanning, then deepen the profile anytime. The fuller picture usually takes 15-20 minutes total, auto-saves as you go, and makes matches sharper.</div>
        <p class="helper-text">${escapeHtml(cfg.assistantName || state.meta.assistantName)} asks direct, evidence-based questions. You can pause and resume; honest detail improves the results.</p>
        <select id="intakeStageSelect">
          ${stages.map(stage => `<option value="${escapeHtml(stage.key)}" ${stage.key === activeStage ? 'selected' : ''}>${escapeHtml(stage.title)}</option>`).join('')}
        </select>
        <ul id="intakeQuestionList" class="intake-questions"></ul>
        <textarea id="intakeAnswer" placeholder="Answer this stage with concrete examples, constraints, tradeoffs, and evidence."></textarea>
        <div class="inline-actions">
          <button class="button-secondary compact" id="intakeSendBtn" type="button">Save Stage</button>
          <span id="intakeReply" class="helper-text">Classifications: proven, likely, aspirational, risky, or misfit.</span>
        </div>
      </section>
      ${intakeFallbackSections(tier1, tier2, tier3)}
      <section class="wizard-section">
        <h3>Connections</h3>
        <label><input type="checkbox" name="linkedin" ${cfg.connections?.linkedin?.enabled ? 'checked' : ''}> LinkedIn manual browser session</label>
        <label><input type="checkbox" name="websearch" ${cfg.connections?.providers?.websearch ? 'checked' : ''}> Web search fallback</label>
        <textarea name="rssFeeds" placeholder="Custom RSS/feed URLs, one per line">${escapeHtml((cfg.connections?.rssFeeds || []).join('\n'))}</textarea>
        <textarea name="targetCompanies" placeholder="Target companies, one per line">${escapeHtml((cfg.connections?.targetCompanies || []).join('\n'))}</textarea>
      </section>
      <footer>
        <button class="button-primary" type="submit">Save and Continue</button>
      </footer>
    </form>
  `;
  overlay.hidden = false;
  wireIntakeChat(stages);
  $('#closeOnboardingBtn')?.addEventListener('click', () => { overlay.hidden = true; });
  $('#wizardResumeInput')?.addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const dataUrl = await readFileDataUrl(file);
    await api('/api/master-resume/upload', {
      method: 'POST',
      body: JSON.stringify({ name: file.name, dataUrl, updateKind: 'onboarding' }),
    });
    showToast('Resume uploaded for Tier 2 review');
  });
  $('#onboardingForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const next = {
      assistantName: String(form.get('assistantName') || 'Assistant').trim().slice(0, 40),
      llm: { provider: String(form.get('provider') || 'openai') },
      lockedTarget: String(form.get('targetRole') || '').trim() || 'Target roles not set yet',
      locationSummary: String(form.get('logistics') || '').trim() || 'Locations not set yet',
      compSummary: String(form.get('compensation') || '').trim() || 'Compensation not set yet',
      intake: {
        tier1: {
          basics: String(form.get('basics') || '').trim(),
          targetRole: String(form.get('targetRole') || '').trim(),
          logistics: String(form.get('logistics') || '').trim(),
          compensation: String(form.get('compensation') || '').trim(),
        },
        tier2: {
          experience: String(form.get('experience') || '').trim(),
          strengths: String(form.get('strengths') || '').trim(),
          voice: String(form.get('voice') || '').trim(),
        },
        tier3: {
          personalityWorkflow: String(form.get('personalityWorkflow') || '').trim(),
          managerCulture: String(form.get('managerCulture') || '').trim(),
          industryFit: String(form.get('industryFit') || '').trim(),
          careerDirection: String(form.get('careerDirection') || '').trim(),
          tradeoffs: String(form.get('tradeoffs') || '').trim(),
          dealbreakers: String(form.get('dealbreakers') || '').trim(),
          excludeKeywords: String(form.get('excludeKeywords') || '').trim(),
          automaticRejections: String(form.get('automaticRejections') || '').trim(),
          manualReview: String(form.get('manualReview') || '').trim(),
          searchStatus: String(form.get('searchStatus') || '').trim(),
        },
      },
      connections: {
        ...(cfg.connections || {}),
        // Spread the existing block: a wholesale replace wipes extra keys
        // (searchQuery, status, dataStored) that settings must not drop.
        linkedin: { ...(cfg.connections?.linkedin || {}), enabled: form.get('linkedin') === 'on' },
        providers: { ...(cfg.connections?.providers || {}), websearch: form.get('websearch') === 'on' },
        rssFeeds: String(form.get('rssFeeds') || '').split(/\r?\n/).map(v => v.trim()).filter(Boolean),
        targetCompanies: String(form.get('targetCompanies') || '').split(/\r?\n/).map(v => v.trim()).filter(Boolean),
      },
      onboarded: true,
    };
    const saved = await api('/api/onboarding', { method: 'POST', body: JSON.stringify(next) });
    state.onboarding = saved.status;
    overlay.hidden = true;
    showToast('Profile saved');
    await bootstrap();
  });
}

async function bootstrap() {
  try {
    const data = await api('/api/bootstrap');
    state.authenticated = true;
    applyMeta(data);
    state.onboarding = data.onboarding || null;
    els.authStatus.textContent = 'Unlocked';
    state.scanDecisions = data.scanState?.decisions || [];
    renderHistory(data.chatHistory || []);
    renderApplications(data.trackerCards || []);
    renderFiles(data.files || []);
    renderAssessments(data.assessments || []);
    renderCaptures(data.captures || []);
    renderLearningInsights(data.learningSummary || null);
    renderMasterResume(data.masterResume || null);
    renderBrowserStatus(data.browser || {});
    renderConnections(data.connections || {});
    if (els.assessmentRoot) els.assessmentRoot.textContent = 'PDF and Word assessments stay inside this profile and are used only as soft job-fit context.';
    els.resumePreview.value = data.resumePreview || '';
    updateTailorState();
    applyOnboardingGates(state.onboarding);
    const tracker = await api('/api/tracker');
    els.trackerEditor.value = tracker.markdown;
    activateView(state.activeView);
    if (state.activeView === 'scans' && state.lastScanRaw) renderScanResults(state.lastScanRaw);
    renderOnboardingNudges(state.onboarding);
    await showOnboardingWizard(false);
    await refreshBrowserStatus();
  } catch {
    if (!state.authenticated) showLogin();
  }
}

async function streamPost(path, body, target) {
  setBusy(true, 'Agent running');
  let raw = '';
  try {
    const res = await fetch(path, {
      method: 'POST',
      credentials: 'same-origin',
      headers: headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
    });
    if (res.status === 401) {
      state.authenticated = false;
      showLogin();
      return;
    }
    const reader = res.body?.getReader();
    const decoder = new TextDecoder();
    if (!reader) {
      raw = await res.text();
      target.classList?.remove('thinking');
      target.innerHTML = renderMessage(raw);
      return raw;
    }
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      raw += decoder.decode(value, { stream: true });
      target.classList?.remove('thinking');
      target.innerHTML = renderMessage(raw);
      els.chatLog.scrollTop = els.chatLog.scrollHeight;
    }
    target.classList?.remove('thinking');
    if (!raw.trim()) raw = 'The assistant stream ended without returning a response. Please try again.';
    target.innerHTML = renderMessage(raw);
    if (raw.includes('resume-preview-updated')) {
      const resume = await api('/api/resume-preview');
      els.resumePreview.value = resume.markdown;
    }
    applyChatEvaluations(raw, target, body.message || '');
    await applyAppActions(raw, target, body.message || '');
    await refreshFilesOnly();
    return raw;
  } catch (err) {
    raw = `The assistant stream stopped before finishing: ${err.message || err}. Please try again.`;
    target.classList?.remove('thinking');
    target.innerHTML = renderMessage(raw);
    return raw;
  } finally {
    setBusy(false);
  }
}

async function applyAppActions(raw, target, sourceText = '') {
  const actions = extractAppActions(raw).filter(action => ['scan-decision', 'application-submitted', 'application-rejected', 'application-stage-update', 'browser-results-clear'].includes(action.type));
  if (!actions.length) return;
  const metadataText = `${sourceText || ''}\n${raw || ''}`;
  let submittedCount = 0;
  let rejectedCount = 0;
  let stageUpdatedCount = 0;
  let browserClearedCount = 0;
  let trackerSuppressedCount = 0;
  for (const action of actions) {
    if (action.type === 'browser-results-clear') {
      const response = await api('/api/browser/results/clear', {
        method: 'POST',
        body: JSON.stringify({ reason: action.reason || 'Cleared from chat confirmation.' }),
      });
      browserClearedCount += Number(response.clearedCount || 0);
      renderBrowserResults({ results: [] });
      renderBrowserStatus(response.browser || {});
      continue;
    }
    if (action.type === 'application-submitted') {
      const response = await api('/api/application-submitted', {
        method: 'POST',
        body: JSON.stringify({
          company: action.company || '',
          role: action.role || '',
          title: action.title || [action.company, action.role].filter(Boolean).join(' - '),
          url: action.url || '',
          source: action.source || '',
          score: action.score ?? null,
          comp: action.comp || action.compensation || extractCompFromTextV2(metadataText),
          location: action.location || extractLocationFromText(metadataText),
          materialsPath: action.materialsPath || action.materials_path || '',
          notes: action.notes || action.reason || 'Submitted from Suitor chat confirmation.',
          reportFile: parseScanReport(state.lastScanRaw || '').reportFile || '',
        }),
      });
      state.scanDecisions = response.scanState?.decisions || state.scanDecisions;
      if (response.trackerCards) renderApplications(response.trackerCards);
      if (response.trackerMarkdown && els.trackerEditor) els.trackerEditor.value = response.trackerMarkdown;
      submittedCount += 1;
      continue;
    }
    if (action.type === 'application-rejected') {
      const response = await api('/api/application-rejected', {
        method: 'POST',
        body: JSON.stringify({
          company: action.company || '',
          role: action.role || '',
          title: action.title || [action.company, action.role].filter(Boolean).join(' - '),
          url: action.url || '',
          source: action.source || '',
          score: action.score ?? null,
          comp: action.comp || action.compensation || extractCompFromTextV2(metadataText),
          location: action.location || extractLocationFromText(metadataText),
          dateRejected: action.dateRejected || action.date_rejected || action.date || '',
          notes: action.notes || action.reason || 'Rejected from Suitor chat confirmation.',
          reportFile: parseScanReport(state.lastScanRaw || '').reportFile || '',
        }),
      });
      state.scanDecisions = response.scanState?.decisions || state.scanDecisions;
      if (response.trackerCards) renderApplications(response.trackerCards);
      if (response.trackerMarkdown && els.trackerEditor) els.trackerEditor.value = response.trackerMarkdown;
      rejectedCount += 1;
      continue;
    }
    if (action.type === 'application-stage-update') {
      const response = await api('/api/application-stage-update', {
        method: 'POST',
        body: JSON.stringify({
          company: action.company || '',
          role: action.role || '',
          title: action.title || [action.company, action.role].filter(Boolean).join(' - '),
          status: action.status || 'screen_scheduled',
          source: action.source || '',
          interviewAt: action.interviewAt || action.interview_at || action.date || '',
          score: action.score ?? null,
          comp: action.comp || action.compensation || extractCompFromTextV2(metadataText),
          location: action.location || extractLocationFromText(metadataText),
          materialsPath: action.materialsPath || action.materials_path || '',
          notes: action.notes || action.reason || 'Stage updated from Suitor chat confirmation.',
        }),
      });
      if (response.trackerCards) renderApplications(response.trackerCards);
      if (response.trackerMarkdown && els.trackerEditor) els.trackerEditor.value = response.trackerMarkdown;
      state.scanDecisions = response.scanState?.decisions || state.scanDecisions;
      stageUpdatedCount += 1;
      continue;
    }
    const response = await api('/api/scan-state/decision', {
      method: 'POST',
      body: JSON.stringify({
        decision: action.decision || 'passed',
        title: action.title || [action.role, action.company].filter(Boolean).join(' - '),
        company: action.company || '',
        role: action.role || '',
        url: action.url || '',
        source: action.source || '',
        reportFile: parseScanReport(state.lastScanRaw || '').reportFile || '',
        reason: action.reason || '',
        score: action.score ?? null,
        comp: action.comp || action.compensation || extractCompFromTextV2(metadataText),
        location: action.location || extractLocationFromText(metadataText),
      }),
    });
    state.scanDecisions = response.scanState?.decisions || state.scanDecisions;
    if (response.suppressedByTracker) trackerSuppressedCount += 1;
  }
  if (state.lastScanRaw) renderScanResults(state.lastScanRaw);
  await refreshBrowserStatus();
  const restored = actions.some(action => action.type === 'scan-decision' && scanDecisionIsShortlisted({ decision: action.decision || '' }));
  const submitted = submittedCount > 0;
  const rejected = rejectedCount > 0;
  const actionSummary = submitted
    ? `Application submitted state saved to ${state.meta.candidateFirst}'s tracker and cleared from Scans.`
    : rejected
      ? `Application rejection saved to ${state.meta.candidateFirst}'s tracker and moved to Rejected.`
      : stageUpdatedCount
        ? `Application stage updated in ${state.meta.candidateFirst}'s tracker.`
        : browserClearedCount
          ? `Cleared ${browserClearedCount} LinkedIn browser result${browserClearedCount === 1 ? '' : 's'} from Browser Activity.`
          : trackerSuppressedCount
            ? `Existing tracker state suppressed ${trackerSuppressedCount} stale scan card${trackerSuppressedCount === 1 ? '' : 's'}; no shortlist card was added.`
          : `Saved scan decision to ${state.meta.candidateFirst}'s shortlist state.${restored ? ' The role should now be visible in Scans as a shortlist card.' : ''}`;
  target.innerHTML = renderMessage(`${raw.trim()}\n\n${actionSummary}`);
}

function currentViewContext() {
  return {
    activeView: state.activeView,
    selectedRole: state.selectedRole || null,
    resumePreviewExcerpt: state.activeView === 'resume' ? els.resumePreview.value.slice(0, 4000) : '',
    scanOutputExcerpt: state.activeView === 'scans' ? els.scanOutput.textContent.slice(-4000) : '',
    tailorDraft: state.activeView === 'resume' ? {
      company: els.tailorCompany.value,
      role: els.tailorRole.value,
      jdTextExcerpt: els.tailorJd.value.slice(0, 4000),
    } : null,
  };
}

function activateView(view) {
  const titles = {
    applications: ['Applications', 'Career Command Center'],
    scans: ['Scans', 'Opportunity Scanner'],
    capture: ['Capture', 'Outside Activity'],
    resume: ['Resume Studio', 'Resume Studio'],
    learning: ['Learning Insights', 'Search Learning'],
    assessments: ['Assessments', 'Workplace Context'],
    reference: ['Reference Library', 'Profile Rules'],
    settings: ['Settings', 'System Controls'],
  };
  const nextView = titles[view] ? view : 'applications';
  state.activeView = nextView;
  localStorage.setItem('activeView', nextView);
  $$('.nav-item').forEach(btn => btn.classList.toggle('active', btn.dataset.view === nextView));
  $$('.view').forEach(pane => pane.classList.remove('active'));
  $(`#${nextView}View`)?.classList.add('active');
  els.viewEyebrow.textContent = titles[nextView][0];
  els.viewTitle.textContent = titles[nextView][1];
  els.chatContext.textContent = `Context: ${titles[nextView][0]}`;
}

async function refreshFilesOnly() {
  const data = await api('/api/files');
  renderFiles(data.files || []);
}

function filenameFromDownloadResponse(res, url) {
  const disposition = res.headers.get('content-disposition') || '';
  const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (encoded) {
    try { return decodeURIComponent(encoded); } catch {}
  }
  const quoted = disposition.match(/filename="?([^";]+)"?/i)?.[1];
  if (quoted) return quoted;
  const parsed = new URL(url, window.location.href);
  const pathValue = parsed.searchParams.get('path') || parsed.searchParams.get('file') || parsed.pathname;
  try {
    return decodeURIComponent(pathValue).split(/[\\/]/).pop() || 'Suitor download';
  } catch {
    return String(pathValue).split(/[\\/]/).pop() || 'Suitor download';
  }
}

async function downloadWithAuth(url) {
  setBusy(true, 'Downloading');
  try {
    const res = await fetch(url, { credentials: 'same-origin', headers: headers() });
    if (res.status === 401) {
      state.authenticated = false;
      showLogin();
      throw new Error(`Enter the LAN password for ${state.meta.candidateFirst}'s Suitor, then try the download again.`);
    }
    if (!res.ok) {
      const detail = await res.text();
      throw new Error(detail || `Download failed with status ${res.status}`);
    }
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = filenameFromDownloadResponse(res, url);
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    showToast('Download started');
  } catch (err) {
    showToast(err.message || 'Download failed');
  } finally {
    setBusy(false);
  }
}

document.addEventListener('click', async (event) => {
  const link = event.target.closest?.('a[href^="/api/download"], a[href^="/api/download-by-path"], a[href^="/api/download-scan-report"]');
  if (!link) return;
  event.preventDefault();
  await downloadWithAuth(link.getAttribute('href'));
});

els.loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const token = els.tokenInput.value.trim();
  const res = await fetch('/api/login', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  if (!res.ok) {
    els.loginError.textContent = 'Token did not match.';
    return;
  }
  state.authenticated = true;
  els.loginDialog.close();
  await bootstrap();
});

els.chatForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const message = els.message.value.trim();
  if (!message && state.attachments.length === 0) return;
  els.message.value = '';
  addMessage('user', message || '[attached file]');
  const out = addMessage('assistant', '');
  await streamPost('/api/chat', { message, attachments: state.attachments, view: currentViewContext() }, out);
  state.attachments = [];
  els.attachments.innerHTML = '';
});

els.message.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    els.chatForm.requestSubmit();
  }
});

async function uploadAttachment(file) {
  const dataUrl = await readFileDataUrl(file);
  const uploaded = await api('/api/upload', {
    method: 'POST',
    body: JSON.stringify({ name: file.name, dataUrl }),
  });
  state.attachments.push(uploaded);
  const chip = document.createElement('span');
  chip.className = `attachment-chip${uploaded.kind === 'image' ? ' image-attachment' : ''}`;
  chip.textContent = uploaded.kind === 'image' ? `Screenshot: ${uploaded.name}` : uploaded.name;
  els.attachments.append(chip);
  return uploaded;
}

els.fileInput.addEventListener('change', async () => {
  const files = Array.from(els.fileInput.files || []);
  if (!files.length) return;
  for (const file of files) await uploadAttachment(file);
  els.fileInput.value = '';
});

els.assessmentInput?.addEventListener('change', async () => {
  const file = els.assessmentInput.files?.[0];
  if (!file) return;
  setBusy(true, 'Saving assessment');
  try {
    const dataUrl = await readFileDataUrl(file);
    const response = await api('/api/assessments/upload', {
      method: 'POST',
      body: JSON.stringify({ name: file.name, dataUrl }),
    });
    renderAssessments(response.files || []);
    showToast('Assessment saved');
  } finally {
    setBusy(false);
    els.assessmentInput.value = '';
  }
});

els.masterResumeInput?.addEventListener('change', async () => {
  const file = els.masterResumeInput.files?.[0];
  if (!file) return;
  setBusy(true, 'Saving master resume');
  try {
    const dataUrl = await readFileDataUrl(file);
    const response = await api('/api/master-resume/upload', {
      method: 'POST',
      body: JSON.stringify({
        name: file.name,
        dataUrl,
        updateKind: els.masterUpdateKind?.value || '',
      }),
    });
    renderMasterResume(response.masterResume || null);
    await refreshFilesOnly();
    showToast('New master resume staged for review');
  } catch (err) {
    showToast(err.message || 'Master resume upload failed');
  } finally {
    setBusy(false);
    els.masterResumeInput.value = '';
  }
});

els.reviewMasterResumeBtn?.addEventListener('click', () => {
  const pending = state.masterResume?.pending;
  const canonical = state.masterResume?.canonical;
  if (!pending) return;
  activateView('resume');
  els.message.value = [
    `Review the pending master resume update for ${state.meta.candidateFirst}.`,
    `Current master: ${canonical?.name || 'none detected'}.`,
    `Pending master: ${pending.name}.`,
    'Compare it against the current master and the locked search profile. Flag title/date/metric/scope changes, ATS keyword losses, banned language, and anything that should be confirmed before promotion. Then recommend whether to promote it as current.'
  ].join('\n');
  els.message.focus();
});

els.promoteMasterResumeBtn?.addEventListener('click', async () => {
  const pending = state.masterResume?.pending;
  if (!pending) return;
  const ok = confirm(`Set ${pending.name} as the current master resume? The previous master stays archived.`);
  if (!ok) return;
  setBusy(true, 'Promoting master resume');
  setButtonLoading(els.promoteMasterResumeBtn, true, 'Setting Current Master');
  try {
    const response = await api('/api/master-resume/promote', {
      method: 'POST',
      body: JSON.stringify({ path: pending.path }),
    });
    renderMasterResume(response.masterResume || null);
    const resume = await api('/api/resume-preview');
    els.resumePreview.value = resume.markdown || '';
    await refreshFilesOnly();
    showToast('Current master resume updated');
    addMessage('system', `${pending.name} is now the current master. The previous master was kept on disk for rollback.`);
  } catch (err) {
    showToast(err.message || 'Could not promote master resume');
  } finally {
    setButtonLoading(els.promoteMasterResumeBtn, false);
    setBusy(false);
  }
});

els.message.addEventListener('paste', async (event) => {
  const items = Array.from(event.clipboardData?.items || []);
  const imageItems = items.filter(item => item.kind === 'file' && String(item.type || '').startsWith('image/'));
  if (!imageItems.length) return;
  event.preventDefault();
  for (const item of imageItems) {
    const file = item.getAsFile();
    if (!file) continue;
    const ext = file.type === 'image/jpeg' ? 'jpg' : (file.type.split('/')[1] || 'png');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const namedFile = new File([file], `pasted-screenshot-${stamp}.${ext}`, { type: file.type });
    await uploadAttachment(namedFile);
  }
  showToast(`${imageItems.length} screenshot${imageItems.length === 1 ? '' : 's'} attached`);
});

els.scanBtn.addEventListener('click', async () => {
  activateView('scans');
  els.scanResults.innerHTML = '';
  els.scanOutput.textContent = '';
  setScanButtonsDisabled(true);
  setButtonLoading(els.scanBtn, true, 'Running Quick Scan');
  try {
    const raw = await streamPost('/api/scan', { dryRun: true }, { set innerHTML(v) { els.scanOutput.textContent = plainTextFromRendered(v); } });
    renderScanResults(raw);
    showToast('Quick scan complete');
  } finally {
    setButtonLoading(els.scanBtn, false);
    setScanButtonsDisabled(false);
  }
});

els.agentScanBtn.addEventListener('click', async () => {
  activateView('scans');
  els.scanResults.innerHTML = `<div class="scan-loading">${escapeHtml(state.meta.assistantName)} is direct-fetching and scoring roles<span class="pulse-dots"><i></i><i></i><i></i></span></div>`;
  els.scanOutput.textContent = '';
  setScanButtonsDisabled(true);
  setButtonLoading(els.agentScanBtn, true, 'Running Verified Scan');
  try {
    const raw = await streamPost('/api/scan', { agent: true }, { set innerHTML(v) {
      const clean = plainTextFromRendered(v);
      els.scanOutput.textContent = clean.split('[scan-report]')[0].replace(/\[process exited with code \d+\]/g, '').trim();
    } });
    renderScanResults(raw);
    showToast('Verified scan saved');
  } finally {
    setButtonLoading(els.agentScanBtn, false);
    setScanButtonsDisabled(false);
  }
});

els.lastScanBtn.addEventListener('click', async () => {
  setButtonLoading(els.lastScanBtn, true, 'Loading Last Scan');
  try {
    await loadLastScan();
  } finally {
    setButtonLoading(els.lastScanBtn, false);
  }
});

els.openLinkedInLocalBtn?.addEventListener('click', () => {
  activateView('scans');
  window.open(localLinkedInJobsUrl(), '_blank', 'noopener,noreferrer');
  showToast('Opened LinkedIn on this device');
  addMessage('system', `LinkedIn opened in this browser. Log in there, then paste promising job URLs or copied JD text into ${state.meta.assistantName} for scoring and routing.`);
});

els.openLinkedInBtn?.addEventListener('click', async () => {
  activateView('scans');
  els.scanLogWrap.open = true;
  setButtonLoading(els.openLinkedInBtn, true, 'Opening LinkedIn');
  try {
    const response = await api('/api/browser/open-linkedin', { method: 'POST', body: JSON.stringify({}) });
    renderBrowserStatus(response.browser || {});
    showToast('LinkedIn browser session opening');
    setTimeout(refreshBrowserStatus, 1600);
  } finally {
    setButtonLoading(els.openLinkedInBtn, false);
  }
});

els.linkedinSearchBtn?.addEventListener('click', async () => {
  activateView('scans');
  setButtonLoading(els.linkedinSearchBtn, true, 'Searching LinkedIn');
  const query = els.linkedinQuery.value.trim();
  const poller = setInterval(refreshBrowserStatus, 1800);
  try {
    await streamPost('/api/browser/linkedin-search', { query, limit: 10 }, {
      set innerHTML(v) {
        els.browserLog.textContent = plainTextFromRendered(v);
        refreshBrowserStatus();
      },
    });
    await refreshBrowserStatus();
    els.scanResults.innerHTML = `<div class="scan-loading">LinkedIn results captured. ${escapeHtml(state.meta.assistantName)} is scoring them through the normal verified scan<span class="pulse-dots"><i></i><i></i><i></i></span></div>`;
    els.scanOutput.textContent = '';
    setScanButtonsDisabled(true);
    setButtonLoading(els.agentScanBtn, true, 'Scoring LinkedIn');
    const raw = await streamPost('/api/scan', { agent: true }, { set innerHTML(v) {
      const clean = plainTextFromRendered(v);
      els.scanOutput.textContent = clean.split('[scan-report]')[0].replace(/\[process exited with code \d+\]/g, '').trim();
    } });
    renderScanResults(raw);
    await refreshBrowserStatus();
    showToast('LinkedIn results scored');
  } finally {
    clearInterval(poller);
    setButtonLoading(els.linkedinSearchBtn, false);
    setButtonLoading(els.agentScanBtn, false);
    setScanButtonsDisabled(false);
  }
});

els.checkLinkedInBtn?.addEventListener('click', async () => {
  activateView('scans');
  els.scanLogWrap.open = true;
  setButtonLoading(els.checkLinkedInBtn, true, 'Checking Session');
  const poller = setInterval(refreshBrowserStatus, 1200);
  try {
    await streamPost('/api/browser/check-linkedin', {}, {
      set innerHTML(v) {
        els.browserLog.textContent = plainTextFromRendered(v);
        refreshBrowserStatus();
      },
    });
    await refreshBrowserStatus();
    showToast('LinkedIn session checked');
  } finally {
    clearInterval(poller);
    setButtonLoading(els.checkLinkedInBtn, false);
  }
});

els.browserCancelBtn?.addEventListener('click', async () => {
  await api('/api/browser/cancel', { method: 'POST', body: JSON.stringify({}) });
  await refreshBrowserStatus();
  showToast('Browser scan cancel requested');
});

els.tailorBtn.addEventListener('click', async () => {
  updateTailorState();
  if (els.tailorBtn.disabled) return;
  const assumptionText = [
    'Generate a package from the current profile and master resume?',
    '',
    `Company: ${els.tailorCompany.value.trim()}`,
    `Role: ${els.tailorRole.value.trim()}`,
    '',
    'Suitor will use only profile-backed facts and the current master resume.',
    'The output is checked for unsupported claims, private details, and profile guardrail conflicts.',
  ].join('\n');
  if (!confirm(assumptionText)) return;
  const out = addMessage('assistant', '');
  setButtonLoading(els.tailorBtn, true, 'Tailoring Resume');
  try {
    await streamPost('/api/tailor', {
      company: els.tailorCompany.value,
      role: els.tailorRole.value,
      jdText: els.tailorJd.value,
    }, out);
    showToast('Application package created');
  } finally {
    setButtonLoading(els.tailorBtn, false);
    updateTailorState();
  }
});

[els.tailorCompany, els.tailorRole, els.tailorJd].forEach(input => input.addEventListener('input', updateTailorState));

els.applicationSearch?.addEventListener('input', () => {
  state.applicationQuery = els.applicationSearch.value.trim();
  localStorage.setItem('applicationQuery', state.applicationQuery);
  renderApplications(state.trackerCards);
});

els.clearApplicationSearch?.addEventListener('click', () => {
  state.applicationQuery = '';
  localStorage.removeItem('applicationQuery');
  if (els.applicationSearch) {
    els.applicationSearch.value = '';
    els.applicationSearch.focus();
  }
  renderApplications(state.trackerCards);
});

els.refreshBtn.addEventListener('click', async () => {
  setButtonLoading(els.refreshBtn, true, 'Syncing Applications');
  try {
    await bootstrap();
    showToast('Applications synced');
  } finally {
    setButtonLoading(els.refreshBtn, false);
  }
});
els.addRoleBtn.addEventListener('click', () => {
  const template = [
    '',
    '',
    '### Company - Role',
    '- **Status:** READY_TO_REVIEW',
    '- **Comp posted:** ',
    '- **Location:** ',
    '- **Date added:** ' + new Date().toISOString().slice(0, 10),
    `- **Next action:** Review JD against ${state.meta.candidateFirst}'s profile before packaging.`,
  ].join('\n');
  els.trackerEditor.value += template;
  document.querySelector('.editor-wrap').open = true;
  els.trackerEditor.focus();
  addMessage('system', 'Role template added to the tracker editor. Review it, then use Save Changes.');
});
els.weeklyPlanBtn.addEventListener('click', () => {
  els.message.value = 'Generate my weekly application plan from the current tracker.';
  els.message.focus();
});
els.refreshResume.addEventListener('click', async () => {
  const resume = await api('/api/resume-preview');
  els.resumePreview.value = resume.markdown;
});

els.clearChat.addEventListener('click', async () => {
  if (!confirm('Clear this chat session? This keeps tracker, resumes, scans, and generated files untouched.')) return;
  await api('/api/history/clear', { method: 'POST', body: JSON.stringify({}) });
  renderHistory([]);
  addMessage('system', 'Chat session cleared. Tracker, resumes, scans, and generated files were not changed.');
});

els.fileSearch.addEventListener('input', () => {
  state.fileQuery = els.fileSearch.value;
  renderFiles(state.files);
});

els.saveTracker.addEventListener('click', async () => {
  setButtonLoading(els.saveTracker, true, 'Saving Changes');
  try {
    await api('/api/tracker', {
      method: 'POST',
      body: JSON.stringify({ markdown: els.trackerEditor.value }),
    });
    addMessage('system', 'Tracker saved with a timestamped backup.');
    showToast('Tracker updated');
    await bootstrap();
  } finally {
    setButtonLoading(els.saveTracker, false);
  }
});

els.resumePreview.addEventListener('change', async () => {
  await api('/api/resume-preview', {
    method: 'POST',
    body: JSON.stringify({ markdown: els.resumePreview.value }),
  });
});

els.themeToggle.addEventListener('click', () => {
  document.body.classList.toggle('dark');
  localStorage.setItem('theme', document.body.classList.contains('dark') ? 'dark' : 'light');
  updateThemeToggle();
});

$$('.nav-item').forEach(btn => btn.addEventListener('click', () => activateView(btn.dataset.view)));
$$('[data-doc]').forEach(button => {
  button.addEventListener('click', async () => {
    $$('[data-doc]').forEach(btn => btn.classList.toggle('active', btn === button));
    const doc = await api(`/api/doc?name=${encodeURIComponent(button.dataset.doc)}`);
    els.docViewer.textContent = doc.markdown;
  });
});

els.copyDocBtn.addEventListener('click', async () => {
  if (!els.docViewer.textContent.trim()) return;
  await navigator.clipboard.writeText(els.docViewer.textContent);
  showToast('Reference copied');
});

els.editConnectionsBtn?.addEventListener('click', () => showOnboardingWizard(true));

els.clearCustomSourcesBtn?.addEventListener('click', async () => {
  if (!confirm('Clear custom RSS feeds and target companies from this profile?')) return;
  const response = await api('/api/connections/custom/clear', { method: 'POST', body: JSON.stringify({}) });
  renderConnections(response.connections || {});
  showToast('Custom sources cleared');
});

els.disconnectLinkedInBtn?.addEventListener('click', async () => {
  if (!confirm('Disconnect LinkedIn and clear the local browser session for this profile?')) return;
  const response = await api('/api/connections/linkedin/disconnect', { method: 'POST', body: JSON.stringify({}) });
  renderConnections(response.connections || {});
  await refreshBrowserStatus();
  showToast('LinkedIn disconnected');
});

els.backupDbBtn?.addEventListener('click', async () => {
  await api('/api/backup', { method: 'POST', body: JSON.stringify({}) });
  showToast('Profile database backup saved');
});

els.importEmailBtn?.addEventListener('click', async () => {
  const message = els.emailImportText?.value.trim() || '';
  if (!message) return showToast('Paste email text first');
  const response = await api('/api/connections/email/import', {
    method: 'POST',
    body: JSON.stringify({
      message,
      company: els.emailImportCompany?.value.trim() || '',
      role: els.emailImportRole?.value.trim() || '',
    }),
  });
  renderConnections(response.connections || {});
  renderApplications(response.trackerCards || state.trackerCards);
  els.emailImportText.value = '';
  if (els.emailImportCompany) els.emailImportCompany.value = '';
  if (els.emailImportRole) els.emailImportRole.value = '';
  if (els.emailImportResult) els.emailImportResult.textContent = response.message || 'Email imported.';
  showToast(response.message || 'Email imported');
});

els.clearEmailImportsBtn?.addEventListener('click', async () => {
  if (!confirm('Clear local email import history? This does not remove tracker rows already created.')) return;
  const response = await api('/api/connections/email/clear', { method: 'POST', body: JSON.stringify({}) });
  renderConnections(response.connections || {});
  showToast('Email import history cleared');
});

els.captureJobBtn?.addEventListener('click', async () => {
  const payload = {
    company: els.captureCompany?.value.trim() || '',
    role: els.captureRole?.value.trim() || '',
    url: els.captureUrl?.value.trim() || '',
    source: els.captureSource?.value.trim() || '',
    jdText: els.captureText?.value.trim() || '',
  };
  if (!payload.company || !payload.role) return showToast('Add a company and role');
  setButtonLoading(els.captureJobBtn, true, 'Saving Capture');
  try {
    const response = await api('/api/capture', { method: 'POST', body: JSON.stringify(payload) });
    renderCaptures(response.captures || []);
    if (els.captureResult) els.captureResult.textContent = response.message || 'Role saved to profile memory.';
    [els.captureCompany, els.captureRole, els.captureUrl, els.captureSource, els.captureText].forEach(input => {
      if (input) input.value = '';
    });
    showToast(response.duplicate ? 'Capture updated' : 'Role captured');
  } finally {
    setButtonLoading(els.captureJobBtn, false);
  }
});

els.refreshCapturesBtn?.addEventListener('click', async () => {
  const response = await api('/api/captures');
  renderCaptures(response.captures || []);
  showToast('Captures refreshed');
});

els.refreshLearningBtn?.addEventListener('click', async () => {
  setButtonLoading(els.refreshLearningBtn, true, 'Refreshing');
  try {
    renderLearningInsights(await api('/api/learning-summary'));
    showToast('Learning insights refreshed');
  } finally {
    setButtonLoading(els.refreshLearningBtn, false);
  }
});

if (localStorage.getItem('theme') === 'dark') document.body.classList.add('dark');
updateThemeToggle();
bootstrap();
