#!/usr/bin/env node

/**
 * Legacy career-ops CV sync compatibility stub.
 *
 * Suitor reads canonical profile/resume sources from each profile root.
 * The old sync check expected shared-core `cv.md` and `config/profile.yml`,
 * which no longer exist in the shared architecture.
 */

console.log('Suitor sync-check: legacy shared cv.md/profile.yml validation is disabled.');
console.log('Use `npm run doctor` for shared-core health and the Resume Library/Studio for profile-local resume state.');
process.exit(0);
