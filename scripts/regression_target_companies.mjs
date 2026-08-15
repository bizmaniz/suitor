#!/usr/bin/env node
// Target companies: { name, boards } with exact scannable URLs replacing guesses.
// An unclassified careers URL must not suppress the three guessed boards.

import assert from 'assert/strict';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  classifyBoardUrl,
  generatedTargetCompanyEntries,
  normalizeTargetCompany,
} from '../web/target_companies.mjs';
import greenhouse from '../providers/greenhouse.mjs';

assert.equal(classifyBoardUrl('https://job-boards.greenhouse.io/acme'), 'greenhouse');
assert.equal(classifyBoardUrl('https://boards.greenhouse.io/acme/jobs/1'), 'greenhouse');
assert.equal(
  greenhouse.detect({ name: 'Acme', careers_url: 'https://boards.greenhouse.io/acme' })?.url,
  'https://boards-api.greenhouse.io/v1/boards/acme/jobs',
  'classic boards.greenhouse.io URLs must resolve to the public jobs API',
);
assert.equal(
  greenhouse.detect({ name: 'Acme', careers_url: 'https://job-boards.greenhouse.io/acme' })?.url,
  'https://boards-api.greenhouse.io/v1/boards/acme/jobs',
  'job-boards.greenhouse.io URLs must resolve to the public jobs API',
);
assert.equal(
  greenhouse.detect({ name: 'Acme', careers_url: 'https://boards.greenhouse.io/acme/jobs/1' })?.url,
  'https://boards-api.greenhouse.io/v1/boards/acme/jobs',
  'a job page under boards.greenhouse.io still uses the board token',
);
assert.equal(classifyBoardUrl('https://jobs.lever.co/acme'), 'lever');
assert.equal(classifyBoardUrl('https://jobs.ashbyhq.com/acme'), 'ashby');
assert.equal(classifyBoardUrl('https://careers.smartrecruiters.com/Acme'), 'smartrecruiters');
assert.equal(classifyBoardUrl('https://apply.workable.com/acme'), 'workable');
assert.equal(classifyBoardUrl('https://acme.wd5.myworkdayjobs.com/en-US/Careers'), 'workday');
assert.equal(classifyBoardUrl('https://acme.workable.com'), 'workable');
assert.equal(classifyBoardUrl('https://job-boards.greenhouse.io/'), '', 'bare provider host with no slug does not classify');
assert.equal(
  classifyBoardUrl('https://careers.acme.com/?utm=jobs.lever.co/foo'),
  '',
  'provider host as a query substring must not classify',
);
assert.equal(classifyBoardUrl('https://careers.example.com/about/jobs'), '', 'unrecognized careers URL is not scannable');
assert.equal(classifyBoardUrl('not-a-url'), '');

assert.deepEqual(
  normalizeTargetCompany('Scale AI'),
  { name: 'Scale AI', boards: [] },
  'bare strings upgrade to { name, boards }',
);

const fromString = generatedTargetCompanyEntries(['Example Corp']);
assert.equal(fromString.length, 3, 'a string config still generates three guessed boards');
assert.deepEqual(
  fromString.map(entry => entry.provider).sort(),
  ['ashby', 'greenhouse', 'lever'],
);
assert.ok(fromString.every(entry => entry.careersUrl.includes('examplecorp')));

const unscannable = generatedTargetCompanyEntries([{
  name: 'Example Corp',
  boards: ['https://careers.example.com/about/jobs'],
}]);
assert.equal(unscannable.length, 3, 'an unscannable careers URL does not drop the guessed boards');
assert.deepEqual(
  unscannable.map(entry => entry.provider).sort(),
  ['ashby', 'greenhouse', 'lever'],
);

const explicit = generatedTargetCompanyEntries([{
  name: 'Example Corp',
  boards: ['https://job-boards.greenhouse.io/real-slug'],
}]);
assert.equal(explicit.length, 1, 'a scannable explicit URL replaces guesses for that company');
assert.equal(explicit[0].provider, 'greenhouse');
assert.equal(explicit[0].careersUrl, 'https://job-boards.greenhouse.io/real-slug');

const mixed = generatedTargetCompanyEntries([{
  name: 'Example Corp',
  boards: [
    'https://careers.example.com/about/jobs',
    'https://jobs.lever.co/real-slug',
  ],
}]);
assert.equal(mixed.length, 1, 'only the scannable URL is fetched; the unrecognized one is kept for reference and does not add a portal entry');
assert.equal(mixed[0].provider, 'lever');

const css = readFileSync(resolve('web', 'static', 'styles.css'), 'utf-8');
assert.match(css, /minmax\(0,\s*1fr\)/, 'long board URLs ellipsis inside a minmax(0, 1fr) track');
assert.match(css, /min-width:\s*0/, 'min-width: 0 lets the ellipsis engage');

const app = readFileSync(resolve('web', 'static', 'app.js'), 'utf-8');
assert.match(app, /targetCompanyList|targetCompanyInput/, 'connections UI has an interactive target-company list');
assert.match(app, /not scannable|not fetched|not scanned/, 'helper text says unrecognized careers sites are stored but not fetched');

console.log('regression_target_companies passed');
