#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

const ROOT = process.cwd();
const SKIP_DIRS = new Set(['.git', 'node_modules', '_source-readonly', '.suitor-runtime', '.suitor-profile']);
const SKIP_FILES = new Set(['PLAN.md', 'PUBLISH.md']);
const TEXT_EXT = /\.(mjs|js|cjs|json|md|yml|yaml|html|css|py|txt|example|gitignore)$/i;
const re = (parts, flags = 'i') => new RegExp(parts.join(''), flags);
const forbidden = [
  re(['Nu', 'nes']),
  re(['\\bTh', 'ea\\b']),
  re(['\\bAbu', 'ela\\b']),
  re(['\\bGra', 'cia\\b']),
  re(['Wh', 'itman']),
  re(['Re', 'think']),
  re(['be', 'n\\.nu', 'nes']),
  re(['kim', 'berly\\.nu', 'nes']),
  re(['D:\\\\Auto', 'mation Projects']),
  re(['\\bJOB', 'HUNTHQ\\b']),
  re(['\\bCARE', 'EROS\\b']),
  re(['\\bJob', 'HuntHQ\\b']),
  re(['\\bCareer', 'OS\\b']),
  re(['\\bKI', 'M_[A-Z0-9_]+\\b'], ''),
  new RegExp(`x-${'ki'}m-app-token`, 'i'),
];
const secretLike = [
  /sk-[A-Za-z0-9_-]{20,}/,
  /ghp_[A-Za-z0-9_]{20,}/,
  /github_pat_[A-Za-z0-9_]{20,}/,
  /AKIA[0-9A-Z]{16}/,
  /-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----/,
  /(?<!example)(?:api[_-]?key|secret|token)\s*[:=]\s*["'][A-Za-z0-9_./+=-]{24,}["']/i,
];

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.suitor-'))) continue;
    const full = join(dir, entry.name);
    const rel = relative(ROOT, full).replace(/\\/g, '/');
    if (entry.isDirectory()) walk(full, out);
    else if (!SKIP_FILES.has(rel) && TEXT_EXT.test(entry.name)) out.push(full);
  }
  return out;
}

const failures = [];
for (const file of walk(ROOT)) {
  const rel = relative(ROOT, file).replace(/\\/g, '/');
  if (rel === '.env' || rel.endsWith('/.env')) failures.push(`${rel}: .env must not be shipped`);
  if (statSync(file).size > 2_000_000) continue;
  const text = readFileSync(file, 'utf-8');
  for (const pattern of forbidden) {
    if (pattern.test(text)) failures.push(`${rel}: forbidden PII/product legacy pattern ${pattern}`);
  }
  for (const pattern of secretLike) {
    if (pattern.test(text)) failures.push(`${rel}: possible secret ${pattern}`);
  }
}

for (const required of ['.gitignore', 'README.md', 'SECURITY.md', '.env.example']) {
  if (!existsSync(required)) failures.push(`${required}: missing required public-repo file`);
}

if (failures.length) {
  console.error('check:clean failed');
  for (const item of failures.slice(0, 80)) console.error(`- ${item}`);
  if (failures.length > 80) console.error(`...and ${failures.length - 80} more`);
  process.exit(1);
}

console.log('check:clean PII/secret scan passed');
