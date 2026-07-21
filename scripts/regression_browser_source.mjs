#!/usr/bin/env node

import assert from 'assert/strict';
import { chromium } from 'playwright';
import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const profileRoot = mkdtempSync(join(tmpdir(), 'Suitor-browser-regression-'));
process.env.SUITOR_PROFILE_ROOT = profileRoot;
process.env.SUITOR_PERSON_KEY = 'test';
process.env.SUITOR_CANDIDATE_FIRST = 'Test';
process.env.SUITOR_LINKEDIN_QUERY = '"Chief of Staff" OR "Strategic Operations" remote';
process.env.SUITOR_LINKEDIN_LOCATION = 'United States';
process.env.SUITOR_LINKEDIN_WORKPLACE = '2';
process.env.SUITOR_LINKEDIN_RECENCY = 'r604800';
process.env.SUITOR_LINKEDIN_EXPERIENCE = '4,5,6';
process.env.SUITOR_LINKEDIN_SALARY_BUCKET = '5';

const {
  linkedInSearchUrl,
  linkedInFilterSummary,
  isBlockedSourceResult,
  extractLinkedInJobs,
  classifyLinkedInSessionSnapshot,
  waitForManualLoginClose,
  safeLog,
  parseMoneyAmount,
  compensationRangeFromText,
  isKnownBelowCompFloor,
} = await import('./browser_adapter.mjs');

const appSource = readFileSync(new URL('../web/static/app.js', import.meta.url), 'utf-8');
assert.doesNotMatch(appSource, /hostname\.includes\('linkedin\.com'\)|field\('Link'\)\.includes\('linkedin\.com'\)/);

const url = new URL(linkedInSearchUrl('Chief of Staff founder remote'));
assert.equal(url.hostname, 'www.linkedin.com');
assert.equal(url.pathname, '/jobs/search/');
assert.equal(url.searchParams.get('keywords'), 'Chief of Staff founder remote');
assert.equal(url.searchParams.get('location'), 'United States');
assert.equal(url.searchParams.get('f_WT'), '2');
assert.equal(url.searchParams.get('f_TPR'), 'r604800');
assert.equal(url.searchParams.get('f_E'), '4,5,6');
assert.equal(url.searchParams.get('f_SB2'), '5');

assert.match(linkedInFilterSummary(), /Remote/);
assert.match(linkedInFilterSummary(), /Past week/);
assert.match(linkedInFilterSummary(), /Easy Apply excluded/);

assert.deepEqual(classifyLinkedInSessionSnapshot({
  url: 'https://www.linkedin.com/uas/login',
  hasLoginInput: true,
}).sessionState, 'needs_login');

assert.deepEqual(classifyLinkedInSessionSnapshot({
  url: 'https://www.linkedin.com/checkpoint/challenge/',
  text: 'Quick security check Verify your identity',
}).sessionState, 'blocked');

const loggedInSnapshot = classifyLinkedInSessionSnapshot({
  url: 'https://www.linkedin.com/jobs/search/?keywords=chief',
  text: 'Jobs Top jobs for you Messaging Notifications My Network',
  hasLoggedInNav: true,
  hasJobsSurface: true,
});
assert.equal(loggedInSnapshot.sessionState, 'logged_in');
assert.equal(loggedInSnapshot.searchAllowed, true);

assert.equal(classifyLinkedInSessionSnapshot({
  url: 'https://www.linkedin.com/',
  text: 'Welcome to your professional community',
}).sessionState, 'unknown');

assert.equal(isBlockedSourceResult({
  company: 'Ladders',
  title: 'Chief of Staff',
  location: 'United States',
}), true);

assert.equal(isBlockedSourceResult({
  company: 'Formic',
  title: 'Chief of Staff',
  location: 'United States Remote',
}), false);

assert.equal(parseMoneyAmount('$90K'), 90000);
assert.equal(parseMoneyAmount('$120,000'), 120000);
assert.deepEqual(
  compensationRangeFromText('Compensation Range: $90K - $120K'),
  { min: 90000, max: 120000, text: 'Compensation Range: $90K - $120K' },
);
assert.equal(isKnownBelowCompFloor({
  title: 'Strategic Operations Manager',
  company: 'Example Health',
  location: 'United States',
  jdText: 'Compensation Range: $90K - $120K',
}, { defaultFloor: 145000 }), true);
assert.equal(isKnownBelowCompFloor({
  title: 'Program Lead',
  company: 'Example Labs',
  location: 'West Coast',
  jdText: 'Base salary range: $150K - $180K',
}, { defaultFloor: 145000 }), false);
assert.equal(isKnownBelowCompFloor({
  title: 'Program Lead',
  company: 'Example Labs',
  location: 'Remote - United States',
  jdText: 'Base salary range: $185K - $220K',
}, { defaultFloor: 145000 }), false);
assert.equal(isKnownBelowCompFloor({
  title: 'Program Lead',
  company: 'Example Labs',
  location: 'Remote - United States',
  jdText: 'Compensation not listed.',
}, { defaultFloor: 145000 }), false);

const rawLaunchLog = `\u001b[2mbrowserType.launchPersistentContext: Opening in existing browser session.
Call log:
  - <launching> chrome.exe --password-store=basic --user-data-dir=${profileRoot}\\browser\\chromium-profile --remote-debugging-pipe about:blank
  - <launched> pid=12345\u001b[22m`;
