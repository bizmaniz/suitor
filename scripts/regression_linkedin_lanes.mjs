#!/usr/bin/env node
// LinkedIn lanes: `;`-separated phrases, per-lane quota, every lane always runs.
// Stubs searchLinkedIn — never opens a browser.

import assert from 'assert/strict';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { MAX_SEARCH_LANES, splitQueries, runSearchLanes } from './linkedin_lanes.mjs';

assert.equal(MAX_SEARCH_LANES, 14, 'lane cap is 14');

assert.deepEqual(
  splitQueries('ic ai; ai operations; customer operations'),
  ['ic ai', 'ai operations', 'customer operations'],
  'semicolon-separated phrases become lanes',
);
assert.deepEqual(
  splitQueries('ic ai\nai operations'),
  ['ic ai', 'ai operations'],
  'newlines also split lanes',
);
assert.deepEqual(
  splitQueries('IC AI; ic ai; Ic Ai'),
  ['IC AI'],
  'lanes are deduped case-insensitively, first spelling kept',
);
assert.equal(
  splitQueries(Array.from({ length: 20 }, (_, i) => `lane ${i + 1}`).join('; ')).length,
  14,
  'more than 14 lanes are capped',
);
assert.deepEqual(splitQueries('  ;  ; '), [], 'blank fragments are dropped');

const searched = [];
const result = await runSearchLanes(
  [
    { query: 'ic ai' },
    { query: 'ai operations' },
    { query: 'customer operations' },
  ],
  2,
  async (query, limit) => {
    searched.push({ query, limit });
    return {
      results: [
        { title: `${query} one`, url: `https://example.com/${query}/1` },
        { title: `${query} two`, url: `https://example.com/${query}/2` },
        { title: `${query} three`, url: `https://example.com/${query}/3` },
      ].slice(0, limit),
      inspectedUniqueCount: 4,
      skippedBelowComp: [{ title: `${query} skipped` }],
    };
  },
);

assert.equal(searched.length, 3, 'all 3 lanes are searched even when merged count exceeds a global cap');
assert.deepEqual(
  searched.map(item => item.limit),
  [2, 2, 2],
  'limit is a per-lane quota, not a shared budget',
);
assert.equal(result.results.length, 6, '3 lanes × 2 results merge to 6 unique rows');
assert.equal(result.inspectedUniqueCount, 12, 'inspected counts are aggregated across lanes');
assert.equal(result.skippedBelowComp.length, 3, 'skipped-below-comp rows are aggregated across lanes');
assert.match(result.logs.at(-1), /3\/3 lanes/, 'done log uses the lane list length, not an undefined queries.length');

const adapter = readFileSync(resolve('scripts', 'browser_adapter.mjs'), 'utf-8');
assert.match(adapter, /splitQueries|runSearchLanes/, 'browser adapter uses the shared lane helpers');
assert.doesNotMatch(
  adapter,
  /across \$\{lanes\.length\}\/\$\{queries\.length\}/,
  'done log must not reference undefined queries.length',
);

const app = readFileSync(resolve('web', 'static', 'app.js'), 'utf-8');
const html = readFileSync(resolve('web', 'static', 'index.html'), 'utf-8');
assert.match(html, /id="linkedinLanes"/, 'Scans UI has a lane-chip host');
assert.match(app, /lane-chip-remove/, 'lane chips can be removed');
assert.match(app, /lastLane|lanes\.length === 1/, 'the last lane\'s remove control is disabled');
assert.match(app, /searchQuery/, 'lanes persist as connections.linkedin.searchQuery');
assert.match(app, /\.\.\.(cfg\.connections\?\.linkedin|config\.connections\?\.linkedin|.*linkedin \|\| \{\})/, 'saving LinkedIn spreads the existing object');

console.log('regression_linkedin_lanes passed');
