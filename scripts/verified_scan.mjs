#!/usr/bin/env node

import { spawnSync } from 'child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, readdirSync, statSync, renameSync } from 'fs';
import { dirname, join, relative, resolve } from 'path';
import { fileURLToPath } from 'url';
import { htmlToPlainText } from '../providers/_html_text.mjs';
import { assertSafeFetchUrl, strictUrlFetchEnabled } from '../providers/_url_safety.mjs';
import { completeCursorPrompt } from '../web/cursor_agent.mjs';
import { runSelectedScoring } from '../web/llm_routing.mjs';

const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
function envValue(name, legacyName, fallback = '') {
  return process.env[name] || (legacyName ? process.env[legacyName] : '') || fallback;
}

function requiredEnvValue(name, legacyName = '') {
  const value = envValue(name, legacyName, '');
  if (!value) throw new Error(`Missing required Suitor environment variable: ${name}${legacyName ? ` or legacy ${legacyName}` : ''}. Use the profile launcher.`);
  return value;
}

const PROFILE_ROOT = resolve(requiredEnvValue('SUITOR_PROFILE_ROOT', 'SUITOR_PROFILE_ROOT'));

function pathIsSameOrUnder(child, parent) {
  const rel = relative(parent, child);
  return child === parent || (rel && !rel.startsWith('..') && !rel.includes(':'));
}

function profileLocalPath(pathValue, label) {
  const full = resolve(pathValue);
  if (!pathIsSameOrUnder(full, PROFILE_ROOT)) {
    throw new Error(`${label} must stay under SUITOR_PROFILE_ROOT for profile isolation: ${full}`);
  }
  return full;
}

const RUNTIME_ROOT = process.env.SUITOR_RUNTIME_ROOT || process.env.SUITOR_RUNTIME_ROOT
  ? profileLocalPath(envValue('SUITOR_RUNTIME_ROOT', 'SUITOR_RUNTIME_ROOT'), 'SUITOR_RUNTIME_ROOT')
  : resolve(PROFILE_ROOT, '.suitor-runtime');
const LEGACY_RUNTIME_ROOT = resolve(PROFILE_ROOT, '.suitor-runtime');
const ASSESSMENTS_ROOT = profileLocalPath(envValue('SUITOR_ASSESSMENTS_ROOT', 'SUITOR_ASSESSMENTS_ROOT', resolve(PROFILE_ROOT, 'Assessments')), 'SUITOR_ASSESSMENTS_ROOT');
const BROWSER_RESULTS_PATH = resolve(RUNTIME_ROOT, 'browser', 'linkedin-results.json');
const BROWSER_STATUS_PATH = resolve(RUNTIME_ROOT, 'browser', 'status.json');
const PERSON_KEY = requiredEnvValue('SUITOR_PERSON_KEY', 'SUITOR_PERSON_KEY').toLowerCase();
const CANDIDATE_NAME = envValue('SUITOR_CANDIDATE_NAME', 'SUITOR_CANDIDATE_NAME', 'Candidate');
const CANDIDATE_FIRST = envValue('SUITOR_CANDIDATE_FIRST', 'SUITOR_CANDIDATE_FIRST', CANDIDATE_NAME.split(/\s+/)[0] || 'Candidate');
const ASSISTANT_NAME = envValue('SUITOR_ASSISTANT_NAME', 'SUITOR_ASSISTANT_NAME', 'Assistant');
const today = new Date().toISOString().slice(0, 10);
const runStamp = new Date().toISOString().replace(/[:.]/g, '-');
const VERIFIED_SCAN_LIMIT = Math.max(1, Number(envValue('SUITOR_VERIFIED_SCAN_LIMIT', 'SUITOR_VERIFIED_SCAN_LIMIT', 50)));
const SCAN_STATE_PATH = resolve(RUNTIME_ROOT, 'scan-state.json');
const SCAN_HISTORY_PATH = resolve(RUNTIME_ROOT, 'scan-history.tsv');

function resolveCodexBin() {
  const configured = process.env.SUITOR_CODEX_BIN || process.env.CODEX_BIN || '';
  const candidates = [
    configured,
    resolve(process.env.LOCALAPPDATA || '', 'OpenAI', 'Codex', 'bin', 'codex.exe'),
    ...(String(process.env.Path || process.env.PATH || '')
      .split(';')
      .filter(Boolean)
      .flatMap(dir => [
        resolve(dir, 'codex.exe'),
        resolve(dir, 'codex.cmd'),
        resolve(dir, 'codex.bat'),
      ])),
  ].filter(Boolean);
  return candidates.find(candidate => existsSync(candidate)) || 'codex';
}

if (!existsSync(RUNTIME_ROOT) && existsSync(LEGACY_RUNTIME_ROOT)) {
  try {
    cpSync(LEGACY_RUNTIME_ROOT, RUNTIME_ROOT, { recursive: true, force: false });
  } catch (err) {
    console.warn(`Suitor verified scan runtime migration warning: ${err.message}`);
  }
}
mkdirSync(RUNTIME_ROOT, { recursive: true });

