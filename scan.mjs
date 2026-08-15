#!/usr/bin/env node

/**
 * scan.mjs — Zero-token portal scanner with a plugin-based provider layer.
 *
 * Providers live in providers/*.mjs and are loaded at startup. Each provider
 * exports a default object with:
 *   - id: string — matched against `provider:` in portals.yml
 *   - detect(entry): {url}|null — optional auto-detection from careers_url
 *   - fetch(entry, ctx): [{title,url,company,location}] — required
 *
 * Files prefixed with _ are shared helpers (e.g. _http.mjs) and are never
 * loaded as providers. Adding a new source = drop a *.mjs into providers/,
 * no scan.mjs edits.
 *
 * A tracked_companies entry can set `provider:` explicitly to bypass
 * URL-based auto-detection. The `transport:` field is reserved for future
 * transports — Phase A only ships the http transport.
 *
 * Zero Claude API tokens — pure HTTP + JSON.
 *
 * Usage:
 *   node scan.mjs                  # scan all enabled companies
 *   node scan.mjs --dry-run        # preview without writing files
 *   node scan.mjs --company Cohere # scan a single company
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, renameSync } from 'fs';
import { pathToFileURL, fileURLToPath } from 'url';
import path from 'path';
import yaml from 'js-yaml';

import { makeHttpCtx } from './providers/_http.mjs';
import { isQuickReject, isSearchResultNoise, readProfileHardRejectPhrases } from './scripts/scan_quality_filters.mjs';
import { openJobDb, scoredUrlKeys } from './web/job_db.mjs';

const parseYaml = yaml.load;

// ── Config ──────────────────────────────────────────────────────────

function envValue(name, legacyName, fallback = '') {
  return process.env[name] || (legacyName ? process.env[legacyName] : '') || fallback;
}

const PROFILE_ROOT = envValue('SUITOR_PROFILE_ROOT', 'SUITOR_PROFILE_ROOT', '');
const PERSON_KEY = String(envValue('SUITOR_PERSON_KEY', 'SUITOR_PERSON_KEY', 'candidate')).toLowerCase();
const DATA_ROOT = envValue('SUITOR_RUNTIME_ROOT', 'SUITOR_RUNTIME_ROOT', PROFILE_ROOT
  ? path.resolve(PROFILE_ROOT, '.suitor-runtime')
  : 'data');
const PROFILE_PORTALS_PATH = PROFILE_ROOT
  ? path.resolve(PROFILE_ROOT, 'portals.yml')
  : '';
const PORTALS_PATH = envValue('SUITOR_PORTALS_PATH', 'SUITOR_PORTALS_PATH', PROFILE_PORTALS_PATH || 'portals.yml');
const SCAN_HISTORY_PATH = path.resolve(DATA_ROOT, 'scan-history.tsv');
const PIPELINE_PATH = path.resolve(DATA_ROOT, 'pipeline.md');
const APPLICATIONS_PATH = path.resolve(DATA_ROOT, 'applications.md');
const EXTERNAL_APPLICATIONS_PATH = envValue('SUITOR_APPLICATIONS_TRACKER', 'SUITOR_APPLICATIONS_TRACKER', '');
const CANDIDATE_FIRST = envValue('SUITOR_CANDIDATE_FIRST', 'SUITOR_CANDIDATE_FIRST', 'candidate');
const PROVIDERS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'providers');

// Ensure required directories exist (fresh setup)
mkdirSync(DATA_ROOT, { recursive: true });

const CONCURRENCY = 10;

function writeTextAtomic(filePath, text, options = {}) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, text, { encoding: 'utf-8', ...options });
  renameSync(tmp, filePath);
}

// ── Provider loading ────────────────────────────────────────────────

async function loadProviders(dir) {
  const providers = new Map();
  if (!existsSync(dir)) return providers;
  // Alphabetical order so detect() priority is deterministic across machines.
  const entries = readdirSync(dir)
    .filter(f => f.endsWith('.mjs') && !f.startsWith('_'))
    .sort();
  for (const file of entries) {
    const full = path.join(dir, file);
    let mod;
    try {
      mod = await import(pathToFileURL(full).href);
    } catch (err) {
      console.error(`⚠️  ${file}: failed to load — ${err.message}`);
      continue;
    }
    const p = mod.default;
    if (!p || typeof p.fetch !== 'function' || !p.id) {
      console.error(`⚠️  ${file}: skipping — default export must be { id, fetch }`);
      continue;
    }
    if (providers.has(p.id)) {
      console.error(`⚠️  ${file}: duplicate provider id "${p.id}" — keeping first`);
      continue;
    }
    providers.set(p.id, p);
  }
  return providers;
}

// Resolve which provider handles a tracked_companies entry.
// 1. Explicit `provider:` field wins (skips detect()).
// 2. Otherwise each provider's detect() runs in load order; first hit wins.
function resolveProvider(entry, providers) {
  if (entry.provider) {
    const p = providers.get(entry.provider);
    if (!p) return { error: `unknown provider: ${entry.provider}` };
    return { provider: p };
  }
  if (entry.scan_method) {
    const p = providers.get(entry.scan_method);
    if (!p) return { error: `unknown scan_method: ${entry.scan_method}` };
    return { provider: p };
  }
  for (const p of providers.values()) {
    let hit;
    try {
      hit = p.detect?.(entry);
    } catch (err) {
      console.error(`⚠️  ${p.id}: detect() threw for "${entry.name}" — ${err.message}`);
      continue;
    }
    if (hit) return { provider: p };
  }
  return null;
}

// ── Title filter ────────────────────────────────────────────────────

function buildTitleFilter(titleFilter) {
  const positive = (titleFilter?.positive || []).map(k => k.toLowerCase());
  const negative = (titleFilter?.negative || []).map(k => k.toLowerCase());

  return (title) => {
    const lower = title.toLowerCase();
    const hasPositive = positive.length === 0 || positive.some(k => lower.includes(k));
    const hasNegative = negative.some(k => lower.includes(k));
    return hasPositive && !hasNegative;
  };
}

// ── Location filter ─────────────────────────────────────────────────
// Optional. If `location_filter` is absent from portals.yml, all locations pass.
// Semantics:
//   - Empty location string → pass (don't penalize missing data)
//   - `block` matches → reject (takes precedence over allow)
//   - `allow` empty → pass (already cleared block)
//   - `allow` non-empty → must match at least one keyword
// All matches are case-insensitive substring.

function buildLocationFilter(locationFilter) {
  if (!locationFilter) return () => true;
  const allow = (locationFilter.allow || []).map(k => k.toLowerCase());
  const block = (locationFilter.block || []).map(k => k.toLowerCase());

  return (location) => {
    if (!location) return true;
    const lower = location.toLowerCase();
    if (block.length > 0 && block.some(k => lower.includes(k))) return false;
    if (allow.length === 0) return true;
    return allow.some(k => lower.includes(k));
  };
}

// ── Dedup ───────────────────────────────────────────────────────────

export function loadSeenUrlKeys(dbPath, historyPath) {
  const seen = new Set();
  const addHistory = () => {
    if (!existsSync(historyPath)) return;
    const lines = readFileSync(historyPath, 'utf-8').replace(/^\uFEFF/, '').split(/\r?\n/);
    for (const line of lines.slice(1)) {
      const url = line.split('\t')[0].trim();
      if (url) seen.add(url);
    }
  };
  try {
    const db = openJobDb(dbPath);
    let keys;
    try {
      keys = scoredUrlKeys(db);
    } finally {
      db.close();
    }
    for (const key of keys) seen.add(key);
  } catch {
    // Missing or unreadable DB still falls back to history below.
  }
  // Always keep scan-history.tsv URLs. Once the DB has its first scored
  // role, older history-only jobs must not reappear as new.
  addHistory();
  return seen;
}

function loadSeenUrls() {
  const seen = loadSeenUrlKeys(path.resolve(DATA_ROOT, 'suitor.sqlite'), SCAN_HISTORY_PATH);

  // pipeline.md — extract URLs from checkbox lines
  if (existsSync(PIPELINE_PATH)) {
    const text = readFileSync(PIPELINE_PATH, 'utf-8');
    for (const match of text.matchAll(/- \[[ x]\] (https?:\/\/\S+)/g)) {
      seen.add(match[1]);
    }
  }

  // applications.md — extract URLs from report links and any inline URLs
  if (existsSync(APPLICATIONS_PATH)) {
    const text = readFileSync(APPLICATIONS_PATH, 'utf-8');
    for (const match of text.matchAll(/https?:\/\/[^\s|)]+/g)) {
      seen.add(match[0]);
    }
  }

  if (existsSync(EXTERNAL_APPLICATIONS_PATH)) {
    const text = readFileSync(EXTERNAL_APPLICATIONS_PATH, 'utf-8');
    for (const match of text.matchAll(/https?:\/\/[^\s|)]+/g)) {
      seen.add(match[0]);
    }
  }

  return seen;
}

function normalizeKey(value) {
  return value
    .toLowerCase()
    .replace(/\bpe\b/g, 'private equity')
    .replace(/\brevops\b/g, 'revenue operations')
    .replace(/\bbd\b/g, 'business development')
    .replace(/\([^)]*\)/g, '')
    .replace(/[–—]/g, '-')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function loadSeenCompanyRoles() {
  const seen = new Set();
  for (const trackerPath of [APPLICATIONS_PATH, EXTERNAL_APPLICATIONS_PATH]) {
    if (!existsSync(trackerPath)) continue;
    const text = readFileSync(trackerPath, 'utf-8');
    let headers = null;
    for (const line of text.split(/\r?\n/)) {
      if (!line.startsWith('|') || line.includes('---')) continue;
      const cells = line.split('|').slice(1, -1).map(cell => cell.trim());
      if (!headers) {
        headers = cells.map(cell => normalizeKey(cell));
        continue;
      }
      const companyIndex = headers.indexOf('company');
      const roleIndex = headers.indexOf('role');
      if (companyIndex === -1 || roleIndex === -1) continue;
      const company = normalizeKey(cells[companyIndex] || '');
      const role = normalizeKey(cells[roleIndex] || '');
      if (company && role) seen.add(`${company}::${role}`);
    }

    // Parse the profile tracker headings: ### Company - Role
    for (const match of text.matchAll(/^###\s+(.+?)\s+[–—-]\s+(.+)$/gm)) {
      const company = normalizeKey(match[1]);
      const role = normalizeKey(match[2]);
      if (company && role) seen.add(`${company}::${role}`);
    }
  }
  return seen;
}

function excludedCompanyNames(config) {
  const values = [];
  const raw = config.company_exclusions || config.excluded_companies || [];
  const items = Array.isArray(raw) ? raw : Object.values(raw).flat();
  for (const item of items) {
    if (typeof item === 'string') values.push(item);
    else if (item?.name) values.push(item.name);
  }
  return values.map(normalizeKey).filter(Boolean);
}

function isCompanyExcluded(job, excludedCompanies) {
  if (!excludedCompanies.length) return false;
  const company = normalizeKey(job.company || '');
  if (!company) return false;
  return excludedCompanies.some(excluded => company === excluded || company.includes(excluded) || excluded.includes(company));
}

function excludedKeywords(config) {
  const raw = config.exclude_keywords || config.excluded_keywords || config.hard_filter_keywords || [];
  const items = Array.isArray(raw) ? raw : Object.values(raw).flat();
  return items.map(item => String(item || '').trim().toLowerCase()).filter(item => item.length >= 3);
}

function hasExcludedKeyword(job, keywords) {
  if (!keywords.length) return false;
  const haystack = [job.title, job.company, job.location, job.url, job.source]
    .map(value => String(value || '').toLowerCase())
    .join(' ');
  return keywords.some(keyword => haystack.includes(keyword));
}

function builtinEntries(config) {
  return (config.builtin_queries || [])
    .filter(query => query.enabled !== false)
    .map(query => ({
      name: query.name,
      scan_method: 'builtin',
      url: query.url,
      search: query.search,
      enabled: true,
      limit: query.limit || query.builtin_limit || 5,
    }));
}

function rssEntries(config) {
  return (config.rss_feeds || [])
    .filter(feed => feed.enabled !== false)
    .map(feed => ({
      name: feed.name,
      scan_method: 'rss',
      url: feed.url || feed.feed_url,
      enabled: true,
      limit: feed.limit || feed.rss_limit || 10,
    }));
}

function museEntries(config) {
  return (config.muse_queries || [])
    .filter(query => query.enabled !== false)
    .map(query => ({
      ...query,
      name: query.name,
      scan_method: 'muse',
      enabled: true,
      limit: query.limit || query.muse_limit || 6,
    }));
}

// ── Pipeline writer ─────────────────────────────────────────────────

function appendToPipeline(offers) {
  if (offers.length === 0) return;

  let text = existsSync(PIPELINE_PATH)
    ? readFileSync(PIPELINE_PATH, 'utf-8')
    : '# Pipeline\n\n## Pendientes\n\n## Procesadas\n';

  // Find "## Pendientes" section and append after it
  const marker = '## Pendientes';
  const idx = text.indexOf(marker);
  if (idx === -1) {
    // No Pendientes section — append at end before Procesadas
    const procIdx = text.indexOf('## Procesadas');
    const insertAt = procIdx === -1 ? text.length : procIdx;
    const block = `\n${marker}\n\n` + offers.map(o =>
      `- [ ] ${o.url} | ${o.company} | ${o.title}`
    ).join('\n') + '\n\n';
    text = text.slice(0, insertAt) + block + text.slice(insertAt);
  } else {
    // Find the end of existing Pendientes content (next ## or end)
    const afterMarker = idx + marker.length;
    const nextSection = text.indexOf('\n## ', afterMarker);
    const insertAt = nextSection === -1 ? text.length : nextSection;

    const block = '\n' + offers.map(o =>
      `- [ ] ${o.url} | ${o.company} | ${o.title}`
    ).join('\n') + '\n';
    text = text.slice(0, insertAt) + block + text.slice(insertAt);
  }

  writeTextAtomic(PIPELINE_PATH, text);
}

function appendToScanHistory(offers, date) {
  // Ensure file + header exist. Location appended as 7th column for non-breaking
  // backward compat — older scan-history.tsv files with 6 columns still parse fine
  // since loadSeenUrls only reads column 0.
  const existing = existsSync(SCAN_HISTORY_PATH)
    ? readFileSync(SCAN_HISTORY_PATH, 'utf-8').replace(/\s*$/, '\n')
    : 'url\tfirst_seen\tportal\ttitle\tcompany\tstatus\tlocation\n';

  const lines = offers.map(o =>
    `${o.url}\t${date}\t${o.source}\t${o.title}\t${o.company}\tadded\t${o.location || ''}`
  ).join('\n') + '\n';

  writeTextAtomic(SCAN_HISTORY_PATH, existing + lines);
}

// ── Parallel fetch with concurrency limit ───────────────────────────

async function parallelFetch(tasks, limit) {
  const results = [];
  let i = 0;

  async function next() {
    while (i < tasks.length) {
      const task = tasks[i++];
      results.push(await task());
    }
  }

  const workers = Array.from({ length: Math.min(limit, tasks.length) }, () => next());
  await Promise.all(workers);
  return results;
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const jsonOut = args.includes('--json');
  const noWebsearch = args.includes('--no-websearch') || envValue('SUITOR_SKIP_WEBSEARCH', 'SUITOR_SKIP_WEBSEARCH') === '1';
  const companyFlag = args.indexOf('--company');
  const filterCompany = companyFlag !== -1 ? args[companyFlag + 1]?.toLowerCase() : null;

  // 1. Load providers
  const providers = await loadProviders(PROVIDERS_DIR);
  if (providers.size === 0) {
    console.error('Error: no providers loaded from providers/');
    process.exit(1);
  }

  // 2. Read portals.yml
  if (!existsSync(PORTALS_PATH)) {
    console.error('Error: portals.yml not found. Run onboarding first.');
    process.exit(1);
  }

  const config = parseYaml(readFileSync(PORTALS_PATH, 'utf-8'));
  const trackedCompanies = (config.tracked_companies || [])
    .filter(company => !(noWebsearch && (
      company.scan_method === 'websearch'
      || company.provider === 'websearch'
      || company.scan_query
    )));
  const companies = [
    ...trackedCompanies,
    ...builtinEntries(config),
    ...rssEntries(config),
    ...museEntries(config),
    ...(config.search_queries || [])
      .filter(query => query.enabled !== false && !noWebsearch)
      .map(query => ({
        name: query.name,
        scan_method: 'websearch',
        scan_query: query.query,
        enabled: true,
      })),
  ];
  const titleFilter = buildTitleFilter(config.title_filter);
  const locationFilter = buildLocationFilter(config.location_filter);
  const excludedCompanies = excludedCompanyNames(config);
  const keywordExclusions = excludedKeywords(config);
  const profileRejectPhrases = readProfileHardRejectPhrases(PROFILE_ROOT, CANDIDATE_FIRST);

  // 3. Resolve a provider for each enabled company
  const targets = [];
  let skippedCount = 0;
  const resolveErrors = [];
  for (const company of companies) {
    if (company.enabled === false) continue;
    if (typeof company.name !== 'string' || !company.name) {
      console.error(`⚠️  Skipping entry — missing or non-string 'name' field: ${JSON.stringify(company)}`);
      continue;
    }
    if (filterCompany && !company.name.toLowerCase().includes(filterCompany)) continue;
    const resolved = resolveProvider(company, providers);
    if (!resolved) { skippedCount++; continue; }
    if (resolved.error) { resolveErrors.push({ company: company.name, error: resolved.error }); continue; }
    targets.push({ ...company, _provider: resolved.provider });
  }

  if (!jsonOut) {
    console.log(`Scanning ${targets.length} companies via providers (${skippedCount} skipped — no provider matched)`);
    if (dryRun) console.log('(dry run — no files will be written)\n');
  }

  // 4. Load dedup sets
  const seenUrls = loadSeenUrls();
  const seenCompanyRoles = loadSeenCompanyRoles();

  // 5. Fetch from each target
  const date = new Date().toISOString().slice(0, 10);
  let totalFound = 0;
  let totalFilteredTitle = 0;
  let totalFilteredLocation = 0;
  let totalExcludedCompany = 0;
  let totalDupes = 0;
  const newOffers = [];
  const errors = [...resolveErrors];
  const bySource = {};

  const tasks = targets.map(company => async () => {
    const provider = company._provider;
    const ctx = makeHttpCtx();
    try {
      const jobs = await provider.fetch(company, ctx);
      if (!Array.isArray(jobs)) {
        throw new Error(`${provider.id}: fetch() did not return an array`);
      }
      totalFound += jobs.length;
      bySource[provider.id] ||= { targets: 0, found: 0, added: 0, filtered: 0, dupes: 0, errors: 0 };
      bySource[provider.id].targets += 1;
      bySource[provider.id].found += jobs.length;

      for (const job of jobs) {
        if (!titleFilter(job.title)) {
          totalFilteredTitle++;
          bySource[provider.id].filtered++;
          continue;
        }
        if (!locationFilter(job.location)) {
          totalFilteredLocation++;
          bySource[provider.id].filtered++;
          continue;
        }
        if (isCompanyExcluded(job, excludedCompanies)) {
          totalExcludedCompany++;
          bySource[provider.id].filtered++;
          continue;
        }
        if (hasExcludedKeyword(job, keywordExclusions)) {
          totalFilteredTitle++;
          bySource[provider.id].filtered++;
          continue;
        }
        if (isSearchResultNoise(job) || isQuickReject(job, profileRejectPhrases)) {
          totalFilteredTitle++;
          bySource[provider.id].filtered++;
          continue;
        }
        if (seenUrls.has(job.url)) {
          totalDupes++;
          bySource[provider.id].dupes++;
          continue;
        }
        const key = `${normalizeKey(job.company)}::${normalizeKey(job.title)}`;
        if (seenCompanyRoles.has(key)) {
          totalDupes++;
          bySource[provider.id].dupes++;
          continue;
        }
        // Mark as seen to avoid intra-scan dupes
        seenUrls.add(job.url);
        seenCompanyRoles.add(key);
        // Source label keeps the `${provider.id}-api` suffix so existing
        // scan-history.tsv rows continue to match for dedup.
        newOffers.push({ ...job, source: `${provider.id}-api` });
        bySource[provider.id].added++;
      }
    } catch (err) {
      errors.push({ company: company.name, error: err.message });
      bySource[provider.id] ||= { targets: 0, found: 0, added: 0, filtered: 0, dupes: 0, errors: 0 };
      bySource[provider.id].targets += 1;
      bySource[provider.id].errors += 1;
    }
  });

  await parallelFetch(tasks, CONCURRENCY);

  // 6. Write results
  if (!dryRun && newOffers.length > 0) {
    appendToPipeline(newOffers);
    appendToScanHistory(newOffers, date);
  }

  if (jsonOut) {
    console.log(JSON.stringify({
      date,
      companiesScanned: targets.length,
      totalFound,
      totalFilteredTitle,
      totalFilteredLocation,
      totalExcludedCompany,
      totalDupes,
      bySource,
      newOffers,
      errors,
    }, null, 2));
    return;
  }

  // 7. Print summary
  console.log(`\n${'━'.repeat(45)}`);
  console.log(`Portal Scan — ${date}`);
  console.log(`${'━'.repeat(45)}`);
  console.log(`Companies scanned:     ${targets.length}`);
  console.log(`Total jobs found:      ${totalFound}`);
  console.log(`Filtered by title:     ${totalFilteredTitle} removed`);
  console.log(`Filtered by location:  ${totalFilteredLocation} removed`);
  if (totalExcludedCompany) console.log(`Company exclusions:    ${totalExcludedCompany} removed`);
  console.log(`Duplicates:            ${totalDupes} skipped`);
  console.log(`New offers added:      ${newOffers.length}`);

  if (Object.keys(bySource).length > 0) {
    console.log('\nSource summary:');
    for (const [source, summary] of Object.entries(bySource).sort()) {
      console.log(`  ${source}: ${summary.added} added / ${summary.found} found (${summary.filtered} filtered, ${summary.dupes} dupes, ${summary.errors} errors)`);
    }
  }

  if (errors.length > 0) {
    console.log(`\nErrors (${errors.length}):`);
    for (const e of errors) {
      console.log(`  ✗ ${e.company}: ${e.error}`);
    }
  }

  if (newOffers.length === 0) return;

  if (newOffers.length > 0) {
    console.log('\nNew offers:');
    for (const o of newOffers) {
      console.log(`  + ${o.company} | ${o.title} | ${o.location || 'N/A'}`);
    }
    if (dryRun) {
      console.log('\n(dry run — run without --dry-run to save results)');
      console.log(`\nUse "Run verified agent scan" to verify each URL and score the shortlist against ${CANDIDATE_FIRST}'s profile.`);
    } else {
      console.log(`\nResults saved to ${PIPELINE_PATH} and ${SCAN_HISTORY_PATH}`);
      console.log(`\nUse "Run verified agent scan" to verify each URL and score the shortlist against ${CANDIDATE_FIRST}'s profile.`);
    }
    return;
  }

}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(err => {
    console.error('Fatal:', err.message);
    process.exit(1);
  });
}
