// @ts-check
/** @typedef {import('./_types.js').Provider} Provider */

function parseWorkday(entry) {
  const explicitHost = entry.workday_host ? String(entry.workday_host) : '';
  const explicitTenant = entry.workday_tenant ? String(entry.workday_tenant) : '';
  const explicitSite = entry.workday_site ? String(entry.workday_site) : '';
  if (explicitHost && explicitTenant && explicitSite) {
    return { host: explicitHost, tenant: explicitTenant, site: explicitSite };
  }

  const url = entry.careers_url || '';
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const host = parsed.hostname;
  const tenant = host.match(/^([^.]+)\.wd\d+\.myworkdayjobs\.com$/i)?.[1] || explicitTenant;
  const parts = parsed.pathname.split('/').filter(Boolean);
  const site = explicitSite || parts.find(part => !/^[a-z]{2}-[A-Z]{2}$/.test(part) && part !== 'job');
  return host && tenant && site ? { host, tenant, site } : null;
}

function endpoint({ host, tenant, site }) {
  return `https://${host}/wday/cxs/${encodeURIComponent(tenant)}/${encodeURIComponent(site)}/jobs`;
}

function postingUrl(job, parsed, locale = 'en-US') {
  if (job.externalPath?.startsWith('http')) return job.externalPath;
  if (!job.externalPath) return '';
  return `https://${parsed.host}/${locale}/${parsed.site}${job.externalPath}`;
}

function searchTexts(entry) {
  if (Array.isArray(entry.workday_search_texts) && entry.workday_search_texts.length) {
    return entry.workday_search_texts.map(String);
  }
  if (entry.workday_search_text) return [String(entry.workday_search_text)];
  return ['Director Operations', 'Chief of Staff', 'Integration', 'VP Operations'];
}

/** @type {Provider} */
export default {
  id: 'workday',

  detect(entry) {
    const parsed = parseWorkday(entry);
    return parsed ? { url: endpoint(parsed) } : null;
  },

  async fetch(entry, ctx) {
    const parsed = parseWorkday(entry);
    if (!parsed) throw new Error(`workday: cannot derive host/tenant/site for ${entry.name}`);
    const limit = Math.min(Number(entry.workday_limit || 20), 20);
    const maxPages = Number(entry.workday_max_pages || 5);
    const locale = String(entry.workday_locale || 'en-US');
    const seen = new Set();
    const jobs = [];

    for (const searchText of searchTexts(entry)) {
      for (let page = 0; page < maxPages; page++) {
        const offset = page * limit;
        const json = await ctx.fetchJson(endpoint(parsed), {
          method: 'POST',
          headers: {
            accept: 'application/json',
            'content-type': 'application/json',
            origin: `https://${parsed.host}`,
            referer: entry.careers_url || `https://${parsed.host}/${locale}/${parsed.site}`,
          },
          body: JSON.stringify({
            appliedFacets: {},
            limit,
            offset,
            searchText,
          }),
        });
        const postings = Array.isArray(json?.jobPostings) ? json.jobPostings : [];
        for (const job of postings) {
          const url = postingUrl(job, parsed, locale);
          if (!url || seen.has(url)) continue;
          seen.add(url);
          jobs.push({
            title: job.title || '',
            url,
            company: entry.name,
            location: [job.locationsText, entry.workday_default_location].filter(Boolean).join(' - '),
          });
        }
        if (!postings.length || offset + postings.length >= Number(json?.total || 0)) break;
      }
    }

    return jobs.filter(job => job.title && job.url);
  },
};
