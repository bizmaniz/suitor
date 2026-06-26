#!/usr/bin/env node

import { chromium } from 'playwright';
import { cpSync, existsSync, mkdirSync, writeFileSync, readFileSync, rmSync, renameSync } from 'fs';
import { basename, dirname, relative, resolve } from 'path';
import { fileURLToPath } from 'url';

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
const PERSON_KEY = requiredEnvValue('SUITOR_PERSON_KEY', 'SUITOR_PERSON_KEY').toLowerCase();
const CANDIDATE_FIRST = envValue('SUITOR_CANDIDATE_FIRST', 'SUITOR_CANDIDATE_FIRST', 'Candidate');
const LEGACY_RUNTIME_ROOT = resolve(PROFILE_ROOT, '.suitor-runtime');

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
const BROWSER_ROOT = resolve(RUNTIME_ROOT, 'browser');
const USER_DATA_DIR = resolve(BROWSER_ROOT, 'chromium-profile');
const SCREENSHOT_PATH = resolve(BROWSER_ROOT, 'latest.png');
const STATUS_PATH = resolve(BROWSER_ROOT, 'status.json');
const RESULTS_PATH = resolve(BROWSER_ROOT, 'linkedin-results.json');
const CANCEL_PATH = resolve(BROWSER_ROOT, 'cancel.flag');
const DEFAULT_QUERY = envValue('SUITOR_LINKEDIN_QUERY', 'SUITOR_LINKEDIN_QUERY', '"Chief of Staff" OR "Strategic Operations" OR "Director of Partnerships" remote');
const DEFAULT_LOCATION = envValue('SUITOR_LINKEDIN_LOCATION', 'SUITOR_LINKEDIN_LOCATION', 'United States');
const DEFAULT_WORKPLACE = envValue('SUITOR_LINKEDIN_WORKPLACE', 'SUITOR_LINKEDIN_WORKPLACE', '2');
const DEFAULT_RECENCY = envValue('SUITOR_LINKEDIN_RECENCY', 'SUITOR_LINKEDIN_RECENCY', 'r604800');
const DEFAULT_EXPERIENCE = envValue('SUITOR_LINKEDIN_EXPERIENCE', 'SUITOR_LINKEDIN_EXPERIENCE', '4,5,6');
const DEFAULT_SALARY_BUCKET = envValue('SUITOR_LINKEDIN_SALARY_BUCKET', 'SUITOR_LINKEDIN_SALARY_BUCKET', '5');
const LINKEDIN_MAX_PASSES = Math.max(4, Math.min(Number(envValue('SUITOR_LINKEDIN_MAX_PASSES', 'SUITOR_LINKEDIN_MAX_PASSES', 12)) || 12, 24));
const LINKEDIN_STAGNANT_PASS_LIMIT = Math.max(2, Math.min(Number(envValue('SUITOR_LINKEDIN_STAGNANT_PASSES', 'SUITOR_LINKEDIN_STAGNANT_PASSES', 3)) || 3, 6));
const BLOCKED_SOURCE_COMPANY_RE = /\b(swooped|ladders|jobot|cybercoders|robert half|dice|motion recruitment|recruiting|staffing|talent)\b/i;
const DEFAULT_COMP_FLOOR = Number(envValue('SUITOR_COMP_FLOOR', 'SUITOR_COMP_FLOOR', '145000')) || 145000;

if (!existsSync(RUNTIME_ROOT) && existsSync(LEGACY_RUNTIME_ROOT)) {
  try {
    cpSync(LEGACY_RUNTIME_ROOT, RUNTIME_ROOT, { recursive: true, force: false });
  } catch (err) {
    console.warn(`Suitor browser runtime migration warning: ${err.message}`);
  }
}
mkdirSync(BROWSER_ROOT, { recursive: true });
mkdirSync(USER_DATA_DIR, { recursive: true });

function now() {
  return new Date().toISOString();
}

