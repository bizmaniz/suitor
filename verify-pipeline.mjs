#!/usr/bin/env node

/**
 * Legacy career-ops verifier compatibility stub.
 *
 * Suitor stores tracker state inside profile-local markdown/runtime files,
 * not shared-core `applications.md`, `data/`, or `reports/` folders. This
 * command is intentionally non-mutating.
 */

console.log('Suitor verify: legacy career-ops pipeline verification is disabled for shared-core safety.');
console.log('Use `npm run doctor` for read-only shared-core health checks.');
console.log('Use `npm run audit:smoke -- --person Test Candidate --port 8790` or the Test Candidate equivalent for live profile checks.');
process.exit(0);
