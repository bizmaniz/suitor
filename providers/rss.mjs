// @ts-check
/** @typedef {import('./_types.js').Provider} Provider */

import { decodeHtmlEntities, htmlToPlainText } from './_html_text.mjs';

function decode(value) {
  return decodeHtmlEntities(String(value || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1'));
}

function stripTags(value) {
  return htmlToPlainText(decode(value));
}

function tag(block, name) {
  const match = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i'));
  return match ? decode(match[1]).trim() : '';
}

function firstUrl(block) {
  const link = tag(block, 'link');
  if (/^https?:\/\//i.test(link)) return link.trim();
  const guid = tag(block, 'guid');
  if (/^https?:\/\//i.test(guid)) return guid.trim();
  return '';
}

function splitTitle(rawTitle, fallbackCompany) {
  const title = stripTags(rawTitle);
  const colon = title.match(/^([^:]{2,80}):\s*(.+)$/);
  if (colon) return { company: colon[1].trim(), title: colon[2].trim() };
  const dash = title.match(/^(.+?)\s+[-–—]\s+(.+)$/);
  if (dash && dash[1].length <= 80) return { company: dash[1].trim(), title: dash[2].trim() };
  return { company: fallbackCompany, title };
}

function locationFrom(block) {
  return stripTags(tag(block, 'region') || tag(block, 'location') || tag(block, 'country') || tag(block, 'state'));
}

/** @type {Provider} */
export default {
  id: 'rss',

  detect(entry) {
    if (entry.scan_method === 'rss' || entry.provider === 'rss') return { url: String(entry.url || entry.feed_url || '') };
    const url = String(entry.url || entry.feed_url || '');
    return /\.rss\b|\/rss\b|format=rss|feed=/i.test(url) ? { url } : null;
  },

  async fetch(entry, ctx) {
    const url = String(entry.url || entry.feed_url || '');
    if (!url) throw new Error(`rss: missing feed URL for ${entry.name}`);
    const xml = await ctx.fetchText(url, {
      headers: { accept: 'application/rss+xml, application/atom+xml, text/xml, application/xml' },
      timeoutMs: 25_000,
    });
    const blocks = [...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)].map(match => match[0]);
    const atomBlocks = blocks.length ? [] : [...xml.matchAll(/<entry\b[\s\S]*?<\/entry>/gi)].map(match => match[0]);
    const limit = Number(entry.rss_limit || entry.limit || 12);
    const seen = new Set();
    const jobs = [];
    for (const block of [...blocks, ...atomBlocks]) {
      const url = firstUrl(block);
      if (!url || seen.has(url)) continue;
      const parsed = splitTitle(tag(block, 'title'), entry.name || 'RSS');
      if (!parsed.title) continue;
      seen.add(url);
      jobs.push({
        title: parsed.title,
        url,
        company: parsed.company || entry.name || 'RSS',
        location: locationFrom(block),
      });
      if (jobs.length >= limit) break;
    }
    return jobs;
  },
};
