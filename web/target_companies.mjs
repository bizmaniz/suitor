// Target companies are { name, boards: [url] }. Bare strings still upgrade.
// Only URLs a provider can claim replace the guessed Greenhouse/Lever/Ashby slugs.

export function targetCompanySlug(value = '') {
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '')
    .trim();
}

export function normalizeTargetCompany(value) {
  if (typeof value === 'string') return { name: value.trim(), boards: [] };
  const name = String(value?.name || '').trim();
  const boards = (Array.isArray(value?.boards) ? value.boards : [])
    .map(url => String(url || '').trim())
    .filter(url => /^https?:\/\//i.test(url))
    .slice(0, 6);
  return { name, boards };
}

export function targetCompanyList(raw = []) {
  return (Array.isArray(raw) ? raw : [])
    .map(normalizeTargetCompany)
    .filter(company => company.name);
}

export function targetCompanyNames(raw = []) {
  return targetCompanyList(raw).map(company => company.name);
}

const BOARD_URL_HOSTS = [
  ['greenhouse', ['boards-api.greenhouse.io', 'boards.greenhouse.io', 'job-boards.greenhouse.io', 'job-boards.eu.greenhouse.io']],
  ['lever', ['jobs.lever.co']],
  ['ashby', ['jobs.ashbyhq.com']],
  ['smartrecruiters', ['careers.smartrecruiters.com', 'jobs.smartrecruiters.com']],
  ['workable', ['apply.workable.com']],
];

export function classifyBoardUrl(url = '') {
  const value = String(url || '').trim();
  if (!/^https?:\/\//i.test(value)) return '';
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return '';
  }
  const host = parsed.hostname.toLowerCase();
  const hasSlug = parsed.pathname.replace(/^\/+|\/+$/g, '').length > 0;
  for (const [provider, hosts] of BOARD_URL_HOSTS) {
    if (hosts.includes(host) && hasSlug) return provider;
  }
  if (/^[^.]+\.wd\d+\.myworkdayjobs\.com$/.test(host)) return 'workday';
  if (/^[^.]+\.workable\.com$/.test(host)) return 'workable';
  return '';
}

export function generatedTargetCompanyEntries(companies = []) {
  const entries = [];
  for (const company of companies.map(normalizeTargetCompany).filter(item => item.name)) {
    const scannable = company.boards.filter(url => classifyBoardUrl(url));
    if (scannable.length) {
      for (const url of scannable) {
        entries.push({
          name: `${company.name} (${classifyBoardUrl(url)})`,
          provider: classifyBoardUrl(url),
          careersUrl: url,
        });
      }
      continue;
    }
    const slug = targetCompanySlug(company.name);
    if (!slug) continue;
    entries.push(
      { name: `${company.name} (Greenhouse)`, provider: 'greenhouse', careersUrl: `https://job-boards.greenhouse.io/${slug}` },
      { name: `${company.name} (Lever)`, provider: 'lever', careersUrl: `https://jobs.lever.co/${slug}` },
      { name: `${company.name} (Ashby)`, provider: 'ashby', careersUrl: `https://jobs.ashbyhq.com/${slug}` },
    );
  }
  return entries;
}

export function linkedInFallbackCompanies(raw = []) {
  return targetCompanyList(raw)
    .filter(company => !company.boards.some(url => classifyBoardUrl(url)))
    .map(company => company.name);
}
