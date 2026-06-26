#!/usr/bin/env node

/**
 * Legacy career-ops status normalizer compatibility stub.
 *
 * Suitor status normalization is handled in profile-local tracker parsing
 * and authenticated app actions. This stub prevents accidental shared-core
 * `applications.md` rewrites from the old project layout.
 */

console.log('Suitor normalize: legacy shared applications.md status normalization is disabled.');
console.log('Use profile-local tracker actions so submitted, rejected, interview, and pass states stay isolated.');
process.exit(0);
