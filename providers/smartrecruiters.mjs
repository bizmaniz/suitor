// @ts-check
/** @typedef {import('./_types.js').Provider} Provider */

function companySlug(entry) {
  if (entry.smartrecruiters_company) return String(entry.smartrecruiters_company);
  const url = entry.careers_url || '';
  const match = url.match(/careers\.smartrecruiters\.com\/([^/?#]+)/i)
    || url.match(/jobs\.smartrecruiters\.com\/([^/?#]+)/i);
  return match ? decodeURIComponent(match[1]) : '';
}

function apiUrl(slug, offset = 0, limit = 100) {
  return `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(slug)}/postings?limit=${limit}&offset=${offset}`;
}

function postingUrl(item, slug) {
  if (item.postingUrl) return item.postingUrl;
  if (item.id) return `https://jobs.smartrecruiters.com/${encodeURIComponent(slug)}/${encodeURIComponent(item.id)}`;
  return '';
}

function locationText(location = {}) {
  const base = location.fullLocation
    || [location.city, location.region, location.country].filter(Boolean).join(', ');
  return [base, location.remote ? 'Remote' : ''].filter(Boolean).join(' - ');
}

/** @type {Provider} */
export default {
  id: 'smartrecruiters',

  detect(entry) {
    const slug = companySlug(entry);
    return slug ? { url: apiUrl(slug) } : null;
  },

  async fetch(entry, ctx) {
    const slug = companySlug(entry);
    if (!slug) throw new Error(`smartrecruiters: cannot derive company slug for ${entry.name}`);
    const limit = Number(entry.smartrecruiters_limit || 100);
    const maxPages = Number(entry.smartrecruiters_max_pages || 3);
    const jobs = [];

    for (let page = 0; page < maxPages; page++) {
      const json = await ctx.fetchJson(apiUrl(slug, page * limit, limit));
      const content = Array.isArray(json?.content) ? json.content : [];
      jobs.push(...content);
      if (!content.length || jobs.length >= Number(json?.totalFound || 0)) break;
    }

    return jobs.map(item => ({
      title: item.name || '',
      url: postingUrl(item, slug),
      company: item.company?.name || entry.name,
      location: locationText(item.location),
    })).filter(job => job.title && job.url);
  },
};