export function safeLog(text) {
  const suppressedLaunchMarker = 'Details suppressed; browser launch command and profile path were omitted from Suitor logs.';
  let value = String(text || '').replace(/\u001b\[[0-9;]*m/g, '');
  value = value
    .replace(/\bSuitor\b/g, 'Suitor')
    .replace(/\.suitor-runtime/gi, '[runtime]')
    .replaceAll(PROFILE_ROOT, '[profile-root]')
    .replaceAll(RUNTIME_ROOT, '[runtime-root]')
    .replaceAll(BROWSER_ROOT, '[browser-root]')
    .replaceAll(USER_DATA_DIR, '[browser-profile]')
    .replace(/--user-data-dir=(?:"[^"]+"|\S+)/gi, '--user-data-dir=[browser-profile]')
    .replace(/--password-store=(?:"[^"]+"|\S+)/gi, '--password-store=[redacted]')
    .replace(/--\S*(?:password|passwd|pwd|secret|token|keychain)\S*(?:=(?:"[^"]+"|\S+))?/gi, '--[redacted]')
    .replace(/\b(pid=)\d+\b/gi, '$1[pid]')
    .replace(/\b(process\s+")\d+(")/gi, '$1[pid]$2')
    .replace(/\b(password|passwd|pwd|secret|token)\b/gi, '[redacted]');
  if (value.includes(suppressedLaunchMarker)) {
    value = `${value.slice(0, value.indexOf(suppressedLaunchMarker)).trim()} ${suppressedLaunchMarker}`.trim();
  } else if (/browserType\.launchPersistentContext|Call log:|remote-debugging-pipe|<launching>/i.test(value)) {
    const summary = value.split(/Call log:/i)[0].trim() || 'Browser automation launch failed.';
    value = `${summary} ${suppressedLaunchMarker}`;
  }
  return value.length > 1200 ? `${value.slice(0, 1200)}... [truncated]` : value;
}

function writeTextAtomic(filePath, text, options = {}) {
  mkdirSync(dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, text, { encoding: 'utf-8', ...options });
  let lastError;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      renameSync(tmp, filePath);
      return;
    } catch (err) {
      lastError = err;
      if (!/^(EPERM|EBUSY|EACCES)$/i.test(String(err?.code || ''))) break;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25 + attempt * 25);
    }
  }
  try { rmSync(tmp, { force: true }); } catch {}
  throw lastError;
}

function writeJsonAtomic(filePath, value) {
  writeTextAtomic(filePath, JSON.stringify(value, null, 2));
}

function readProfileJson() {
  const profileCandidates = [
    `Candidate Search Profile - ${CANDIDATE_FIRST}.json`,
    'Candidate Search Profile.json',
  ];
  for (const name of profileCandidates) {
    const filePath = resolve(PROFILE_ROOT, name);
    if (!existsSync(filePath)) continue;
    try {
      return JSON.parse(readFileSync(filePath, 'utf-8').replace(/^\uFEFF/, ''));
    } catch (err) {
      status({ log: `Could not read ${basename(filePath)} for LinkedIn comp filtering: ${err.message}` });
    }
  }
  return {};
}

function configuredCompFloors() {
  const profile = readProfileJson();
  const compensation = profile?.compensation || {};
  const geography = profile?.geography || {};
  return {
    defaultFloor: Number(compensation.soft_floor_base_atlanta_remote_director_head_of)
      || Number(compensation.manual_review_base_range?.[0])
      || DEFAULT_COMP_FLOOR,
    californiaFloor: Number(compensation.hard_floor_base_california_director_head_of)
      || Number(geography.california_exception?.hard_floor_base)
      || Number(geography.california_exception?.hard_floor)
      || 185000,
  };
}

export function parseMoneyAmount(raw) {
  if (raw === null || raw === undefined) return 0;
  const value = String(raw).replace(/,/g, '').trim();
  const match = value.match(/\$?\s*(\d+(?:\.\d+)?)\s*([kKmM])?/);
  if (!match) return 0;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return 0;
  const suffix = String(match[2] || '').toLowerCase();
  if (suffix === 'm') return Math.round(amount * 1000000);
  if (suffix === 'k') return Math.round(amount * 1000);
  return amount < 1000 ? Math.round(amount * 1000) : Math.round(amount);
}

export function compensationRangeFromText(text) {
  const value = String(text || '').replace(/\u00A0/g, ' ');
  const patterns = [
    /(?:compensation|salary|base\s+salary|pay)\s*(?:range|band)?\s*:?\s*(?:is|from)?\s*(\$?\s*\d+(?:\.\d+)?\s*[kKmM]?)\s*(?:-|–|—|to)\s*(\$?\s*\d+(?:\.\d+)?\s*[kKmM]?)/i,
    /(\$?\s*\d+(?:\.\d+)?\s*[kKmM])\s*(?:-|–|—|to)\s*(\$?\s*\d+(?:\.\d+)?\s*[kKmM])\s*(?:base|salary|compensation|annually|per\s+year)?/i,
    /(\$\s*\d{2,3},?\d{3})\s*(?:-|–|—|to)\s*(\$\s*\d{2,3},?\d{3})/i,
  ];
  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (!match) continue;
    const min = parseMoneyAmount(match[1]);
    const max = parseMoneyAmount(match[2]);
    if (min && max) return { min: Math.min(min, max), max: Math.max(min, max), text: match[0] };
  }
  return null;
}

function isCaliforniaResult(result) {
  const text = [result.location, result.snippet, result.jdText].filter(Boolean).join(' ');
  return /\b(california|san francisco|sf bay|bay area|los angeles|santa monica|san diego|san jose|palo alto|mountain view|redwood city|menlo park|sunnyvale|foster city|sacramento|irvine|oakland)\b/i.test(text);
}

export function isKnownBelowCompFloor(result, floors = configuredCompFloors()) {
  const text = [
    result.compensation,
    result.postedComp,
    result.salary,
    result.location,
    result.snippet,
    result.jdText,
  ].filter(Boolean).join('\n');
  const range = compensationRangeFromText(text);
  if (!range?.max) return false;
  const floor = isCaliforniaResult(result) ? floors.californiaFloor : floors.defaultFloor;
  return range.max < floor;
}

function status(update = {}) {
  let current = { state: 'idle', logs: [], currentUrl: '' };
  if (existsSync(STATUS_PATH)) {
    try { current = { ...current, ...JSON.parse(readFileSync(STATUS_PATH, 'utf-8').replace(/^\uFEFF/, '')) }; } catch {}
  }
  const logs = Array.isArray(current.logs)
    ? current.logs.map(item => ({ ...item, text: safeLog(item.text || '') }))
    : [];
  if (update.log) logs.push({ at: now(), text: safeLog(update.log) });
  const next = {
    ...current,
    ...update,
    logs: logs.slice(-80),
    updatedAt: now(),
    personKey: PERSON_KEY,
  };
  delete next.log;
  delete next.profileRoot;
  delete next.screenshotPath;
  delete next.resultsPath;
  delete next.browserRoot;
  writeJsonAtomic(STATUS_PATH, next);
  if (update.log) console.log(safeLog(update.log));
  return next;
}

async function screenshot(page, label = 'screenshot') {
  try {
    await page.screenshot({ path: SCREENSHOT_PATH, fullPage: false });
    status({ log: `Updated browser preview: ${label}`, currentUrl: page.url() });
  } catch (err) {
    status({ log: `Could not capture preview: ${err.message}` });
  }
}

function cancelled() {
  return existsSync(CANCEL_PATH);
}

async function launchContext(headless = false) {
  return chromium.launchPersistentContext(USER_DATA_DIR, {
    headless,
    viewport: { width: 1280, height: 900 },
    acceptDownloads: false,
    args: ['--disable-blink-features=AutomationControlled'],
  });
}

function isProfileAlreadyOpenError(err) {
  return /existing browser session|profile is already in use|singleton/i.test(String(err?.message || err || ''));
}

function profileAlreadyOpenMessage() {
  return 'LinkedIn browser profile is already open. Use the existing LinkedIn window, then close it before running Search LinkedIn. If that window is blank or stuck, click Cancel in Suitor to release the profile-local browser session.';
}

export async function waitForManualLoginClose(page, initialDiagnostics, options = {}) {
  let latestDiagnostics = initialDiagnostics;
  const intervalMs = Number(options.intervalMs || 4000);
  const emitStatus = options.emitStatus || status;
  const captureScreenshot = options.captureScreenshot !== false;
  const closePromise = page.waitForEvent('close', { timeout: 0 })
    .then(() => 'closed')
    .catch(() => 'closed');
  while (true) {
    const result = await Promise.race([
      closePromise,
      page.waitForTimeout(intervalMs).then(() => 'tick'),
    ]);
    if (result === 'closed') return latestDiagnostics;
    try {
      const diagnostics = await linkedInSessionDiagnostics(page);
      if (diagnostics.sessionState !== 'unknown' || latestDiagnostics.sessionState === 'unknown') {
        latestDiagnostics = diagnostics;
      }
      emitStatus({
        state: diagnostics.sessionState === 'logged_in' ? 'logged_in' : diagnostics.state,
        sessionState: diagnostics.sessionState,
        sessionLabel: diagnostics.label,
        sessionReason: diagnostics.reason,
        currentUrl: page.url(),
        log: `LinkedIn login window check: ${diagnostics.label}. ${diagnostics.reason}`,
      });
      if (captureScreenshot && (diagnostics.sessionState === 'logged_in' || diagnostics.sessionState === 'blocked')) {
        await screenshot(page, `LinkedIn ${diagnostics.label.toLowerCase()}`);
      }
    } catch (err) {
      emitStatus({ state: 'unknown', currentUrl: page.url(), log: `LinkedIn login window check could not complete: ${err.message}` });
    }
  }
}

async function openLogin() {
  status({ state: 'launching', log: `Opening LinkedIn browser session for ${CANDIDATE_FIRST}. Log in manually, then close the browser window when done.` });
  const context = await launchContext(false);
  const page = context.pages()[0] || await context.newPage();
  await page.goto('https://www.linkedin.com/jobs/', { waitUntil: 'domcontentloaded', timeout: 45000 });
  const diagnostics = await linkedInSessionDiagnostics(page);
  status({
    state: diagnostics.sessionState === 'logged_in' ? 'logged_in' : diagnostics.state,
    sessionState: diagnostics.sessionState,
    sessionLabel: diagnostics.label,
    sessionReason: diagnostics.reason,
    currentUrl: page.url(),
    log: diagnostics.searchAllowed
      ? 'LinkedIn browser window is open and the saved session appears logged in.'
      : 'LinkedIn browser window is open. Suitor does not store credentials; use the browser window to log in.',
  });
  await screenshot(page, 'LinkedIn login/session page');
  const latestDiagnostics = await waitForManualLoginClose(page, diagnostics);
  await context.close().catch(() => {});
  status({
    state: latestDiagnostics.sessionState === 'logged_in' ? 'logged_in' : 'idle',
    sessionState: latestDiagnostics.sessionState,
    sessionLabel: latestDiagnostics.label,
    sessionReason: latestDiagnostics.reason,
    log: 'LinkedIn browser session closed. Cookies remain in the profile-local browser directory if login completed.',
  });
}

async function diagnoseLinkedInSession() {
  status({ state: 'diagnosing', log: 'Checking LinkedIn browser session without collecting jobs.' });
  const context = await launchContext(false);
  const page = context.pages()[0] || await context.newPage();
  try {
    await page.goto('https://www.linkedin.com/jobs/', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await screenshot(page, 'LinkedIn session diagnostic');
    const diagnostics = await linkedInSessionDiagnostics(page);
    status({
      state: diagnostics.sessionState === 'logged_in' ? 'logged_in' : diagnostics.state,
      sessionState: diagnostics.sessionState,
      sessionLabel: diagnostics.label,
      sessionReason: diagnostics.reason,
      currentUrl: page.url(),
      log: `LinkedIn session diagnostic: ${diagnostics.label}. ${diagnostics.reason}`,
    });
    return diagnostics;
  } finally {
    await context.close().catch(() => {});
  }
}

function parseArgs() {
  const args = new Map();
  for (let i = 2; i < process.argv.length; i += 1) {
    const item = process.argv[i];
    if (item.startsWith('--')) {
      const key = item.slice(2);
      const value = process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[++i] : 'true';
      args.set(key, value);
    } else if (!args.has('command')) {
      args.set('command', item);
    }
  }
  return args;
}

export function linkedInSearchUrl(query) {
  const params = new URLSearchParams();
  params.set('keywords', query || DEFAULT_QUERY);
  params.set('location', DEFAULT_LOCATION);
  if (DEFAULT_WORKPLACE) params.set('f_WT', DEFAULT_WORKPLACE);
  if (DEFAULT_RECENCY) params.set('f_TPR', DEFAULT_RECENCY);
  if (DEFAULT_EXPERIENCE) params.set('f_E', DEFAULT_EXPERIENCE);
  if (DEFAULT_SALARY_BUCKET) params.set('f_SB2', DEFAULT_SALARY_BUCKET);
  return `https://www.linkedin.com/jobs/search/?${params.toString()}`;
}

export function linkedInFilterSummary() {
  const workplace = DEFAULT_WORKPLACE === '2' ? 'Remote' : DEFAULT_WORKPLACE ? `Workplace ${DEFAULT_WORKPLACE}` : 'Any workplace';
  const recency = DEFAULT_RECENCY === 'r604800' ? 'Past week' : DEFAULT_RECENCY === 'r86400' ? 'Past 24 hours' : DEFAULT_RECENCY || 'Any recency';
  const experience = DEFAULT_EXPERIENCE ? 'Mid-Senior, Director, Executive' : 'Any level';
  const salary = DEFAULT_SALARY_BUCKET ? 'LinkedIn salary bucket 5' : 'No salary bucket';
  return `${workplace}; ${DEFAULT_LOCATION}; ${recency}; ${experience}; ${salary}; Easy Apply excluded after result extraction.`;
}

export function classifyLinkedInSessionSnapshot(snapshot = {}) {
  const url = String(snapshot.url || '').toLowerCase();
  const text = String(snapshot.text || '').toLowerCase();
  const haystack = `${url} ${text}`;
  const hasLoginInput = Boolean(snapshot.hasLoginInput);
  const hasChallenge = Boolean(snapshot.hasChallenge)
    || /\b(checkpoint|captcha|security verification|unusual activity|verify you|verify your identity|quick security check)\b/i.test(haystack);
  if (hasChallenge) {
    return {
      sessionState: 'blocked',
      state: 'blocked',
      label: 'Blocked or checkpointed',
      searchAllowed: false,
      reason: 'LinkedIn is showing a security checkpoint, captcha, or unusual-activity page.',
    };
  }
  if (hasLoginInput || /\/login|uas\/login|session_redirect|login-submit/.test(url)) {
    return {
      sessionState: 'needs_login',
      state: 'needs_login',
      label: 'Needs login',
      searchAllowed: false,
      reason: 'LinkedIn is asking for a manual login in the profile-local browser session.',
    };
  }
  const hasLoggedInNav = Boolean(snapshot.hasLoggedInNav)
    || /\b(messaging|notifications|my network|me profile|start a post)\b/i.test(text);
  const hasJobsSurface = Boolean(snapshot.hasJobsSurface)
    || /\/jobs/.test(url)
    || /\b(top jobs for you|job collections|jobs you may be interested in|currentjobid|jobs-search)\b/i.test(text);
  if (hasLoggedInNav || hasJobsSurface) {
    return {
      sessionState: 'logged_in',
      state: 'ready',
      label: 'Logged in',
      searchAllowed: true,
      reason: hasLoggedInNav ? 'LinkedIn navigation markers are visible.' : 'LinkedIn jobs surface is visible without a login prompt.',
    };
  }
  return {
    sessionState: 'unknown',
    state: 'unknown',
    label: 'Unknown',
    searchAllowed: false,
    reason: 'Suitor could not confirm whether LinkedIn is logged in.',
  };
}

async function linkedInSessionDiagnostics(page) {
  const snapshot = await page.evaluate(() => {
    const text = String(document.body?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 6000);
    return {
      url: location.href,
      text,
      hasLoginInput: Boolean(document.querySelector('input[name="session_key"], input[name="session_password"], input#username, input#password')),
      hasChallenge: Boolean(document.querySelector('[id*="captcha" i], [class*="captcha" i], form[action*="checkpoint"], input[name="pin"]')),
      hasLoggedInNav: Boolean(document.querySelector('a[href*="/feed/"], a[href*="/mynetwork/"], a[href*="/messaging/"], a[href*="/notifications/"], button[aria-label*="Me" i]')),
      hasJobsSurface: Boolean(document.querySelector('a[href*="/jobs/view/"], .jobs-search-results-list, .jobs-search__job-details--wrapper, .jobs-home-scalable-nav, .jobs-details')),
    };
  }).catch(() => ({
    url: page.url(),
    text: '',
    hasLoginInput: false,
    hasChallenge: false,
    hasLoggedInNav: false,
    hasJobsSurface: false,
  }));
  return classifyLinkedInSessionSnapshot({ ...snapshot, url: snapshot.url || page.url() });
}

export function isBlockedSourceResult(result = {}) {
  const haystack = [
    result.company,
    result.title,
    result.location,
    result.source,
    result.snippet,
    result.jdText,
    result.url,
  ].filter(Boolean).join(' ');
  return BLOCKED_SOURCE_COMPANY_RE.test(haystack);
}

export function linkedInJobKey(value = {}) {
  const rawUrl = typeof value === 'string' ? value : value.url;
  const url = String(rawUrl || '').trim();
  try {
    const parsed = new URL(url);
    const currentJobId = parsed.searchParams.get('currentJobId');
    if (currentJobId) return `linkedin:${currentJobId}`;
    const match = parsed.pathname.match(/\/jobs\/view\/(\d+)/i);
    if (match) return `linkedin:${match[1]}`;
    return `${parsed.origin}${parsed.pathname}`.toLowerCase();
  } catch {
    return url.split('?')[0].toLowerCase();
  }
}

async function collectLinkedInJobSeeds(page, limit, excludedKeys = []) {
  return page.evaluate(({ max, excluded }) => {
    const normalize = value => String(value || '').replace(/\s+/g, ' ').trim();
    const jobKey = rawUrl => {
      const url = String(rawUrl || '').trim();
      try {
        const parsed = new URL(url);
        const currentJobId = parsed.searchParams.get('currentJobId');
        if (currentJobId) return `linkedin:${currentJobId}`;
        const match = parsed.pathname.match(/\/jobs\/view\/(\d+)/i);
        if (match) return `linkedin:${match[1]}`;
        return `${parsed.origin}${parsed.pathname}`.toLowerCase();
      } catch {
        return url.split('?')[0].toLowerCase();
      }
    };
    const excludedSet = new Set(excluded || []);
    const anchors = Array.from(document.querySelectorAll('a[href*="/jobs/view/"], a[href*="currentJobId="]'));
    const rows = [];
    const seen = new Set();
    for (const anchor of anchors) {
      const href = anchor.href ? anchor.href.split('?')[0] : '';
      const key = jobKey(anchor.href || href);
      const title = normalize(anchor.innerText || anchor.getAttribute('aria-label') || '');
      if (!href || !title || title.length < 4) continue;
      if (seen.has(key) || excludedSet.has(key)) continue;
      seen.add(key);
      const card = anchor.closest('[data-job-id], li, div');
      const text = normalize(card?.innerText || '');
      const lines = text.split(/\s{2,}|\n/).map(normalize).filter(Boolean);
      const company = lines.find(line => line !== title && line.length > 1 && line.length < 80) || '';
      const location = lines.find(line => /remote|hybrid|united states|atlanta|new york|san francisco|boston|austin|charlotte|nashville/i.test(line)) || '';
      rows.push({ key, title, company, location, url: href, source: 'linkedin-browser', snippet: text.slice(0, 700) });
      if (rows.length >= max) break;
    }
    return { rows, visibleCount: anchors.length };
  }, { max: limit, excluded: excludedKeys });
}

async function scrollLinkedInResultsPane(page) {
  return page.evaluate(() => {
    const candidates = [
      '.jobs-search-results-list',
      '.scaffold-layout__list',
      '.scaffold-layout__list-container',
      '[aria-label*="Search results" i]',
      '[data-results-list-top-scroll-sentinel]',
    ];
    const containers = candidates
      .map(selector => document.querySelector(selector))
      .filter(Boolean);
    const scrollables = Array.from(document.querySelectorAll('main, section, div, ul'))
      .filter(node => node && node.scrollHeight > node.clientHeight + 200);
    const all = [...containers, ...scrollables];
    let target = all.find(node => {
      const text = String(node.innerText || '');
      return node.scrollHeight > node.clientHeight + 200 && /apply|promoted|viewed|remote|hybrid/i.test(text);
    }) || all.find(node => node.scrollHeight > node.clientHeight + 200);
    if (!target) {
      const before = window.scrollY;
      window.scrollBy(0, Math.max(700, Math.floor(window.innerHeight * 0.8)));
      return {
        mode: 'window',
        before,
        after: window.scrollY,
        max: Math.max(0, document.documentElement.scrollHeight - window.innerHeight),
        moved: window.scrollY !== before,
      };
    }
    const before = target.scrollTop;
    const delta = Math.max(650, Math.floor(target.clientHeight * 0.85));
    target.scrollBy(0, delta);
    return {
      mode: target.className || target.getAttribute('aria-label') || target.tagName || 'results-pane',
      before,
      after: target.scrollTop,
      max: Math.max(0, target.scrollHeight - target.clientHeight),
      moved: target.scrollTop !== before,
    };
  }).catch(() => ({ mode: 'unknown', before: 0, after: 0, max: 0, moved: false }));
}

async function enrichLinkedInJob(page, seed) {
  try {
    await page.evaluate(url => {
      const clean = String(url || '').split('?')[0];
      const link = Array.from(document.querySelectorAll('a[href*="/jobs/view/"], a[href*="currentJobId="]'))
        .find(anchor => String(anchor.href || '').split('?')[0] === clean);
      const target = link?.closest('[data-job-id], li, div') || link;
      (target || link)?.scrollIntoView?.({ block: 'center', inline: 'nearest' });
      link?.click?.();
      if (!link) target?.click?.();
    }, seed.url);
    await page.waitForTimeout(1400);
    await screenshot(page, `LinkedIn detail: ${seed.title}`);
  } catch {}

  const detail = await page.evaluate(seedData => {
    const normalize = value => String(value || '').replace(/\s+/g, ' ').trim();
    const detailRoot = document.querySelector('.jobs-search__job-details--wrapper, .jobs-details, .jobs-details__main-content, main') || document.body;
    const actionNodes = Array.from(detailRoot.querySelectorAll('button, a'));
    const buttonTexts = actionNodes.map(node => normalize(node.innerText || node.getAttribute('aria-label') || '')).filter(Boolean);
    const easyApply = buttonTexts.some(text => /^easy apply\b/i.test(text));
    const applyButton = buttonTexts.find(text => /^apply\b/i.test(text) || /apply on company website/i.test(text)) || '';
    const applyHref = !easyApply
      ? (actionNodes.find(node => {
          const text = normalize(node.innerText || node.getAttribute('aria-label') || '');
          return /^apply\b/i.test(text) || /apply on company website/i.test(text);
        })?.href || '')
      : '';
    const detailText = normalize(detailRoot?.innerText || '');
    const descriptionRoot = document.querySelector('.jobs-description, .jobs-box__html-content, .jobs-description-content__text, #job-details');
    const description = normalize(descriptionRoot?.innerText || '');
    const title = normalize(document.querySelector('.jobs-unified-top-card__job-title, h1')?.innerText) || seedData.title;
    const company = normalize(document.querySelector('.jobs-unified-top-card__company-name, .job-details-jobs-unified-top-card__company-name')?.innerText) || seedData.company;
    const location = normalize(document.querySelector('.jobs-unified-top-card__bullet, .job-details-jobs-unified-top-card__primary-description-container span')?.innerText) || seedData.location;
    const jdText = [
      title ? `Title: ${title}` : '',
      company ? `Company: ${company}` : '',
      location ? `Location: ${location}` : '',
      applyButton ? `Apply button: ${applyButton}` : '',
      description || detailText,
    ].filter(Boolean).join('\n\n').slice(0, 15000);
    return {
      ...seedData,
      title,
      company,
      location,
      applyType: easyApply ? 'Easy Apply' : (applyButton || 'Apply type not detected'),
      applyHref,
      jdText,
      snippet: jdText || seedData.snippet,
      needsDetails: jdText.length < 900,
    };
  }, seed);

  if (!/easy apply/i.test(detail.applyType || '') && detail.applyHref && String(detail.jdText || '').length < 1200) {
    let externalPage;
    try {
      status({ state: 'extracting', currentUrl: page.url(), log: `Opening non-Easy-Apply link for more JD detail: ${detail.title}` });
      externalPage = await page.context().newPage();
      await externalPage.goto(detail.applyHref, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await externalPage.waitForTimeout(1600);
      const externalText = await externalPage.evaluate(() => String(document.body?.innerText || '').replace(/\s+/g, ' ').trim()).catch(() => '');
      if (externalText.length > 500) {
        detail.jdText = `${detail.jdText}\n\nExternal apply page detail:\n${externalText.slice(0, 9000)}`;
        detail.snippet = detail.jdText;
        detail.needsDetails = detail.jdText.length < 900;
        status({ state: 'extracting', currentUrl: page.url(), log: `Captured ${externalText.length} chars from non-Easy-Apply destination for ${detail.title}.` });
      }
    } catch (err) {
      status({ state: 'extracting', currentUrl: page.url(), log: `Could not extract non-Easy-Apply destination for ${detail.title}: ${err.message}` });
    } finally {
      await externalPage?.close().catch(() => {});
    }
  }

  return detail;
}

export async function extractLinkedInJobs(page, limit, options = {}) {
  const seenKeys = options.seenKeys instanceof Set ? options.seenKeys : new Set();
  const seedLimit = Math.max(
    Number(options.seedLimit || 0) || 0,
    Math.max(limit * 2, limit + 6),
  );
  const collected = await collectLinkedInJobSeeds(page, seedLimit, Array.from(seenKeys));
  const seeds = Array.isArray(collected) ? collected : collected.rows;
  const stats = {
    visibleCount: Array.isArray(collected) ? seeds.length : collected.visibleCount,
    newSeedCount: seeds.length,
    opened: 0,
    captured: 0,
    skippedBlocked: 0,
    skippedEasyApply: 0,
  };
  const enriched = [];
  for (const seed of seeds) {
    if (cancelled()) break;
    const key = seed.key || linkedInJobKey(seed);
    if (key) seenKeys.add(key);
    if (isBlockedSourceResult(seed)) {
      stats.skippedBlocked += 1;
      status({ state: 'extracting', currentUrl: page.url(), log: `Skipped blocked job-source result: ${seed.title}` });
      continue;
    }
    stats.opened += 1;
    status({ state: 'extracting', currentUrl: page.url(), log: `Opening LinkedIn result for detail extraction: ${seed.title}` });
    const detail = await enrichLinkedInJob(page, seed);
    detail.key = detail.key || key;
    if (isBlockedSourceResult(detail)) {
      stats.skippedBlocked += 1;
      status({ state: 'extracting', currentUrl: page.url(), log: `Skipped blocked job-source result: ${detail.title}` });
      continue;
    }
    if (/easy apply/i.test(detail.applyType || '')) {
      stats.skippedEasyApply += 1;
      status({ state: 'extracting', currentUrl: page.url(), log: `Skipped Easy Apply result: ${detail.title}` });
      continue;
    }
    enriched.push(detail);
    stats.captured += 1;
    status({ state: 'extracting', currentUrl: page.url(), log: `Captured LinkedIn detail for ${detail.title} (${detail.jdText?.length || 0} chars).` });
    if (enriched.length >= limit) break;
  }
  if (options.includeStats) return { items: enriched, stats };
  return enriched;
}

async function searchLinkedIn(query, limit = 10) {
  try { if (existsSync(CANCEL_PATH)) rmSync(CANCEL_PATH, { force: true }); } catch {}
  status({ state: 'launching', log: `Starting LinkedIn browser search for: ${query || DEFAULT_QUERY}` });
  status({ state: 'launching', log: `Applying LinkedIn filters: ${linkedInFilterSummary()}` });
  const context = await launchContext(false);
  const page = context.pages()[0] || await context.newPage();
  const results = [];
  try {
    await page.goto(linkedInSearchUrl(query), { waitUntil: 'domcontentloaded', timeout: 60000 });
    status({ state: 'searching', currentUrl: page.url(), log: 'LinkedIn search page loaded.' });
    await screenshot(page, 'search loaded');
    const diagnostics = await linkedInSessionDiagnostics(page);
    status({
      state: diagnostics.searchAllowed ? 'searching' : diagnostics.state,
      sessionState: diagnostics.sessionState,
      sessionLabel: diagnostics.label,
      sessionReason: diagnostics.reason,
      currentUrl: page.url(),
      log: `LinkedIn session check: ${diagnostics.label}. ${diagnostics.reason}`,
    });
    if (!diagnostics.searchAllowed) {
      const nextStep = diagnostics.sessionState === 'needs_login'
        ? 'Click Open LinkedIn Session, log in manually, close the browser, then run search again.'
        : 'Open LinkedIn manually in the profile-local browser session and resolve the page before searching again.';
      status({ state: diagnostics.state, currentUrl: page.url(), log: `${diagnostics.reason} ${nextStep}` });
      return [];
    }
    const seenKeys = new Set();
    const inspectTarget = Math.max(limit, Math.min(Number(envValue('SUITOR_LINKEDIN_INSPECT_LIMIT', 'SUITOR_LINKEDIN_INSPECT_LIMIT', Math.max(25, limit * 5))) || Math.max(25, limit * 5), 50));
    let stagnantPasses = 0;
    for (let step = 0; step < LINKEDIN_MAX_PASSES; step += 1) {
      if (cancelled()) {
        status({ state: 'cancelled', currentUrl: page.url(), log: 'LinkedIn browser search was cancelled.' });
        return results;
      }
      await page.waitForTimeout(1800 + step * 400);
      await screenshot(page, `search pass ${step + 1}`);
      const remainingEligibleSlots = Math.max(1, limit - results.length);
      const { items: batch, stats } = await extractLinkedInJobs(page, remainingEligibleSlots, {
        seenKeys,
        includeStats: true,
        seedLimit: Math.min(10, Math.max(remainingEligibleSlots * 2, 6)),
      });
      for (const item of batch) {
        const key = item.key || linkedInJobKey(item);
        if (!results.some(existing => (existing.key || linkedInJobKey(existing)) === key)) results.push(item);
      }
      const scroll = await scrollLinkedInResultsPane(page);
      const noNew = !stats.newSeedCount;
      stagnantPasses = noNew ? stagnantPasses + 1 : 0;
      status({
        state: 'searching',
        currentUrl: page.url(),
        log: `LinkedIn pass ${step + 1}: ${stats.visibleCount} visible, ${stats.newSeedCount} new, ${stats.opened} opened, ${stats.captured} captured, ${stats.skippedEasyApply} Easy Apply skipped, ${stats.skippedBlocked} blocked-source skipped. ${seenKeys.size}/${inspectTarget} unique inspected; ${results.length}/${limit} candidate details captured. Scroll ${scroll.moved ? 'advanced' : 'did not advance'}.`,
      });
      if (results.length >= limit) break;
      if (seenKeys.size >= inspectTarget) {
        status({ state: 'searching', currentUrl: page.url(), log: `LinkedIn inspection target reached: ${seenKeys.size} unique result${seenKeys.size === 1 ? '' : 's'} inspected.` });
        break;
      }
      if (stagnantPasses >= LINKEDIN_STAGNANT_PASS_LIMIT) {
        status({ state: 'searching', currentUrl: page.url(), log: `LinkedIn search stopped after ${stagnantPasses} pass${stagnantPasses === 1 ? '' : 'es'} with no new result cards. This usually means the result pane is exhausted or LinkedIn did not advance.` });
        break;
      }
    }
    const floors = configuredCompFloors();
    const sourceFiltered = results.filter(result => !isBlockedSourceResult(result));
    const skippedBelowComp = sourceFiltered.filter(result => isKnownBelowCompFloor(result, floors));
    const eligibleResults = sourceFiltered.filter(result => !isKnownBelowCompFloor(result, floors));
    const payload = {
      generatedAt: now(),
      query: query || DEFAULT_QUERY,
      filters: linkedInFilterSummary(),
      compFloor: floors.defaultFloor,
      californiaCompFloor: floors.californiaFloor,
      inspectedUniqueCount: seenKeys.size,
      inspectionTarget: inspectTarget,
      skippedBelowComp: skippedBelowComp.map(result => ({
        title: result.title || '',
        company: result.company || '',
        location: result.location || '',
        url: result.url || '',
        compensation: compensationRangeFromText([result.compensation, result.salary, result.snippet, result.jdText].filter(Boolean).join('\n'))?.text || '',
      })),
      results: eligibleResults.slice(0, limit),
    };
    writeJsonAtomic(RESULTS_PATH, payload);
    status({
      state: 'done',
      currentUrl: page.url(),
      resultCount: payload.results.length,
      log: `LinkedIn browser search saved ${payload.results.length} candidate results.${skippedBelowComp.length ? ` Skipped ${skippedBelowComp.length} result${skippedBelowComp.length === 1 ? '' : 's'} with explicit below-floor compensation.` : ''}`,
    });
    return payload.results;
  } finally {
    await context.close().catch(() => {});
  }
}

async function main() {
  const args = parseArgs();
  const command = args.get('command') || args.get('cmd') || 'status';
  if (command === 'status') {
    console.log(JSON.stringify(status(), null, 2));
    return;
  }
  if (command === 'cancel') {
    writeTextAtomic(CANCEL_PATH, now());
    status({ state: 'cancelled', log: 'Cancel requested.' });
    return;
  }
  if (command === 'open-login') {
    await openLogin();
    return;
  }
  if (command === 'diagnose-linkedin') {
    await diagnoseLinkedInSession();
    return;
  }
  if (command === 'linkedin-search') {
    const query = args.get('query') || DEFAULT_QUERY;
    const limit = Number(args.get('limit') || envValue('SUITOR_LINKEDIN_LIMIT', 'SUITOR_LINKEDIN_LIMIT', 10));
    await searchLinkedIn(query, limit);
    return;
  }
  throw new Error(`Unknown browser command: ${command}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(err => {
    if (isProfileAlreadyOpenError(err)) {
      const message = profileAlreadyOpenMessage();
      status({ state: 'needs_close', log: message });
      console.error(message);
      process.exit(0);
    }
    status({ state: 'error', log: err.message });
    console.error(err.message);
    process.exit(1);
  });
}
