#!/usr/bin/env node

import assert from 'assert/strict';
import { createServer } from 'http';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';

const profileRoot = mkdtempSync(join(tmpdir(), 'Suitor-verify-regression-'));
process.env.SUITOR_PROFILE_ROOT = profileRoot;
process.env.SUITOR_PERSON_KEY = 'test';
process.env.SUITOR_PORT = '0';
process.env.SUITOR_CANDIDATE_NAME = 'Test Candidate';
process.env.SUITOR_CANDIDATE_FIRST = 'Test';
process.env.SUITOR_ASSISTANT_NAME = 'Tester';
process.env.SUITOR_BROWSER_RECOVERY = '1';

const {
  classifyFetchedJobPage,
  classifyFetchFailure,
  browserRecoverJobPage,
  browserResults,
  fetchCandidate,
  filterSuppressedOffers,
  fallbackScoring,
  rowIsInvestigation,
  writeReport,
} = await import('./verified_scan.mjs');

mkdirSync(profileRoot, { recursive: true });
writeFileSync(resolve(profileRoot, 'Candidate Search Profile.json'), JSON.stringify({
  scoring: {
    thresholds: { shortlist: 82, manual_review_min: 65, reject_below: 65 },
    hardFilters: {
      excludeKeywords: ['commission-only'],
      automaticRejections: ['unpaid trial'],
      manualReviewCriteria: ['equity-heavy compensation'],
    },
  },
}, null, 2), 'utf-8');

const longJobBody = `
Chief of Staff to the CEO
This role owns strategic operations, operating cadence, cross-functional execution,
decision support, stakeholder alignment, and executive follow-through. Responsibilities
include preparing business reviews, translating ambiguous founder priorities into
workable operating plans, partnering with GTM and product leaders, and improving the
systems that keep the company moving. Qualifications include experience with founder-led
companies, strategic initiatives, business operations, and clear written communication.
Compensation includes salary, bonus, and equity. Apply through the company job portal.
`.repeat(3);

const live = classifyFetchedJobPage({
  offer: { title: 'Chief of Staff to the CEO' },
  status: 200,
  ok: true,
  readableText: longJobBody,
});
assert.equal(live.verificationState, 'LIVE');
assert.match(live.verificationReason, /fetched \d+ characters/);
assert.ok(live.text.length > 900);

const jsRendered = classifyFetchedJobPage({
  offer: { title: 'Chief of Staff to the CEO' },
  status: 200,
  ok: true,
  readableText: '<div id="root"></div>',
});
assert.equal(jsRendered.verificationState, 'JS-RENDERED');
assert.equal(jsRendered.text, '');

const redirected = classifyFetchedJobPage({
  offer: { title: 'Chief of Staff to the CEO' },
  status: 200,
  ok: true,
  redirected: true,
  finalUrl: 'https://example.com/careers',
  readableText: 'Careers home',
});
assert.equal(redirected.verificationState, 'REDIRECTED');
assert.match(redirected.verificationReason, /redirected/);

const dead = classifyFetchedJobPage({
  offer: { title: 'Chief of Staff to the CEO' },
  status: 404,
  ok: false,
  readableText: 'Not found',
});
assert.equal(dead.verificationState, 'DEAD');

const timeout = classifyFetchFailure({
  offer: { title: 'Chief of Staff to the CEO' },
  error: { name: 'AbortError', message: 'aborted' },
});
assert.equal(timeout.verificationState, 'TIMEOUT');

