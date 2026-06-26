#!/usr/bin/env node

/**
 * Legacy career-ops dedupe compatibility stub.
 *
 * The old command edited shared-core `applications.md`. Suitor tracker
 * dedupe now happens through profile-local app actions, scan decisions, and
 * runtime suppression state.
 */

console.log('Suitor dedup: legacy shared applications.md dedupe is disabled.');
console.log('Use the Applications UI or profile-local tracker actions so profile data remains isolated.');
process.exit(0);
