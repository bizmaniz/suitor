#!/usr/bin/env node

import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

const checks = [];
const add = (ok, label, fix = '') => checks.push({ ok: Boolean(ok), label, fix });
const read = path => existsSync(path) ? readFileSync(path, 'utf-8') : '';

async function main() {
  const nodeMajor = Number(process.versions.node.split('.')[0]);
  add(nodeMajor >= 22, `Node.js 22+ available (${process.version})`, 'Install Node.js 22 or newer.');
  add(existsSync('package.json'), 'package.json exists');
  add(existsSync('web/server.mjs'), 'Suitor server exists');
  add(existsSync('web/config.mjs'), 'Central config module exists');
  add(existsSync('providers'), 'Provider directory exists');
  add(existsSync('docs/INSTALL.md'), 'Install docs exist');
  add(existsSync('docs/SOURCES.md'), 'Source docs exist');
  add(existsSync('.gitignore'), '.gitignore exists');
  const gitignore = read('.gitignore');
  for (const pattern of ['PLAN.md', 'PUBLISH.md', '_source-readonly/', '.env', '.suitor-runtime/', '.suitor-profile/', 'node_modules/']) {
    add(gitignore.includes(pattern), `.gitignore excludes ${pattern}`);
  }
  try {
    await import('playwright');
    add(true, 'Playwright package imports');
  } catch {
    add(false, 'Playwright package imports', 'Run npm install.');
  }
  add(existsSync(resolve('scripts', 'check_clean.mjs')), 'Clean-check script exists');

  console.log('\nSuitor doctor\n=============\n');
  for (const item of checks) {
    console.log(`${item.ok ? 'PASS' : 'FAIL'} - ${item.label}${item.ok || !item.fix ? '' : `\n  Fix: ${item.fix}`}`);
  }
  const failures = checks.filter(item => !item.ok);
  console.log(`\n${checks.length - failures.length}/${checks.length} checks passed.`);
  process.exitCode = failures.length ? 1 : 0;
}

main().catch(err => {
  console.error(err.stack || err.message);
  process.exitCode = 1;
});