function writeTextAtomic(filePath, text, options = {}) {
  mkdirSync(dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, text, { encoding: 'utf-8', ...options });
  renameSync(tmp, filePath);
}

function writeJsonAtomic(filePath, value) {
  writeTextAtomic(filePath, JSON.stringify(value, null, 2));
}

function normalizeKey(value = '') {
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/https?:\/\//g, '')
    .replace(/[?#].*$/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitTitle(title = '') {
  const parts = String(title || '').split(/\s+-\s+/).map(part => part.trim()).filter(Boolean);
  if (parts.length >= 2) return { role: parts.slice(0, -1).join(' - '), company: parts[parts.length - 1] };
  return { role: String(title || '').trim(), company: '' };
}

function roleVariants(value = '') {
  const full = String(value || '').trim();
  return [
    full,
    full.split(/\s+-\s+/)[0],
    full.replace(/\s+\([^)]*\)\s*$/g, ''),
  ].filter(Boolean);
}

function sourcePlaceholderCompany(value = '') {
  return /\b(builtin|built in|linkedin|wellfound|yc|y combinator|indeed|jobgether|glassdoor|google jobs|websearch|lever chief of staff|ai analytics)\b/i.test(String(value || ''));
}

function decisionAliases({ title = '', company = '', role = '', url = '' } = {}) {
  const parsed = splitTitle(title);
  const resolvedRole = role || parsed.role || title;
  const resolvedCompany = company || parsed.company || '';
  const variants = roleVariants(resolvedRole);
  const aliases = [
    normalizeKey(title),
    normalizeKey(url),
    normalizeKey([resolvedRole, resolvedCompany].filter(Boolean).join(' ')),
    normalizeKey([resolvedCompany, resolvedRole].filter(Boolean).join(' ')),
    ...variants.flatMap(v => [
      normalizeKey([v, resolvedCompany].filter(Boolean).join(' ')),
      normalizeKey([resolvedCompany, v].filter(Boolean).join(' ')),
    ]),
  ].filter(Boolean);
  return [...new Set(aliases)];
}

function readScanStateDecisions() {
  if (!existsSync(SCAN_STATE_PATH)) return [];
  try {
    const parsed = JSON.parse(readFileSync(SCAN_STATE_PATH, 'utf-8').replace(/^\uFEFF/, ''));
    return Array.isArray(parsed.decisions)
      ? parsed.decisions.map(item => ({ ...item, aliases: Array.isArray(item.aliases) ? item.aliases : decisionAliases(item) }))
      : [];
  } catch {
    return [];
  }
}

function hiddenDecision(decision = {}) {
  return /\b(pass|passed|skip|dismiss|remove|removed|rejected|submitted|applied|withdrew|accepted|duplicate|existing)\b/i.test(decision.decision || '');
}

function decisionMatchesOffer(decision, offer) {
  if (!hiddenDecision(decision)) return false;
  const offerAliases = decisionAliases({
    title: offer.title || '',
    company: offer.company || '',
    role: offer.role || offer.title || '',
    url: offer.url || '',
  });
  const decisionSet = new Set(Array.isArray(decision.aliases) ? decision.aliases : decisionAliases(decision));
  if (offerAliases.some(alias => decisionSet.has(alias))) return true;

  const parsedOffer = splitTitle(offer.title || '');
  const parsedDecision = splitTitle(decision.title || '');
  const offerRole = normalizeKey(offer.role || parsedOffer.role || offer.title || '');
  const decisionRole = normalizeKey(decision.role || parsedDecision.role || decision.title || '');
  const offerCompany = offer.company || parsedOffer.company || '';
  const decisionCompany = decision.company || parsedDecision.company || '';
  const offerPlaceholder = sourcePlaceholderCompany(offerCompany) || sourcePlaceholderCompany(parsedOffer.company);
  const decisionPlaceholder = sourcePlaceholderCompany(decisionCompany) || sourcePlaceholderCompany(parsedDecision.company);
  const sameRole = offerRole && decisionRole && (
    offerRole === decisionRole
    || (offerRole.length > 12 && decisionRole.length > 12 && (offerRole.includes(decisionRole) || decisionRole.includes(offerRole)))
  );
  // Source search placeholders such as "BuiltIn" and generic LinkedIn result
  // wrappers are not stable company identities. Let real prior decisions
  // suppress stale placeholder cards, but never let a generic placeholder
  // decision hide a real company-specific role like Carta or Replit.
  return sameRole && offerPlaceholder;
}

export function filterSuppressedOffers(offers) {
  const decisions = readScanStateDecisions();
  const suppressed = [];
  const active = [];
  for (const offer of offers) {
    const hardFilter = hardFilterMatch(offer);
    if (hardFilter) suppressed.push({ offer, hardFilter });
    else {
      const match = decisions.find(decision => decisionMatchesOffer(decision, offer));
      if (match) suppressed.push({ offer, decision: match });
      else active.push(offer);
    }
  }
  return { offers: active, suppressed };
}

function hardFilterTerms() {
  const profile = profileJson();
  const filters = profile?.scoring?.hardFilters || {};
  return [
    ...(Array.isArray(filters.excludeKeywords) ? filters.excludeKeywords : []),
    ...(Array.isArray(filters.automaticRejections) ? filters.automaticRejections : []),
  ].map(term => String(term || '').trim().toLowerCase()).filter(term => term.length >= 3);
}

function hardFilterMatch(offer = {}) {
  const haystack = [
    offer.title,
    offer.role,
    offer.company,
    offer.location,
    offer.source,
    offer.url,
  ].map(value => String(value || '').toLowerCase()).join(' ');
  return hardFilterTerms().find(term => haystack.includes(term)) || '';
}

function appendScanHistory(offers = []) {
  if (!offers.length) return;
  const exists = existsSync(SCAN_HISTORY_PATH);
  const lines = [];
  if (!exists) lines.push('url\tseen_at\tsource\ttitle\tcompany\tlocation');
  const seenAt = new Date().toISOString();
  for (const offer of offers) {
    lines.push([
      offer.url || '',
      seenAt,
      offer.source || '',
      offer.title || '',
      offer.company || '',
      offer.location || '',
    ].map(value => String(value).replace(/\t|\r?\n/g, ' ')).join('\t'));
  }
  const existing = existsSync(SCAN_HISTORY_PATH)
    ? readFileSync(SCAN_HISTORY_PATH, 'utf-8').replace(/\s*$/, '\n')
    : '';
  writeTextAtomic(SCAN_HISTORY_PATH, `${existing}${lines.join('\n')}\n`);
}

function compactFetchedText(text = '') {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  if (value.length <= 10000) return value;
  return `${value.slice(0, 7000)}\n\n[...middle of JD omitted for scoring payload size...]\n\n${value.slice(-3000)}`;
}

function envBase() {
  return {
    ...process.env,
    DISABLE_TELEMETRY: '1',
    OTEL_SDK_DISABLED: 'true',
    DO_NOT_TRACK: '1',
  };
}

function runScanJson() {
  const scanScript = resolve(APP_ROOT, 'scan.mjs');
  const scanArgs = [scanScript, '--dry-run', '--json', '--no-websearch'];
  const run = () => spawnSync(process.execPath, scanArgs, {
    cwd: APP_ROOT,
    encoding: 'utf-8',
    env: envBase(),
    maxBuffer: 20 * 1024 * 1024,
  });
  let result = run();
  if (result.error) {
    // Windows occasionally returns EPERM for a transient child-process launch.
    // Retry once before failing the whole verified scan.
    result = run();
  }
  if (result.status !== 0) {
    const detail = [
      result.error ? `${result.error.name || 'Error'}: ${result.error.message}` : '',
      result.stderr,
      result.stdout,
    ].filter(Boolean).join('\n\n').slice(0, 4000);
    throw new Error(`Local portal scan failed before verification.\n\n${detail}`);
  }
  try {
    return JSON.parse(result.stdout);
  } catch (err) {
    throw new Error(`Local portal scan returned non-JSON output.\n\n${String(result.stdout || '').slice(0, 4000)}\n\nParse error: ${err.message}`);
  }
}

export function browserResults() {
  if (!existsSync(BROWSER_RESULTS_PATH)) return [];
  try {
    const parsed = JSON.parse(readFileSync(BROWSER_RESULTS_PATH, 'utf-8').replace(/^\uFEFF/, ''));
    if (parsed.consumedAt || parsed.clearedAt) return [];
    const rows = Array.isArray(parsed.results) ? parsed.results : [];
    return rows.map(item => ({
      title: item.title || '',
      company: item.company || 'LinkedIn',
      location: item.location || '',
      url: item.url || '',
      source: 'linkedin-browser',
      applyType: item.applyType || '',
      browserSnippet: item.jdText || item.snippet || '',
    })).filter(item => item.title && item.url);
  } catch {
    return [];
  }
}

function markBrowserResultsConsumed(count) {
  if (!count) return;
  if (existsSync(BROWSER_RESULTS_PATH)) {
    try {
      const parsed = JSON.parse(readFileSync(BROWSER_RESULTS_PATH, 'utf-8').replace(/^\uFEFF/, ''));
      writeJsonAtomic(BROWSER_RESULTS_PATH, {
        ...parsed,
        consumedAt: new Date().toISOString(),
        consumedCount: count,
      });
    } catch {}
  }
  let status = { state: 'idle', logs: [] };
  if (existsSync(BROWSER_STATUS_PATH)) {
    try { status = { ...status, ...JSON.parse(readFileSync(BROWSER_STATUS_PATH, 'utf-8').replace(/^\uFEFF/, '')) }; } catch {}
  }
  const logs = Array.isArray(status.logs) ? status.logs : [];
  logs.push({ at: new Date().toISOString(), text: `Verified Scan consumed ${count} LinkedIn browser result${count === 1 ? '' : 's'} and routed them into normal scan buckets.` });
  writeJsonAtomic(BROWSER_STATUS_PATH, {
    ...status,
    state: 'idle',
    resultCount: count,
    logs: logs.slice(-80),
    updatedAt: new Date().toISOString(),
    personKey: PERSON_KEY,
  });
}

function readProfileFile(name) {
  const path = resolve(PROFILE_ROOT, name);
  return existsSync(path) ? readFileSync(path, 'utf-8') : '';
}

function profileMarkdown() {
  return readProfileFile(`Candidate Search Profile - ${CANDIDATE_FIRST}.md`)
    || readProfileFile(`Candidate Search Profile - ${CANDIDATE_NAME}.md`)
    || readProfileFile('Candidate Search Profile.md');
}

function profileJson() {
  const candidates = [
    `Candidate Search Profile - ${CANDIDATE_FIRST}.json`,
    `Candidate Search Profile - ${CANDIDATE_NAME}.json`,
    'Candidate Search Profile.json',
  ];
  for (const name of candidates) {
    const raw = readProfileFile(name);
    if (!raw) continue;
    try {
      return JSON.parse(raw.replace(/^\uFEFF/, ''));
    } catch {}
  }
  return {};
}

function shortlistFloor() {
  const profile = profileJson();
  const value = Number(profile?.scoring?.thresholds?.shortlist);
  return Number.isFinite(value) && value > 0 ? value : 75;
}

function trackerMarkdown() {
  return readProfileFile(`Applications Tracker - ${CANDIDATE_FIRST}.md`)
    || readProfileFile(`Applications Tracker - ${CANDIDATE_NAME}.md`)
    || readProfileFile('Applications Tracker.md');
}

function scanPromptMarkdown() {
  return readProfileFile(`Job Scan Prompt - ${CANDIDATE_FIRST}.md`)
    || readProfileFile(`Job Scan Prompt - ${CANDIDATE_NAME}.md`)
    || readProfileFile('Job Scan Prompt.md');
}

function assessmentMarkdown() {
  if (!existsSync(ASSESSMENTS_ROOT)) return 'No workplace assessment files uploaded.';
  const chunks = [];
  const visit = dir => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) visit(full);
      if (!entry.isFile() || !full.toLowerCase().endsWith('.txt')) continue;
      if (!statSync(full).size) continue;
      chunks.push(`## ${entry.name}\n${readFileSync(full, 'utf-8').replace(/\s+/g, ' ').trim().slice(0, 3000)}`);
    }
  };
  visit(ASSESSMENTS_ROOT);
  return chunks.length ? chunks.slice(0, 8).join('\n\n') : 'Workplace assessment files may exist, but no extracted text is available yet.';
}

