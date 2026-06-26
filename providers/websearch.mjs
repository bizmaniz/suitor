// @ts-check
/** @typedef {import('./_types.js').Provider} Provider */

import { decodeHtmlEntities, htmlToPlainText } from './_html_text.mjs';

const DDG_HTML = 'https://html.duckduckgo.com/html/';
let duckDuckGoQueue = Promise.resolve();

const htmlDecode = decodeHtmlEntities;
const stripTags = htmlToPlainText;

function isHostOrSubdomain(hostname, domain) {
  const host = String(hostname || '').replace(/^www\./i, '').toLowerCase();
  const expected = String(domain || '').toLowerCase();
  return host === expected || host.endsWith(`.${expected}`);
}

function careersHost(entry) {
  try {
    return new URL(entry.careers_url || '').hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function siteHosts(query) {
  return [...String(query || '').matchAll(/\bsite:([^\s")]+)/gi)]
    .map(match => match[1].replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0])
    .filter(Boolean);
}

function queryFor(entry) {
  if (entry.scan_query) return String(entry.scan_query);
  const host = careersHost(entry);
  const site = host ? `site:${host}` : '';
  return `${site} "Director of Operations" OR "Chief of Staff" OR "Director of Integration" OR "VP Operations"`.trim();
}

function unwrapDuckDuckGoUrl(rawHref) {
  const href = htmlDecode(rawHref || '');
  const absolute = href.startsWith('//') ? `https:${href}` : href;
  let parsed;
  try {
    parsed = new URL(absolute);
  } catch {
    return '';
  }
  if (isHostOrSubdomain(parsed.hostname, 'duckduckgo.com') && parsed.pathname === '/l/') {
    const uddg = parsed.searchParams.get('uddg');
    return uddg ? decodeURIComponent(uddg) : '';
  }
  return absolute;
}

function allowedUrl(url, allowedHosts) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) return false;
  if (['duckduckgo.com', 'bing.com', 'monster.com'].some(domain => isHostOrSubdomain(parsed.hostname, domain))) return false;
  if (!allowedHosts.length) return true;
  const host = parsed.hostname.replace(/^www\./, '');
  return allowedHosts.some(allowed => host === allowed || host.endsWith(`.${allowed}`));
}

async function fetchDuckDuckGo(ctx, url, opts) {
  const previous = duckDuckGoQueue;
  let release = () => {};
  duckDuckGoQueue = new Promise(resolve => { release = resolve; });
  await previous;
  try {
    return await ctx.fetchText(url, opts);
  } finally {
    setTimeout(release, Number(process.env.SUITOR_WEBSEARCH_DELAY_MS || 750));
  }
}

function jobsFromHtml(html, entry, hosts) {
  const seen = new Set();
  const jobs = [];
  for (const match of html.matchAll(/<a[^>]+class="[^"]*\bresult__a\b[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const url = unwrapDuckDuckGoUrl(match[1]);
    if (!url || seen.has(url) || !allowedUrl(url, hosts)) continue;
    seen.add(url);
    const title = stripTags(match[2]);
    if (!title) continue;
    jobs.push({ title, url, company: entry.name, location: '' });
    if (jobs.length >= Number(entry.websearch_limit || 5)) break;
  }
  return jobs;
}

function jobsFromMarkdown(markdown, entry, hosts) {
  const seen = new Set();
  const jobs = [];
  for (const match of markdown.matchAll(/(?:^|\n)##\s+\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g)) {
    const url = unwrapDuckDuckGoUrl(match[2]);
    if (!url || seen.has(url) || !allowedUrl(url, hosts)) continue;
    seen.add(url);
    const title = stripTags(match[1]);
    if (!title) continue;
    jobs.push({ title, url, company: entry.name, location: '' });
    if (jobs.length >= Number(entry.websearch_limit || 5)) break;
  }
  return jobs;
}

async function fetchViaJina(ctx, query) {
  const target = `${DDG_HTML}?q=${encodeURIComponent(query)}`;
  const url = `https://r.jina.ai/http://${target.replace(/^https?:\/\//, '')}`;
  return await ctx.fetchText(url, { headers: { accept: 'text/markdown' }, timeoutMs: 20_000 });
}

/** @type {Provider} */
export default {
  id: 'websearch',

  detect(entry) {
    return entry.scan_method === 'websearch' || entry.scan_query ? { url: DDG_HTML } : null;
  },

  async fetch(entry, ctx) {
    const query = queryFor(entry);
    const hosts = [...new Set([...siteHosts(query), careersHost(entry)].filter(Boolean))];
    let directError = null;
    try {
      const html = await fetchDuckDuckGo(ctx, `${DDG_HTML}?q=${encodeURIComponent(query)}`, {
        headers: {
          accept: 'text/html',
          referer: 'https://duckduckgo.com/',
        },
      });
      const direct = jobsFromHtml(html, entry, hosts);
      if (direct.length) return direct;
    } catch (err) {
      directError = err;
    }

    try {
      const markdown = await fetchViaJina(ctx, query);
      return jobsFromMarkdown(markdown, entry, hosts);
    } catch (err) {
      if (directError) console.error(`websearch: fallback search failed for ${entry.name}: ${err.message}`);
      return [];
    }
  },
};
