#!/usr/bin/env node

import { readdirSync, readFileSync } from 'fs';

const providerIds = readdirSync('providers')
  .filter(name => name.endsWith('.mjs') && !name.startsWith('_'))
  .map(name => name.replace(/\.mjs$/, '').toLowerCase())
  .sort();

const sources = readFileSync('docs/SOURCES.md', 'utf-8').toLowerCase();
const missing = providerIds.filter(id => !sources.includes(id));

if (missing.length) {
  console.error(`docs/SOURCES.md is missing provider(s): ${missing.join(', ')}`);
  process.exit(1);
}

console.log(`docs/SOURCES.md covers providers: ${providerIds.join(', ')}`);