function htmlToText(html) {
  return htmlToPlainText(html);
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

async function fetchJobUrlWithSafety(rawUrl, options = {}) {
  const strict = strictUrlFetchEnabled();
  let currentUrl = String(rawUrl || '');
  for (let hop = 0; hop <= 5; hop++) {
    await assertSafeFetchUrl(currentUrl, { strict });
    const response = await fetch(currentUrl, {
      ...options,
      redirect: strict ? 'manual' : 'follow',
    });
    if (!strict) {
      return { response, finalUrl: response.url, redirected: Boolean(response.redirected) };
    }
    const location = response.headers.get('location');
    if (!REDIRECT_STATUSES.has(response.status) || !location) {
      return { response, finalUrl: currentUrl, redirected: currentUrl !== String(rawUrl || '') };
    }
    currentUrl = new URL(location, currentUrl).toString();
  }
  throw new Error('HTTP redirect limit exceeded while validating job URL.');
}

function hostnameFromUrl(value = '') {
  try {
    return new URL(String(value || '')).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return '';
  }
}

function shouldAttemptBrowserRecovery(offer = {}, classification = {}) {
  const enabled = /^(1|true|yes)$/i.test(String(envValue('SUITOR_BROWSER_RECOVERY', 'SUITOR_BROWSER_RECOVERY', '')));
  const host = hostnameFromUrl(offer.url);
  const highValueJsHost = /\bashbyhq\.com$|\.ashbyhq\.com$|greenhouse\.io$|\.greenhouse\.io$|jobs\.lever\.co$/.test(host);
  const state = String(classification.verificationState || '');
  return /JS-RENDERED|REDIRECTED/.test(state) && (enabled || highValueJsHost);
}

export async function browserRecoverJobPage(offer = {}) {
  const started = Date.now();
  let browser;
  try {
    const strict = strictUrlFetchEnabled();
    await assertSafeFetchUrl(offer.url, { strict });
    const { chromium } = await import('playwright');
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({
      viewport: { width: 1280, height: 1000 },
      userAgent: `${CANDIDATE_FIRST}-Suitor/1.0 browser-recovery`,
    });
    if (strict) {
      await page.route('**/*', async route => {
        try {
          await assertSafeFetchUrl(route.request().url(), { strict: true });
          await route.continue();
        } catch {
          await route.abort('blockedbyclient');
        }
      });
    }
    await page.goto(offer.url, { waitUntil: 'domcontentloaded', timeout: 25000 });
    await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});
    await page.waitForTimeout(1200);
    const text = await page.locator('body').innerText({ timeout: 5000 }).catch(() => '');
    const finalUrl = page.url();
    const classification = classifyFetchedJobPage({
      offer,
      status: 'browser',
      ok: Boolean(text),
      redirected: finalUrl && finalUrl !== offer.url,
      finalUrl,
      readableText: text,
    });
    return {
      ...classification,
      httpStatus: 'browser',
      finalUrl,
      durationMs: Date.now() - started,
      recovered: classification.verificationState === 'LIVE',
      recoveryReason: classification.verificationState === 'LIVE'
        ? `BROWSER-RECOVERY; rendered ${hostnameFromUrl(offer.url) || 'job page'} and extracted ${classification.text.length} characters of readable job-page text.`
        : `BROWSER-RECOVERY; rendered page but still did not expose enough readable JD body.`,
    };
  } catch (err) {
    return {
      verificationState: 'JS-RENDERED',
      verificationReason: `Browser recovery failed: ${err.message}`,
      httpStatus: 'browser-error',
      finalUrl: offer.url,
      durationMs: Date.now() - started,
      text: '',
      recovered: false,
      recoveryReason: `Browser recovery failed: ${err.message}`,
    };
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

export function classifyFetchedJobPage({
  offer = {},
  status = 0,
  ok = false,
  redirected = false,
  finalUrl = '',
  readableText = '',
  browserSnippet = '',
} = {}) {
  const text = String(readableText || '').slice(0, 18000);
  const lower = text.toLowerCase();
  const titleWords = String(offer.title || '').toLowerCase().split(/[^a-z0-9]+/).filter(word => word.length >= 4);
  const titleHit = titleWords.some(word => lower.includes(word));
  const hasApplySignal = /\b(apply|application|submit|job|role|responsibilit|qualification|salary|compensation)\b/i.test(text);
  let state = ok ? 'LIVE' : 'DEAD';
  if (ok && (text.length < 900 || (!titleHit && !hasApplySignal))) state = 'JS-RENDERED';

  const browserText = offer.source === 'linkedin-browser' && browserSnippet
    ? `Browser-extracted LinkedIn snippet: ${browserSnippet}`
    : '';
  if (browserText && state !== 'LIVE') state = 'JS-RENDERED';
  if (redirected && ok && state !== 'LIVE') state = 'REDIRECTED';

  const reason = state === 'LIVE'
    ? redirected
      ? `HTTP ${status}; redirected to ${finalUrl || 'a final URL'} and fetched ${text.length} characters of readable job-page text.`
      : `HTTP ${status}; fetched ${text.length} characters of readable job-page text.`
    : state === 'JS-RENDERED'
      ? `HTTP ${status}; static fetch did not expose enough readable JD body.`
      : state === 'REDIRECTED'
        ? `HTTP ${status}; role URL redirected and did not expose enough readable JD body.`
        : `HTTP ${status}; page did not return a live job body.`;

  return {
    verificationState: state,
    verificationReason: reason,
    text: state === 'LIVE' ? text : browserText,
  };
}

export function classifyFetchFailure({ offer = {}, error = {}, durationMs = 0 } = {}) {
  const browserSnippet = String(offer.browserSnippet || '');
  const browserText = offer.source === 'linkedin-browser' && browserSnippet
    ? `Browser-extracted LinkedIn snippet: ${browserSnippet}`
    : '';
  const aborted = error?.name === 'AbortError';
  return {
    verificationState: browserText ? 'JS-RENDERED' : (aborted ? 'TIMEOUT' : 'DEAD'),
    verificationReason: browserText
      ? 'Direct fetch failed, but browser search captured LinkedIn result text.'
      : aborted
        ? 'Fetch timed out after 20 seconds.'
        : `Fetch failed: ${error?.message || 'unknown error'}`,
    durationMs,
    text: browserText,
  };
}

export async function fetchCandidate(offer) {
  if (offer.source === 'linkedin-browser' && String(offer.browserSnippet || '').length >= 900) {
    return {
      ...offer,
      httpStatus: 'browser',
      finalUrl: offer.url,
      verificationState: 'LIVE',
      verificationReason: `LINKEDIN-BROWSER; opened result in logged-in browser, skipped Easy Apply, and extracted ${offer.browserSnippet.length} characters of visible job detail text.`,
      durationMs: 0,
      text: `Browser-extracted LinkedIn job detail:\n${offer.browserSnippet}`,
    };
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  const started = Date.now();
  try {
    const { response, finalUrl, redirected } = await fetchJobUrlWithSafety(offer.url, {
      signal: controller.signal,
      headers: {
        'user-agent': `${CANDIDATE_FIRST}-Suitor/1.0`,
        accept: 'text/html,application/xhtml+xml,application/json,text/plain;q=0.8,*/*;q=0.5',
      },
    });
    const body = await response.text();
    const text = htmlToText(body).slice(0, 18000);
    const durationMs = Date.now() - started;
    const classification = classifyFetchedJobPage({
      offer,
      status: response.status,
      ok: response.ok,
      redirected,
      finalUrl,
      readableText: text,
      browserSnippet: offer.browserSnippet,
    });
    if (shouldAttemptBrowserRecovery(offer, classification)) {
      const recovered = await browserRecoverJobPage(offer);
      if (recovered.recovered) {
        return {
          ...offer,
          httpStatus: recovered.httpStatus,
          finalUrl: recovered.finalUrl,
          verificationState: recovered.verificationState,
          verificationReason: recovered.recoveryReason,
          durationMs: recovered.durationMs,
          text: recovered.text,
        };
      }
      classification.verificationReason = `${classification.verificationReason} ${recovered.recoveryReason}`;
    }
    return {
      ...offer,
      httpStatus: response.status,
      finalUrl,
      verificationState: classification.verificationState,
      verificationReason: classification.verificationReason,
      durationMs,
      text: classification.text,
    };
  } catch (err) {
    const classification = classifyFetchFailure({ offer, error: err, durationMs: Date.now() - started });
    return {
      ...offer,
      httpStatus: 0,
      finalUrl: offer.url,
      verificationState: classification.verificationState,
      verificationReason: classification.verificationReason,
      durationMs: classification.durationMs,
      text: classification.text,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchAll(candidates) {
  const rows = new Array(candidates.length);
  const limit = Math.max(1, Math.min(Number(envValue('SUITOR_VERIFY_FETCH_CONCURRENCY', 'SUITOR_VERIFY_FETCH_CONCURRENCY', 8)), candidates.length || 1));
  let next = 0;
  let completed = 0;
  console.log(`Verifying ${candidates.length} candidate URLs with ${limit} parallel fetches...`);

  async function worker() {
    while (next < candidates.length) {
      const index = next++;
      rows[index] = await fetchCandidate(candidates[index]);
      completed += 1;
      if (completed === candidates.length || completed % 5 === 0) {
        console.log(`Verified ${completed}/${candidates.length} URLs...`);
      }
    }
  }

  await Promise.all(Array.from({ length: limit }, () => worker()));
  return rows.filter(Boolean);
}

function extractJson(text) {
  const cleaned = String(text || '').trim();
  const fenced = cleaned.match(/```json\s*([\s\S]*?)```/i);
  const raw = fenced ? fenced[1] : cleaned.slice(cleaned.indexOf('{'), cleaned.lastIndexOf('}') + 1);
  if (!raw.trim()) throw new Error('No JSON object returned.');
  return JSON.parse(raw);
}

function scoringPrompt(fetched) {
  const scorable = fetched.map(item => ({
    title: item.title,
    company: item.company,
    url: item.url,
    source: item.source || '',
    applyType: item.applyType || '',
    locationFromScan: item.location || '',
    verificationState: item.verificationState,
    verificationReason: item.verificationReason,
    fetchedText: compactFetchedText(item.text),
  }));
  const floor = shortlistFloor();
  const prompt = `
You are ${ASSISTANT_NAME}, the local career operating partner for ${CANDIDATE_NAME}.

Task: score this verified scan shortlist against ${CANDIDATE_FIRST}'s locked profile. The app has already direct-fetched every URL; use only the fetched text, scan metadata, candidate profile, tracker, and scan prompt below. Do not mention any other user or profile.

Rules:
- Return JSON only, no markdown.
- Use the scoring rubric in the profile and scan prompt. ${CANDIDATE_FIRST}'s shortlist floor is ${floor}/100.
- If verificationState is JS-RENDERED, REDIRECTED, TIMEOUT, DEAD, or fetchedText lacks enough JD body to score responsibly, set score to null and scoreBreakdown to "withheld - needs full JD".
- Do not invent compensation, location, responsibilities, reporting line, funding stage, or title altitude. Use "not stated" when absent.
- Apply hard rejects and elevated screen-rejection-risk flags from the profile.
- Use workplace assessments only as soft-grading context for working style, motivation, culture, and interview probes. Never make them a hard pass/fail filter unless the operator explicitly says to.
- Keep recommendedAction operational: Package Role, Needs Decision, Verify in Browser, or Pass.

Candidate Search Profile:
${profileMarkdown().slice(0, 18000)}

Job Scan Prompt:
${scanPromptMarkdown().slice(0, 12000)}

Applications Tracker:
${trackerMarkdown().slice(0, 12000)}

Workplace Assessments:
${assessmentMarkdown().slice(0, 9000)}

Fetched candidates:
${JSON.stringify(scorable, null, 2)}

Return exactly this JSON shape:
{
  "rows": [
    {
      "title": "",
      "company": "",
      "url": "",
      "verificationState": "LIVE|JS-RENDERED|REDIRECTED|TIMEOUT|DEAD",
      "verificationReason": "",
      "location": "not stated",
      "postedComp": "not stated",
      "score": null,
      "scoreBreakdown": "Role x/30, Company x/20, Comp x/12, Geo x/13, Growth x/10, Risk x/15 OR withheld - needs full JD",
      "riskFlags": [],
      "source": "",
      "recommendedAction": ""
    }
  ],
  "notes": ""
}
`;
  return prompt;
}

function runCodexScoring(fetched) {
  if (!fetched.length) return { rows: [], notes: 'No new roles cleared local scan and tracker dedupe.' };
  const prompt = scoringPrompt(fetched);
  const outFile = resolve(RUNTIME_ROOT, `verified-scan-${Date.now()}.json`);
  const result = spawnSync(resolveCodexBin(), [
    'exec',
    '--sandbox', 'read-only',
    '--skip-git-repo-check',
    '--ephemeral',
    '-C', PROFILE_ROOT,
    '-o', outFile,
    '-',
  ], {
    cwd: PROFILE_ROOT,
    input: prompt,
    encoding: 'utf-8',
    env: envBase(),
    maxBuffer: 30 * 1024 * 1024,
    timeout: 8 * 60 * 1000,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error([result.stderr, result.stdout].filter(Boolean).join('\n\n') || `Codex exited with status ${result.status}`);
  const output = existsSync(outFile) ? readFileSync(outFile, 'utf-8') : result.stdout;
  try {
    if (existsSync(outFile)) rmSync(outFile, { force: true });
  } catch {}
  return extractJson(output);
}

async function runCursorScoring(fetched) {
  if (!fetched.length) return { rows: [], notes: 'No new roles cleared local scan and tracker dedupe.' };
  const output = await completeCursorPrompt({
    prompt: scoringPrompt(fetched),
    cwd: PROFILE_ROOT,
    apiKey: process.env.CURSOR_API_KEY || '',
  });
  return extractJson(output);
}

export function fallbackScoring(fetched, reason) {
  return {
    rows: fetched.map(item => ({
      title: item.title || '',
      company: item.company || '',
      url: item.url || '',
      verificationState: item.verificationState,
      verificationReason: item.verificationReason,
      location: item.location || 'not stated',
      postedComp: 'not stated',
      score: null,
      scoreBreakdown: 'withheld - needs full JD',
      riskFlags: ['scoring-unavailable'],
      recommendedAction: item.verificationState === 'LIVE' ? `Needs Decision - ${ASSISTANT_NAME} could not complete scoring; paste the JD into chat.` : 'Verify in Browser',
    })),
    notes: `Scoring fallback used because the local model run did not return usable JSON: ${reason}`,
  };
}

function trackerSnapshot() {
  return [...trackerMarkdown().matchAll(/^\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|/gm)]
    .slice(0, 16)
    .map(match => `${match[1].trim()} - ${match[2].trim()} (${match[3].trim()})`)
    .filter(line => !line.startsWith('Company - Role') && !line.startsWith('--- - ---'));
}

export function rowIsInvestigation(row) {
  if (/pass|skip|auto-reject/i.test(row.recommendedAction || '')) return false;
  return row.score == null || /JS-RENDERED|REDIRECTED|TIMEOUT|DEAD|needs full JD|withheld|paste|verify/i.test(`${row.verificationState || ''} ${row.scoreBreakdown || ''} ${row.recommendedAction || ''}`);
}

export function writeReport(result, fetched) {
  const floor = shortlistFloor();
  const lines = [];
  lines.push(`# Scan Results - ${CANDIDATE_FIRST} - ${today}`);
  lines.push('');
  lines.push(`Every URL below was direct-fetched by ${CANDIDATE_FIRST}'s Suitor before scoring. No score was assigned from snippets alone.`);
  lines.push('');
  lines.push('## Tracker Dedupe Snapshot');
  lines.push('');
  for (const item of trackerSnapshot()) lines.push(`- ${item}`);
  lines.push('');
  lines.push('## Ranked Shortlist');
  lines.push('');
  const fetchedByUrl = new Map(fetched.map(item => [String(item.url || '').trim(), item]));
  const rows = [...(result.rows || [])].map(row => {
    const source = fetchedByUrl.get(String(row.url || '').trim())?.source || row.source || '';
    const applyType = fetchedByUrl.get(String(row.url || '').trim())?.applyType || row.applyType || '';
    return { ...row, source, applyType };
  });
  const shortlistRows = rows
    .filter(row => !rowIsInvestigation(row) && Number(row.score) >= floor && !/pass|skip|auto-reject|do not pursue|do not package/i.test(row.recommendedAction || ''))
    .sort((a, b) => Number(b.score || 0) - Number(a.score || 0));
  const investigationRows = rows.filter(rowIsInvestigation).sort((a, b) => String(a.company || '').localeCompare(String(b.company || '')));
  const notShortlistedRows = rows
    .filter(row => !rowIsInvestigation(row) && (row.score == null || Number(row.score) < floor || /pass|skip|auto-reject/i.test(row.recommendedAction || '')))
    .sort((a, b) => Number(b.score || 0) - Number(a.score || 0));

  if (!shortlistRows.length) lines.push(`No roles scored ${floor}+ after direct URL verification.`);
  for (const row of shortlistRows) writeRole(lines, row);
  if (investigationRows.length) {
    lines.push('');
    lines.push('## Needs Verification');
    lines.push('');
    lines.push(`These roles need a full JD body or browser verification before ${CANDIDATE_FIRST} decides.`);
    lines.push('');
    for (const row of investigationRows) writeRole(lines, row, true);
  }
  if (notShortlistedRows.length) {
    lines.push('');
    lines.push('## Not Shortlisted');
    lines.push('');
    lines.push(`These roles scored below ${CANDIDATE_FIRST}'s ${floor}+ shortlist threshold.`);
    lines.push('');
    for (const row of notShortlistedRows) writeRole(lines, row);
  }
  lines.push('');
  lines.push('## Direct Fetch Evidence');
  lines.push('');
  for (const item of fetched) {
    lines.push(`- ${item.url} - ${item.verificationState}, HTTP ${item.httpStatus || 'n/a'}, ${item.text?.length || 0} readable characters, ${item.durationMs || 0} ms`);
  }
  if (result.notes) {
    lines.push('');
    lines.push('## Notes');
    lines.push('');
    lines.push(result.notes);
  }
  const outPath = resolve(PROFILE_ROOT, `Scan Results - ${CANDIDATE_FIRST} - ${runStamp}.md`);
  writeTextAtomic(outPath, lines.join('\n'));
  return outPath;
}

function writeRole(lines, row, forceWithheld = false) {
  const floor = shortlistFloor();
  lines.push(`### ${row.title || 'Untitled role'} - ${row.company || 'Unknown company'}`);
  lines.push(`- **Verification:** ${row.verificationState || 'UNKNOWN'} - ${row.verificationReason || 'not stated'}`);
  if (row.source) lines.push(`- **Source:** ${row.source === 'linkedin-browser' ? 'LinkedIn' : row.source}`);
  if (row.applyType) lines.push(`- **Apply type:** ${row.applyType}`);
  lines.push(`- **Location:** ${row.location || 'not stated'}`);
  lines.push(`- **Posted comp:** ${row.postedComp || 'not stated'}`);
  lines.push(`- **Link:** ${row.url || 'not stated'}`);
  if (forceWithheld || row.score == null) lines.push('- **Score:** withheld - needs full JD');
  else lines.push(`- **Score:** ${row.score}/100 (${row.scoreBreakdown || 'No breakdown returned'})`);
  if (Array.isArray(row.riskFlags) && row.riskFlags.length) lines.push(`- **Risk flags:** ${row.riskFlags.join(', ')}`);
  lines.push(`- **Recommended action:** ${row.recommendedAction || (row.score >= floor ? 'Package Role' : 'Needs Decision')}`);
  lines.push('');
}

async function main() {
  console.log(`Starting verified scan for ${CANDIDATE_FIRST}...`);
  console.log('Running local portal scan and tracker dedupe...');
  const scan = runScanJson();
  const browserOffers = browserResults();
  const byUrl = new Map([...(scan.newOffers || []), ...browserOffers].map(item => [String(item.url || `${item.company}-${item.title}`).toLowerCase(), item]));
  const mergedOffers = [...byUrl.values()];
  appendScanHistory(mergedOffers);
  const filtered = filterSuppressedOffers(mergedOffers);
  const candidates = filtered.offers.slice(0, VERIFIED_SCAN_LIMIT);
  if (browserOffers.length) console.log(`Included ${browserOffers.length} profile-local LinkedIn browser results in verified scan candidates.`);
  if (filtered.suppressed.length) console.log(`Suppressed ${filtered.suppressed.length} roles already passed, submitted, rejected, accepted, or otherwise closed in profile-local scan decisions.`);
  console.log(`Local scan found ${scan.totalNewOffers ?? scan.newOffers?.length ?? mergedOffers.length} candidate offers; verifying top ${candidates.length} after durable decision suppression.`);
  if (!candidates.length) {
    console.log('No new candidate offers remain after tracker dedupe, scan-history dedupe, and durable decision suppression.');
    console.log('No empty verified scan report was written; keeping the previous useful scan report visible.');
    markBrowserResultsConsumed(browserOffers.length);
    return;
  }
  const fetched = await fetchAll(candidates);
  let result;
  try {
    console.log(`Scoring ${fetched.length} verified candidates against ${CANDIDATE_FIRST}'s locked profile...`);
    result = await runSelectedScoring({
      provider: String(process.env.SUITOR_LLM_PROVIDER || '').trim().toLowerCase(),
      fetched,
      runCursor: runCursorScoring,
      runCodex: runCodexScoring,
      fallback: fallbackScoring,
    });
  } catch (err) {
    console.log(`Scoring fell back to Needs Verification because local model scoring failed: ${err.message}`);
    result = fallbackScoring(fetched, err.message);
  }
  const outPath = writeReport(result, fetched);
  markBrowserResultsConsumed(browserOffers.length);
  console.log(`Saved ${outPath}`);
  console.log(`Roles reviewed: ${(result.rows || []).length}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(err => {
    console.error(err.message);
    process.exit(1);
  });
}