async function withJsRenderedJobServer(fn) {
  const renderedBody = `Chief of Staff to the CEO
This rendered-only job description asks for executive cadence, strategic operations,
cross-functional execution, founder support, board-ready decision support, decision
systems, business operations, and operating rhythms. Qualifications include senior
operator experience, strong writing, clear judgment, stakeholder alignment, and
comfort building internal AI-enabled tooling. Compensation includes salary, bonus,
and equity. Apply through the company portal.
`.repeat(4);
  const server = createServer((req, res) => {
    if (req.url !== '/job') {
      res.writeHead(404);
      res.end('not found');
      return;
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(`<!doctype html><html><body><div id="root">Loading</div><script>
      setTimeout(() => { document.getElementById('root').innerText = ${JSON.stringify(renderedBody)}; }, 50);
    </script></body></html>`);
  });
  await new Promise(resolveServer => server.listen(0, '127.0.0.1', resolveServer));
  try {
    const { port } = server.address();
    await fn(`http://127.0.0.1:${port}/job`);
  } finally {
    await new Promise(resolveClose => server.close(resolveClose));
  }
}

await withJsRenderedJobServer(async url => {
  const recovered = await browserRecoverJobPage({ title: 'Chief of Staff to the CEO', url });
  assert.equal(recovered.verificationState, 'LIVE');
  assert.equal(recovered.recovered, true);
  assert.match(recovered.recoveryReason, /BROWSER-RECOVERY/);
  assert.match(recovered.text, /rendered-only job description/);

  const fetchedRecovered = await fetchCandidate({ title: 'Chief of Staff to the CEO', company: 'Rendered Example', url });
  assert.equal(fetchedRecovered.verificationState, 'LIVE');
  assert.equal(fetchedRecovered.httpStatus, 'browser');
  assert.match(fetchedRecovered.verificationReason, /BROWSER-RECOVERY/);
  assert.match(fetchedRecovered.text, /executive cadence/);
});

const failedLinkedIn = classifyFetchFailure({
  offer: { source: 'linkedin-browser', browserSnippet: 'LinkedIn visible role card' },
  error: { name: 'TypeError', message: 'network failed' },
});
assert.equal(failedLinkedIn.verificationState, 'JS-RENDERED');
assert.match(failedLinkedIn.text, /LinkedIn visible role card/);

const browserRuntime = resolve(profileRoot, '.suitor-runtime', 'browser');
mkdirSync(browserRuntime, { recursive: true });
const linkedinDetailText = `
Chief of Staff
Company: Example AI
Location: Remote - US
Apply button: Apply
About the role
This founder-adjacent operator role supports the CEO with executive cadence,
strategic operations, cross-functional execution, board-ready decision support,
operating rhythms, follow-through systems, internal tooling, and ambiguous
initiative ownership. The role partners across product, GTM, finance, and
customer leadership to translate priorities into execution and improve the
systems that keep the company moving.
Qualifications include senior operator experience in founder-led companies,
excellent writing, judgment, systems thinking, and comfort with AI-enabled
internal workflows. Compensation includes salary, bonus, and equity.
`.repeat(3);

writeFileSync(resolve(browserRuntime, 'linkedin-results.json'), JSON.stringify({
  generatedAt: new Date().toISOString(),
  query: 'Chief of Staff',
  results: [{
    title: 'Chief of Staff',
    company: 'Example AI',
    location: 'Remote - US',
    url: 'https://www.linkedin.com/jobs/view/1234567890',
    applyType: 'Apply',
    jdText: linkedinDetailText,
  }],
}, null, 2));

const activeBrowserResults = browserResults();
assert.equal(activeBrowserResults.length, 1);
assert.equal(activeBrowserResults[0].source, 'linkedin-browser');
assert.match(activeBrowserResults[0].browserSnippet, /founder-adjacent operator role/);

const fetchedLinkedIn = await fetchCandidate(activeBrowserResults[0]);
assert.equal(fetchedLinkedIn.verificationState, 'LIVE');
assert.equal(fetchedLinkedIn.httpStatus, 'browser');
assert.match(fetchedLinkedIn.verificationReason, /LINKEDIN-BROWSER/);
assert.match(fetchedLinkedIn.text, /Browser-extracted LinkedIn job detail/);

writeFileSync(resolve(browserRuntime, 'linkedin-results.json'), JSON.stringify({
  generatedAt: new Date().toISOString(),
  consumedAt: new Date().toISOString(),
  results: [{
    title: 'Consumed Role',
    url: 'https://www.linkedin.com/jobs/view/999',
  }],
}, null, 2));
assert.deepEqual(browserResults(), []);
assert.ok(existsSync(resolve(browserRuntime, 'linkedin-results.json')));

writeFileSync(resolve(browserRuntime, 'linkedin-results.json'), JSON.stringify({
  generatedAt: new Date().toISOString(),
  clearedAt: new Date().toISOString(),
  clearedReason: 'User cleared Browser Activity cards.',
  results: [{
    title: 'Cleared Role',
    url: 'https://www.linkedin.com/jobs/view/998',
  }],
}, null, 2));
assert.deepEqual(browserResults(), []);

const scanStatePath = resolve(profileRoot, '.suitor-runtime', 'scan-state.json');
writeFileSync(scanStatePath, JSON.stringify({
  decisions: [{
    decision: 'passed',
    title: 'Chief of Staff - Breef',
    company: 'Breef',
    role: 'Chief of Staff',
    reason: 'User passed because the role is in-office Denver.',
    decidedAt: new Date().toISOString(),
  }],
}, null, 2), 'utf-8');

const suppressedBuiltIn = filterSuppressedOffers([
  {
    title: 'Chief of Staff - BuiltIn',
    company: 'BuiltIn',
    role: 'Chief of Staff',
    url: 'https://builtin.com/job/chief-of-staff-placeholder',
  },
  {
    title: 'Director of Strategic Operations - BuiltIn',
    company: 'BuiltIn',
    role: 'Director of Strategic Operations',
    url: 'https://builtin.com/job/director-strategic-operations-placeholder',
  },
]);
assert.equal(suppressedBuiltIn.suppressed.length, 1);
assert.match(suppressedBuiltIn.suppressed[0].offer.title, /Chief of Staff - BuiltIn/);
assert.equal(suppressedBuiltIn.offers.length, 1);
assert.match(suppressedBuiltIn.offers[0].title, /Director of Strategic Operations/);

const hardFiltered = filterSuppressedOffers([
  {
    title: 'Chief of Staff - commission-only',
    company: 'Example Sales',
    role: 'Chief of Staff',
    url: 'https://example.com/commission-only',
  },
  {
    title: 'Chief of Staff to the COO',
    company: 'Example Ops',
    role: 'Chief of Staff',
    url: 'https://example.com/chief-of-staff',
  },
]);
assert.equal(hardFiltered.suppressed.length, 1);
assert.equal(hardFiltered.suppressed[0].hardFilter, 'commission-only');
assert.equal(hardFiltered.offers.length, 1);

const realCompanyAfterPlaceholderPass = filterSuppressedOffers([
  {
    title: 'Chief of Staff to the Chief Product Officer',
    company: 'Carta',
    role: 'Chief of Staff to the Chief Product Officer',
    url: 'https://job-boards.greenhouse.io/carta/jobs/7743056003',
  },
  {
    title: 'Chief of Staff to CEO',
    company: 'Replit',
    role: 'Chief of Staff to CEO',
    url: 'https://jobs.ashbyhq.com/replit/95332816-5890-4fac-b5fc-4b0cea0d77db',
  },
]);
assert.equal(realCompanyAfterPlaceholderPass.suppressed.length, 0);
assert.equal(realCompanyAfterPlaceholderPass.offers.length, 2);

const withheldFetched = {
  title: 'Chief of Staff',
  company: 'Ashby Example',
  url: 'https://jobs.ashbyhq.com/example/chief-of-staff',
  location: 'Remote - US',
  httpStatus: 200,
  verificationState: 'JS-RENDERED',
  verificationReason: 'HTTP 200; static fetch did not expose enough readable JD body.',
  durationMs: 42,
  text: '',
};
const fallback = fallbackScoring([withheldFetched], 'regression forced fallback');
assert.equal(fallback.rows.length, 1);
assert.equal(fallback.rows[0].score, null);
assert.equal(fallback.rows[0].scoreBreakdown, 'withheld - needs full JD');
assert.equal(rowIsInvestigation(fallback.rows[0]), true);
const reportPath = writeReport(fallback, [withheldFetched]);
const report = readFileSync(reportPath, 'utf-8');
assert.match(report, /## Needs Verification/);
assert.match(report, /Chief of Staff - Ashby Example/);
assert.match(report, /Score:\*\* withheld - needs full JD/);
assert.doesNotMatch(report, /## Not Shortlisted[\s\S]*Chief of Staff - Ashby Example/);

rmSync(profileRoot, { recursive: true, force: true });
console.log('verified classification regression passed');
