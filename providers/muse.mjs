// @ts-check
/** @typedef {import('./_types.js').Provider} Provider */

import { htmlToPlainText } from './_html_text.mjs';

const stripTags = htmlToPlainText;

function apiUrl(entry, page = 1) {
  const params = new URLSearchParams();
  params.set('page', String(page));
  if (entry.category) params.append('category', String(entry.category));
  for (const category of entry.categories || []) params.append('category', String(category));
  if (entry.level) params.append('level', String(entry.level));
  for (const level of entry.levels || []) params.append('level', String(level));
  if (entry.location) params.append('location', String(entry.location));
  if (entry.company) params.append('company', String(entry.company));
  return `https://www.themuse.com/api/public/jobs?${params.toString()}`;
}

function locationsText(job) {
  return (job.locations || []).map(location => location.name).filter(Boolean).join('; ');
}

function jobUrl(job) {
  if (job.refs?.landing_page) return job.refs.landing_page;
  if (job.refs?.application) return job.refs.application;
  if (job.id) return `https://www.themuse.com/jobs/${job.company?.short_name || job.company?.name || 'company'}/${job.id}`;
  return '';
}

/** @type {Provider} */
export default {
  id: 'muse',

  detect(entry) {
    return entry.scan_method === 'muse' || entry.provider === 'muse' ? { url: apiUrl(entry) } : null;
  },

  async fetch(entry, ctx) {
    const maxPages = Number(entry.muse_max_pages || 1);
    const limit = Number(entry.limit || entry.muse_limit || 10);
    const jobs = [];
    for (let page = 1; page <= maxPages; page += 1) {
      const json = await ctx.fetchJson(apiUrl(entry, page), {
        headers: { accept: 'application/json', 'user-agent': 'Suitor/1.0' },
        timeoutMs: 25_000,
      });
      const results = Array.isArray(json?.results) ? json.results : [];
      for (const job of results) {
        jobs.push({
          title: job.name || '',
          url: jobUrl(job),
          company: job.company?.name || entry.name || 'The Muse',
          location: locationsText(job),
          description: stripTags(job.contents || '').slice(0, 600),
        });
        if (jobs.length >= limit) return jobs.filter(item => item.title && item.url);
      }
      if (!results.length || page >= Number(json?.page_count || 1)) break;
    }
    return jobs.filter(item => item.title && item.url);
  },
};
