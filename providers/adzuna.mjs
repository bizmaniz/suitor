// @ts-check
/** @typedef {import('./_types.js').Provider} Provider */

import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

function envValue(name) {
  if (process.env[name]) return process.env[name];
  const envPath = resolve(process.cwd(), '.env');
  if (!existsSync(envPath)) return '';
  const text = readFileSync(envPath, 'utf-8');
  const match = text.match(new RegExp(`^\\s*${name}\\s*=\\s*(.+?)\\s*$`, 'm'));
  return match ? match[1].replace(/^["']|["']$/g, '') : '';
}

function hasKeys() {
  return Boolean(envValue('ADZUNA_APP_ID') && envValue('ADZUNA_APP_KEY'));
}

function apiUrl(entry, page = 1) {
  const params = new URLSearchParams({
    app_id: envValue('ADZUNA_APP_ID'),
    app_key: envValue('ADZUNA_APP_KEY'),
    results_per_page: String(entry.adzuna_results_per_page || 50),
    what: String(entry.adzuna_what || 'Director Operations OR Chief of Staff OR Director Integration'),
    where: String(entry.adzuna_where || 'Atlanta OR Remote'),
    'content-type': 'application/json',
  });
  const country = String(entry.adzuna_country || 'us').toLowerCase();
  return `https://api.adzuna.com/v1/api/jobs/${country}/search/${page}?${params}`;
}

/** @type {Provider} */
export default {
  id: 'adzuna',

  detect(entry) {
    return entry.scan_method === 'adzuna' ? { url: 'https://api.adzuna.com/' } : null;
  },

  async fetch(entry, ctx) {
    if (!hasKeys()) {
      console.error('Adzuna disabled (no API key)');
      return [];
    }
    const jobs = [];
    const maxPages = Number(entry.adzuna_max_pages || 1);
    for (let page = 1; page <= maxPages; page++) {
      const json = await ctx.fetchJson(apiUrl(entry, page));
      const results = Array.isArray(json?.results) ? json.results : [];
      jobs.push(...results);
      if (!results.length) break;
    }
    return jobs.map(job => ({
      title: job.title || '',
      url: job.redirect_url || '',
      company: job.company?.display_name || entry.name,
      location: job.location?.display_name || '',
    })).filter(job => job.title && job.url);
  },
};
