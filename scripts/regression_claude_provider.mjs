#!/usr/bin/env node
// Behavior tests for provider routing and Claude text-only scoring.
// Mocks spawn. Never calls a real Claude, Codex, or Cursor API.

import assert from 'assert/strict';
import {
  claudeBinFrom,
  claudeTextOnlyArgs,
  runClaudeScoringBatches,
  scoringBatchFromEnv,
  scoringModelFromEnv,
} from '../web/claude_cli.mjs';
import { runSelectedScoring } from '../web/llm_routing.mjs';

const fetched = [{ title: 'Role', company: 'Acme', url: 'https://example.com' }];

function fallback(rows, reason) {
  return { rows: rows.map(() => ({ score: null })), notes: reason };
}

// --- model / path / batch routing ---
assert.equal(scoringModelFromEnv({}), 'sonnet');
assert.equal(scoringModelFromEnv({ SUITOR_SCORING_MODEL: 'haiku' }), 'haiku');
assert.equal(scoringModelFromEnv({ SUITOR_SCORING_MODEL: '  opus  ' }), 'opus');
assert.equal(scoringBatchFromEnv({}), 10);
assert.equal(scoringBatchFromEnv({ SUITOR_SCORING_BATCH: '4' }), 4);
assert.equal(scoringBatchFromEnv({ SUITOR_SCORING_BATCH: '25' }), 25);
assert.equal(scoringBatchFromEnv({ SUITOR_SCORING_BATCH: '3' }), 4, 'batch floor is 4');
assert.equal(scoringBatchFromEnv({ SUITOR_SCORING_BATCH: '99' }), 25, 'batch ceiling is 25');
assert.equal(scoringBatchFromEnv({ SUITOR_SCORING_BATCH: 'nope' }), 10);
assert.equal(claudeBinFrom({}, {}), 'claude');
assert.equal(claudeBinFrom({ llm: { claudeBin: '/opt/claude' } }, {}), '/opt/claude');
assert.equal(claudeBinFrom({}, { SUITOR_CLAUDE_BIN: '/usr/local/bin/claude' }), '/usr/local/bin/claude');
assert.equal(claudeBinFrom({ llm: { claudeBin: '/opt/claude' } }, { SUITOR_CLAUDE_BIN: '/ignored' }), '/opt/claude');

// --- safe Claude command options ---
const defaultArgs = claudeTextOnlyArgs();
assert.deepEqual(defaultArgs.slice(0, 4), ['-p', '--tools', '', '--no-session-persistence']);
assert.equal(defaultArgs.includes('--model'), false);
assert.equal(defaultArgs.includes('--continue'), false);
assert.equal(defaultArgs.includes('--allowedTools'), false);
assert.equal(defaultArgs.includes('--add-dir'), false);
const modeled = claudeTextOnlyArgs({ model: 'sonnet' });
assert.deepEqual(modeled, ['-p', '--tools', '', '--no-session-persistence', '--model', 'sonnet']);

// --- successful Claude output, including batching and configured bin/model ---
const calls = [];
const ok = runClaudeScoringBatches({
  fetched: [{ title: 'One' }, { title: 'Two' }, { title: 'Three' }],
  spawnSyncImpl: (bin, args, options) => {
    calls.push({ bin, args, input: options.input, cwd: options.cwd });
    const titles = JSON.parse(options.input).map(item => item.title);
    return {
      status: 0,
      stdout: JSON.stringify({
        rows: titles.map(title => ({ title, score: 80 })),
        notes: `batch-${titles.join('+')}`,
      }),
      stderr: '',
    };
  },
  bin: '/opt/claude',
  model: 'haiku',
  batchSize: 2,
  cwd: '/tmp/profile',
  env: { PATH: '/usr/bin' },
  buildPrompt: batch => JSON.stringify(batch),
  extractJson: text => JSON.parse(text),
});
assert.equal(calls.length, 2, 'three roles at batch size 2 should make two Claude calls');
assert.equal(calls[0].bin, '/opt/claude');
assert.deepEqual(calls[0].args, ['-p', '--tools', '', '--no-session-persistence', '--model', 'haiku']);
assert.equal(calls[0].cwd, '/tmp/profile');
assert.equal(ok.rows.length, 3);
assert.deepEqual(ok.rows.map(row => row.title), ['One', 'Two', 'Three']);
assert.match(ok.notes, /batch-One\+Two/);
assert.match(ok.notes, /batch-Three/);

