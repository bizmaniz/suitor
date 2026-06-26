// @ts-check
/** @typedef {import('./_types.js').Provider} Provider */

function accountSlug(entry) {
  if (entry.workable_account) return String(entry.workable_account);
  const url = entry.careers_url || '';
  const match = url.match(/apply\.workable\.com\/([^/?#]+)/i)
    || url.match(/^https:\/\/([^./]+)\.workable\.com/i);
  return match ? decodeURIComponent(match[1]) : '';
}

function listUrl(slug) {
  return `https://apply.workable.com/api/v3/accounts/${encodeURIComponent(slug)}/jobs`;
}

function locationText(job = {}) {
  if (job.location?.location_str) return job.location.location_str;
  const location = job.location || {};
  return [location.city, location.region, location.country].filter(Boolean).join(', ');
}

function jobUrl(job, slug) {
  if (job.url) return job.url;
  if (job.shortlink) return job.shortlink;
  if (job.shortcode) return `https://apply.workable.com/${encodeURIComponent(slug)}/j/${encodeURIComponent(job.shortcode)}/`;
  if (job.id) return `https://apply.workable.com/${encodeURIComponent(slug)}/j/${encodeURIComponent(String(job.id))}/`;
  return '';
}

/** @type {Provider} */
export default {
  id: 'workable',

  detect(entry) {
    const slug = accountSlug(entry);
    return slug ? { url: listUrl(slug) } : null;
  },

  async fetch(entry, ctx) {
    const slug = accountSlug(entry);
    if (!slug) throw new Error(`workable: cannot derive account slug for ${entry.name}`);
    const maxPages = Number(entry.workable_max_pages || 10);
    const jobs = [];
    let token = null;

    for (let page = 0; page < maxPages; page++) {
      const body = JSON.stringify({
        query: entry.workable_query || '',
        token,
        department: [],
        location: [],
        worktype: [],
        remote: [],
      });
      const json = await ctx.fetchJson(listUrl(slug), {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          origin: 'https://apply.workable.com',
          referer: `https://apply.workable.com/${slug}/`,
        },
        body,
      });
      const results = Array.isArray(json?.results) ? json.results : [];
      jobs.push(...results);
      token = json?.nextPage || json?.next_page || json?.next;
      if (!results.length || !token) break;
    }

    return jobs.map(job => ({
      title: job.title || '',
      url: jobUrl(job, slug),
      company: entry.name,
      location: locationText(job),
    })).filter(job => job.title && job.url);
  },
};
