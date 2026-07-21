#!/usr/bin/env node

import { spawnSync } from 'child_process';
import { readdirSync } from 'fs';
import { join, relative } from 'path';

const ROOT = process.cwd();
const SKIP_DIRS = new Set(['.git', 'node_modules', '_source-readonly', '.suitor-profile', '.suitor-runtime']);
const failures = [];

function javascriptFiles(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.suitor-'))) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) javascriptFiles(full, out);
    else if (/\.(?:js|mjs|cjs)$/i.test(entry.name)) out.push(full);
  }
  return out;
}

for (const file of javascriptFiles(ROOT)) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8', shell: false });
  if (result.status !== 0) {
    failures.push(`${relative(ROOT, file)}\n${result.stderr || result.stdout}`);
  }
}

if (failures.length) {
  console.error(`Syntax check failed for ${failures.length} file(s):`);
  console.error(failures.join('\n\n'));
  process.exit(1);
}

console.log('JavaScript syntax check passed');
