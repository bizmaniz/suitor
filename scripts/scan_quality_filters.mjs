export function isSearchResultNoise(job = {}) {
  const title = String(job.title || '').toLowerCase();
  const url = String(job.url || '').toLowerCase();
  if (/linkedin\.com\/jobs\/search|indeed\.com\/q-|glassdoor\.com\/salaries|glassdoor\.com\/career|ziprecruiter\.com\/jobs-search|simplyhired\.com\/search/.test(url)) return true;
  if (/\b\d{2,}[,+]?\s+(director|chief|partnership|alliances|operations|revops).+\bjobs\b/.test(title)) return true;
  if (/\b(jobs in|jobs, employment|job search|salaries|salary|ultimate guide|what is a|hiring now)\b/.test(title)) return true;
  return false;
}

export function isQuickReject(job = {}, configuredPhrases = []) {
  const haystack = [job.title, job.company, job.location, job.url, job.source]
    .map(value => String(value || '').toLowerCase())
    .join('\n');
  return configuredPhrases
    .map(value => String(value || '').trim().toLowerCase())
    .filter(value => value.length >= 3)
    .some(value => haystack.includes(value));
}

export function localEvaluationDecision({ hardMatches = [], manualMatches = [], total = 0, floor = 75 } = {}) {
  if (hardMatches.length) return 'passed';
  if (manualMatches.length) return 'manual_review';
  return Number(total) < Number(floor) ? 'passed' : 'shortlisted';
}

export function readProfileHardRejectPhrases(profileRoot = '', candidateFirst = 'Candidate') {
  if (!profileRoot) return [];
  const candidates = [
    resolve(profileRoot, 'Candidate Search Profile.json'),
    resolve(profileRoot, `Candidate Search Profile - ${candidateFirst}.json`),
  ];
  for (const filePath of candidates) {
    if (!existsSync(filePath)) continue;
    try {
      const profile = JSON.parse(readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
      const filters = profile?.scoring?.hardFilters || profile?.dealbreakers || {};
      return [
        ...(Array.isArray(filters.excludeKeywords) ? filters.excludeKeywords : []),
        ...(Array.isArray(filters.automaticRejections) ? filters.automaticRejections : []),
      ].map(value => String(value || '').trim()).filter(Boolean);
    } catch {
      return [];
    }
  }
  return [];
}
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
