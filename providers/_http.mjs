// HTTP transport helpers shared across providers.
// Files prefixed with _ are never loaded as providers by scan.mjs.

import { assertSafeFetchUrl, strictUrlFetchEnabled } from './_url_safety.mjs';

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_USER_AGENT = 'Mozilla/5.0 (compatible; Suitor/1.0)';

async function fetchWithTimeout(url, { timeoutMs = DEFAULT_TIMEOUT_MS, headers = {}, method = 'GET', body = null, redirect = 'follow' } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const strict = strictUrlFetchEnabled();
    let currentUrl = String(url);
    let res;
    for (let hop = 0; hop <= 5; hop++) {
      await assertSafeFetchUrl(currentUrl, { strict });
      res = await fetch(currentUrl, {
        method,
        headers: { 'user-agent': DEFAULT_USER_AGENT, ...headers },
        body,
        redirect: strict ? 'manual' : redirect,
        signal: controller.signal,
      });
      const location = res.headers.get('location');
      if (!strict || ![301, 302, 303, 307, 308].includes(res.status) || !location) break;
      if (redirect === 'error') throw new Error(`HTTP ${res.status}: redirect blocked`);
      if (redirect === 'manual') break;
      currentUrl = new URL(location, currentUrl).toString();
      if (res.status === 303) method = 'GET';
      continue;
    }
    if (!res) throw new Error('Fetch failed before response.');
    if (strict && [301, 302, 303, 307, 308].includes(res.status) && redirect !== 'manual') {
      throw new Error('HTTP redirect limit exceeded');
    }
    if (!res.ok) {
      const responseText = await res.text().catch(() => '');
      const snippet = responseText.replace(/\s+/g, ' ').trim().slice(0, 300);
      const err = new Error(snippet ? `HTTP ${res.status}: ${snippet}` : `HTTP ${res.status}`);
      err.status = res.status;
      err.body = responseText;
      throw err;
    }
    return res;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchJson(url, opts = {}) {
  const res = await fetchWithTimeout(url, opts);
  return await res.json();
}

export async function fetchText(url, opts = {}) {
  const res = await fetchWithTimeout(url, opts);
  return await res.text();
}

export function makeHttpCtx() {
  return {
    transport: 'http',
    fetchJson,
    fetchText,
  };
}
