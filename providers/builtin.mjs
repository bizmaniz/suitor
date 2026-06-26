// @ts-check
/** @typedef {import('./_types.js').Provider} Provider */

import { decodeHtmlEntities, htmlToPlainText } from './_html_text.mjs';

const stripTags = htmlToPlainText;

function absoluteBuiltInUrl(url) {
  if (!url) return '';
  if (url.startsWith('https://builtin.com/')) return url;
  if (url.startsWith('/')) return `https://builtin.com${url}`;
  return '';
}

function titleFromAnchorHtml(html) {
  const clean = stripTags(html);
  const marker = clean.match(/^(.+?)(?:\s+(Remote|Hybrid|On-Site|United States|USA|Atlanta|New York|San Francisco|Boston|Chicago|Denver)\b|$)/i);
  return (marker?.[1] || clean).trim();
}

function cardTextAround(html, start) {
  const before = html.lastIndexOf('<div', start);
  const after = html.indexOf('</div>', start + 200);
  if (before === -1 || after === -1) return '';
  return stripTags(html.slice(before, Math.min(after + 6, start + 4000)));
}

function inferLocation(text) {
  const match = text.match(/\b(Remote(?:\s*-\s*(?:US|USA|United States))?|United States|USA|Atlanta,?\s*GA|New York,?\s*NY|San Francisco,?\s*CA|Boston,?\s*MA|Chicago,?\s*IL|Denver,?\s*CO|Austin,?\s*TX)\b/i);
  return match ? match[0] : '';
}

function searchUrl(entry) {
  if (entry.url) return String(entry.url);
  const query = String(entry.search || entry.query || '').trim();
  if (!query) return '';
  const params = new URLSearchParams({ search: query });
  return `https://builtin.com/jobs?${params.toString()}`;
}

function companyFromDescription(description) {
  const text = stripTags(description);
  const match = text.match(/\bat\s+([A-Z][A-Za-z0-9&.,' -]{2,70}?)(?:\s+(?:provides|supports|will|is|drives|partners|owns|leads|requires|manages)\b|[.,;]|$)/);
  return match ? match[1].replace(/\s+/g, ' ').trim() : '';
}

function jobsFromJsonLd(html, entry, limit) {
  const jobs = [];
  const seen = new Set();
  for (const script of html.matchAll(/<script[^>]+type="application\/ld(?:\+|&#x2B;)json"[^>]*>([\s\S]*?)<\/script>/gi)) {
    let parsed;
    try {
      parsed = JSON.parse(decodeHtmlEntities(script[1]));
    } catch {
      continue;
    }
    const graph = Array.isArray(parsed?.['@graph']) ? parsed['@graph'] : [];
    const lists = graph.filter(item => Array.isArray(item?.itemListElement));
    for (const list of lists) {
      for (const element of list.itemListElement) {
        const url = absoluteBuiltInUrl(String(element?.url || '').split('?')[0]);
        const title = stripTags(element?.name || '');
        if (!url || !title || seen.has(url)) continue;
        seen.add(url);
        jobs.push({
          title,
          url,
          company: companyFromDescription(element?.description) || entry.company || 'BuiltIn',
          location: '',
        });
        if (jobs.length >= limit) return jobs;
      }
    }
  }
  return jobs;
}

/** @type {Provider} */
export default {
  id: 'builtin',

  detect(entry) {
    if (entry.scan_method === 'builtin' || entry.provider === 'builtin') return { url: searchUrl(entry) || 'https://builtin.com/jobs' };
    if (String(entry.url || '').startsWith('https://builtin.com/jobs')) return { url: String(entry.url) };
    return null;
  },

  async fetch(entry, ctx) {
    const url = searchUrl(entry);
    if (!url) throw new Error(`builtin: missing BuiltIn search URL for ${entry.name}`);
    const html = await ctx.fetchText(url, {
      headers: {
        accept: 'text/html',
        'user-agent': 'Suitor/1.0',
      },
      timeoutMs: 25_000,
    });
    const limit = Number(entry.builtin_limit || entry.limit || 8);
    const structured = jobsFromJsonLd(html, entry, limit);
    if (structured.length) return structured;
    const jobs = [];
    const seen = new Set();
    const re = /<a\b[^>]*href="([^"]*\/job\/[^"]+)"[^>]*>([\s\S]{0,1200})<\/a>/gi;
    for (const match of html.matchAll(re)) {
      const jobUrl = absoluteBuiltInUrl(htmlDecode(match[1]).split('?')[0]);
      if (!jobUrl || seen.has(jobUrl)) continue;
      const title = titleFromAnchorHtml(match[2]);
      if (!title || /\b(best|jobs|salary|hiring)\b/i.test(title)) continue;
      const text = cardTextAround(html, match.index || 0);
      const location = inferLocation(text);
      seen.add(jobUrl);
      jobs.push({
        title,
        url: jobUrl,
        company: entry.company || entry.name || 'BuiltIn',
        location,
      });
      if (jobs.length >= limit) break;
    }
    return jobs;
  },
};