// --- Claude failure stays local (the scoring helper throws; routing wraps fallback) ---
assert.throws(() => runClaudeScoringBatches({
  fetched,
  spawnSyncImpl: () => ({ status: 1, stdout: '', stderr: 'claude missing' }),
  bin: 'claude',
  model: 'sonnet',
  batchSize: 10,
  cwd: '/tmp',
  env: {},
  buildPrompt: () => 'prompt',
  extractJson: text => JSON.parse(text),
}), /claude missing|exited with status/);

// --- provider routing: each vendor, success, and no hop on failure ---
let cursorCalls = 0;
let claudeCalls = 0;
let codexCalls = 0;
const reset = () => { cursorCalls = 0; claudeCalls = 0; codexCalls = 0; };
const runners = {
  runCursor: async () => { cursorCalls += 1; return { notes: 'cursor' }; },
  runClaude: async () => { claudeCalls += 1; return { notes: 'claude' }; },
  runCodex: async () => { codexCalls += 1; return { notes: 'codex' }; },
  fallback,
};

reset();
const cursorOk = await runSelectedScoring({ provider: 'cursor', fetched, ...runners });
assert.equal(cursorOk.notes, 'cursor');
assert.deepEqual([cursorCalls, claudeCalls, codexCalls], [1, 0, 0]);

reset();
const claudeOk = await runSelectedScoring({ provider: 'anthropic', fetched, ...runners });
assert.equal(claudeOk.notes, 'claude');
assert.deepEqual([cursorCalls, claudeCalls, codexCalls], [0, 1, 0]);

reset();
const openaiOk = await runSelectedScoring({ provider: 'openai', fetched, ...runners });
assert.equal(openaiOk.notes, 'codex');
assert.deepEqual([cursorCalls, claudeCalls, codexCalls], [0, 0, 1]);

reset();
const defaultOk = await runSelectedScoring({ provider: '', fetched, ...runners });
assert.equal(defaultOk.notes, 'codex');
assert.deepEqual([cursorCalls, claudeCalls, codexCalls], [0, 0, 1]);

reset();
const cursorFail = await runSelectedScoring({
  provider: 'cursor',
  fetched,
  runCursor: async () => { cursorCalls += 1; throw new Error('cursor down'); },
  runClaude: async () => { claudeCalls += 1; throw new Error('claude should not run'); },
  runCodex: async () => { codexCalls += 1; throw new Error('codex should not run'); },
  fallback,
});
assert.deepEqual([cursorCalls, claudeCalls, codexCalls], [1, 0, 0]);
assert.match(cursorFail.notes, /Cursor scoring failed/);
assert.match(cursorFail.notes, /not taken from Claude or Codex/);

reset();
const claudeFail = await runSelectedScoring({
  provider: 'anthropic',
  fetched,
  runCursor: async () => { cursorCalls += 1; throw new Error('cursor should not run'); },
  runClaude: async () => { claudeCalls += 1; throw new Error('claude down'); },
  runCodex: async () => { codexCalls += 1; throw new Error('codex should not run'); },
  fallback,
});
assert.deepEqual([cursorCalls, claudeCalls, codexCalls], [0, 1, 0]);
assert.match(claudeFail.notes, /Claude scoring failed/);
assert.match(claudeFail.notes, /not taken from Codex or Cursor/);

reset();
const openaiFail = await runSelectedScoring({
  provider: 'openai',
  fetched,
  runCursor: async () => { cursorCalls += 1; throw new Error('cursor should not run'); },
  runClaude: async () => { claudeCalls += 1; throw new Error('claude should not run'); },
  runCodex: async () => { codexCalls += 1; throw new Error('codex down'); },
  fallback,
});
assert.deepEqual([cursorCalls, claudeCalls, codexCalls], [0, 0, 1]);
assert.match(openaiFail.notes, /Codex scoring failed/);
assert.match(openaiFail.notes, /not taken from Claude or Cursor/);

console.log('regression_claude_provider passed');
