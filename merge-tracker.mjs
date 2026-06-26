#!/usr/bin/env node

/**
 * Legacy career-ops merge compatibility stub.
 *
 * Suitor does not merge TSV batches into a shared-core tracker. Tracker
 * writes are profile-local and go through the authenticated app layer.
 */

console.log('Suitor merge: legacy batch tracker merge is disabled.');
console.log('Use profile-local Applications actions or import tooling that writes under the active profile root.');
process.exit(0);
