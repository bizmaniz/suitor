import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'fs';
import { spawnSync } from 'child_process';
import { dirname } from 'path';

// Cursor (and later provider) keys live in provider-secrets.json, never in
// suitor.config.json. Unix uses 0600. Windows uses an ACL that drops inherited
// Everyone / Users access and leaves only the current user.

export function cursorApiKeyFrom(env = process.env, secrets = {}) {
  return String(env.CURSOR_API_KEY || secrets.cursor?.apiKey || '').trim();
}

export function loadProviderSecrets(filePath) {
  let raw;
  try {
    raw = readFileSync(filePath, 'utf-8');
  } catch (err) {
    if (err.code === 'ENOENT') return { secrets: {}, error: '' };
    return { secrets: {}, error: `${err.code || 'read error'}: ${err.message}` };
  }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { secrets: {}, error: 'corrupt file: not a JSON object' };
    }
    return { secrets: parsed, error: '' };
  } catch (err) {
    return { secrets: {}, error: `corrupt file: ${err.message}` };
  }
}

export function saveProviderSecretsFile(filePath, next) {
  mkdirSync(dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`, { encoding: 'utf-8', mode: 0o600 });
  renameSync(tmp, filePath);
  // Windows rename can drop the ACL we want. Always re-apply after the file exists.
  restrictPrivateFile(filePath);
}

export function restrictPrivateFile(filePath) {
  if (!filePath || !existsSync(filePath)) return;
  if (process.platform === 'win32') {
    restrictWindowsAcl(filePath);
    return;
  }
  chmodSync(filePath, 0o600);
}

export function privateFileIsRestricted(filePath) {
  if (!filePath || !existsSync(filePath)) return false;
  if (process.platform === 'win32') return windowsAclIsRestricted(filePath);
  return (statSync(filePath).mode & 0o777) === 0o600;
}

function restrictWindowsAcl(filePath) {
  const user = String(process.env.USERNAME || process.env.USER || '').trim();
  spawnSync('icacls', [filePath, '/inheritance:r'], {
    encoding: 'utf-8',
    windowsHide: true,
  });
  if (!user) return;
  spawnSync('icacls', [filePath, '/grant:r', `${user}:(R,W)`], {
    encoding: 'utf-8',
    windowsHide: true,
  });
}

function windowsAclIsRestricted(filePath) {
  const result = spawnSync('icacls', [filePath], {
    encoding: 'utf-8',
    windowsHide: true,
  });
  const output = `${result.stdout || ''}\n${result.stderr || ''}`;
  if (result.status !== 0) return false;
  if (/\bEveryone\b/i.test(output)) return false;
  if (/BUILTIN\\Users/i.test(output)) return false;
  return true;
}

// CLI children (Claude, Codex, tailor, generic scan) must not receive the
// Cursor key. Only the Cursor scoring child should.
export function childEnvForCli(baseEnv = {}, { provider = '' } = {}) {
  const env = { ...baseEnv };
  delete env.CURSOR_API_KEY;
  if (provider) env.SUITOR_LLM_PROVIDER = String(provider);
  return env;
}

export function childEnvForCursorScan(baseEnv = {}, { cursorKey = '', provider = '' } = {}) {
  const env = childEnvForCli(baseEnv, { provider });
  const selected = String(provider || env.SUITOR_LLM_PROVIDER || '').trim().toLowerCase();
  const key = String(cursorKey || '').trim();
  if (selected === 'cursor' && key) env.CURSOR_API_KEY = key;
  return env;
}

export function nodeVersionAtLeast(current, minimum = '22.13.0') {
  const parts = (value) => String(value || '').replace(/^v/i, '').split('.').map(part => Number(part) || 0);
  const left = parts(current);
  const right = parts(minimum);
  const len = Math.max(left.length, right.length);
  for (let i = 0; i < len; i += 1) {
    if ((left[i] || 0) > (right[i] || 0)) return true;
    if ((left[i] || 0) < (right[i] || 0)) return false;
  }
  return true;
}