const cleanedLaunchLog = safeLog(rawLaunchLog);
assert.match(cleanedLaunchLog, /Details suppressed/);
assert.doesNotMatch(cleanedLaunchLog, /--user-data-dir=/);
assert.doesNotMatch(cleanedLaunchLog, /password-store=basic/);
assert.doesNotMatch(cleanedLaunchLog, /12345/);
assert.doesNotMatch(cleanedLaunchLog, /\u001b\[/);
assert.equal(safeLog(cleanedLaunchLog), cleanedLaunchLog);
assert.equal((safeLog(`${cleanedLaunchLog} ${cleanedLaunchLog}`).match(/Details suppressed/g) || []).length, 1);

const cleanedLegacyLog = safeLog('Suitor opened C:\\Users\\you\\Suitor Profile\\.suitor-runtime\\browser\\latest.png');
assert.match(cleanedLegacyLog, /Suitor/);
assert.doesNotMatch(cleanedLegacyLog, /\.suitor-runtime/i);

const longDescription = `
This founder-adjacent Chief of Staff role supports the CEO through operating cadence,
strategic operations, cross-functional execution, internal tooling, decision support,
board-ready follow-through, GTM coordination, finance partnership, product launch
planning, and ambiguous initiative ownership. The role needs a senior operator who
can turn messy priorities into executable motion while preserving relationship
signal and building useful AI-enabled leverage.
`.repeat(5);
const descriptionLiteral = JSON.stringify(longDescription);

const context = await chromium.launchPersistentContext(join(profileRoot, 'chromium-dom-test'), {
  headless: true,
  viewport: { width: 1280, height: 900 },
});
const page = context.pages()[0] || await context.newPage();
await page.setContent(`
  <html>
    <body>
      <ul>
        <li data-job-id="111">
          <a href="https://www.linkedin.com/jobs/view/111" onclick="event.preventDefault(); selectJob('apply');">Chief of Staff</a>
          <div>Formic</div>
          <div>Remote - United States</div>
        </li>
        <li data-job-id="222">
          <a href="https://www.linkedin.com/jobs/view/222" onclick="event.preventDefault(); selectJob('easy');">Chief of Staff to CTO</a>
          <div>Machinify</div>
          <div>Remote - United States</div>
          <button>Easy Apply</button>
        </li>
        <li data-job-id="333">
          <a href="https://www.linkedin.com/jobs/view/333" onclick="event.preventDefault(); selectJob('blocked');">Chief of Staff</a>
          <div>Ladders</div>
          <div>Remote - United States</div>
        </li>
      </ul>
      <main class="jobs-details__main-content">
        <h1 class="jobs-unified-top-card__job-title">Chief of Staff</h1>
        <div class="jobs-unified-top-card__company-name">Formic</div>
        <span class="jobs-unified-top-card__bullet">Remote - United States</span>
        <button id="applyButton">Apply</button>
        <section class="jobs-description">${longDescription}</section>
      </main>
      <script>
        function selectJob(kind) {
          const title = document.querySelector('h1');
          const company = document.querySelector('.jobs-unified-top-card__company-name');
          const button = document.querySelector('#applyButton');
          const description = document.querySelector('.jobs-description');
          if (kind === 'easy') {
            title.innerText = 'Chief of Staff to CTO';
            company.innerText = 'Machinify';
            button.innerText = 'Easy Apply';
            description.innerText = ${descriptionLiteral};
          } else if (kind === 'blocked') {
            title.innerText = 'Chief of Staff';
            company.innerText = 'Ladders';
            button.innerText = 'Apply';
            description.innerText = ${descriptionLiteral};
          } else {
            title.innerText = 'Chief of Staff';
            company.innerText = 'Formic';
            button.innerText = 'Apply';
            description.innerText = ${descriptionLiteral};
          }
        }
      </script>
    </body>
  </html>
`);
const extracted = await extractLinkedInJobs(page, 5);
await context.close();

assert.equal(extracted.length, 1);
assert.equal(extracted[0].title, 'Chief of Staff');
assert.equal(extracted[0].company, 'Formic');
assert.equal(extracted[0].applyType, 'Apply');
assert.match(extracted[0].jdText, /founder-adjacent Chief of Staff role/);
assert.ok(extracted[0].jdText.length > 900);

const loginContext = await chromium.launchPersistentContext(join(profileRoot, 'chromium-login-test'), {
  headless: true,
  viewport: { width: 1280, height: 900 },
});
const loginPage = loginContext.pages()[0] || await loginContext.newPage();
await loginPage.setContent('<html><body><input name="session_key"><input name="session_password"></body></html>');
const loginStatuses = [];
setTimeout(() => {
  loginPage.setContent('<html><body><a href="https://www.linkedin.com/feed/">Feed</a><a href="https://www.linkedin.com/jobs/view/444">Chief of Staff</a><nav>Messaging Notifications My Network</nav></body></html>').catch(() => {});
}, 100);
setTimeout(() => {
  loginPage.close().catch(() => {});
}, 500);
const finalLoginDiagnostics = await waitForManualLoginClose(
  loginPage,
  classifyLinkedInSessionSnapshot({ url: 'https://www.linkedin.com/uas/login', hasLoginInput: true }),
  { intervalMs: 25, captureScreenshot: false, emitStatus: entry => loginStatuses.push(entry) },
);
await loginContext.close();

assert.equal(finalLoginDiagnostics.sessionState, 'logged_in');
assert.ok(loginStatuses.some(entry => entry.sessionState === 'logged_in'));

rmSync(profileRoot, { recursive: true, force: true });
console.log('browser source regression passed');
