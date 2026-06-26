import { lookup } from 'dns/promises';
import { isIP } from 'net';

function flagEnabled(value) {
  return /^(1|true|yes|on)$/i.test(String(value || '').trim());
}

export function strictUrlFetchEnabled() {
  return flagEnabled(process.env.SUITOR_STRICT_URL_FETCH) || flagEnabled(process.env.SUITOR_ALLOW_LAN);
}

function ipv4Parts(address) {
  const parts = String(address || '').split('.').map(part => Number(part));
  return parts.length === 4 && parts.every(part => Number.isInteger(part) && part >= 0 && part <= 255) ? parts : null;
}

function isPrivateIpv4(address) {
  const parts = ipv4Parts(address);
  if (!parts) return false;
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

function isPrivateIpv6(address) {
  const value = String(address || '').toLowerCase();
  if (value === '::1' || value === '::') return true;
  if (value.startsWith('fc') || value.startsWith('fd') || value.startsWith('fe80:')) return true;
  if (value.startsWith('::ffff:')) return isPrivateIpv4(value.slice('::ffff:'.length));
  return false;
}

export function isPrivateAddress(address) {
  const family = isIP(address);
  if (family === 4) return isPrivateIpv4(address);
  if (family === 6) return isPrivateIpv6(address);
  return false;
}

function isBlockedHostname(hostname) {
  const host = String(hostname || '').trim().toLowerCase().replace(/^\[/, '').replace(/\]$/, '');
  return (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host === 'metadata.google.internal' ||
    host === '169.254.169.254' ||
    isPrivateAddress(host)
  );
}

export async function assertSafeFetchUrl(rawUrl, { strict = strictUrlFetchEnabled() } = {}) {
  const parsed = new URL(String(rawUrl));
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`Blocked URL with unsupported protocol: ${parsed.protocol}`);
  }
  if (!strict) return parsed;
  if (isBlockedHostname(parsed.hostname)) {
    throw new Error(`Blocked private or local URL in LAN mode: ${parsed.hostname}`);
  }
  const records = await lookup(parsed.hostname, { all: true, verbatim: true });
  for (const record of records) {
    if (isPrivateAddress(record.address)) {
      throw new Error(`Blocked URL resolving to private address in LAN mode: ${parsed.hostname}`);
    }
  }
  return parsed;
}
