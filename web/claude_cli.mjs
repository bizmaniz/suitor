// Text-only Claude CLI helpers for scoring and tailoring.
// Print mode, tools off, no session file. Not a lingering Claude session.

export function claudeTextOnlyArgs({ model = '' } = {}) {
  const args = ['-p', '--tools', '', '--no-session-persistence'];
  const normalized = String(model || '').trim();
  if (normalized) args.push('--model', normalized);
  return args;
}

export function scoringModelFromEnv(env = process.env) {
  return String(env.SUITOR_SCORING_MODEL || 'sonnet').trim() || 'sonnet';
}

export function scoringBatchFromEnv(env = process.env) {
  return Math.max(4, Math.min(Number(env.SUITOR_SCORING_BATCH || 10) || 10, 25));
}

export function claudeBinFrom(config = {}, env = process.env) {
  return String(config.llm?.claudeBin || env.SUITOR_CLAUDE_BIN || 'claude').trim() || 'claude';
}

export function runClaudeTextPrompt({
  spawnSyncImpl,
  bin,
  model = '',
  input = '',
  cwd,
  env,
  timeout = 5 * 60 * 1000,
  maxBuffer = 30 * 1024 * 1024,
} = {}) {
  if (typeof spawnSyncImpl !== 'function') throw new Error('Claude scoring needs a spawnSync implementation.');
  const result = spawnSyncImpl(bin, claudeTextOnlyArgs({ model }), {
    cwd,
    input,
    encoding: 'utf-8',
    env,
    maxBuffer,
    timeout,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error([result.stderr, result.stdout].filter(Boolean).join('\n\n').slice(0, 400) || `Claude exited with status ${result.status}`);
  }
  return result.stdout;
}

export function runClaudeScoringBatches({
  fetched = [],
  spawnSyncImpl,
  bin,
  model,
  batchSize,
  cwd,
  env,
  buildPrompt,
  extractJson,
} = {}) {
  if (!fetched.length) return { rows: [], notes: 'No new roles cleared local scan and tracker dedupe.' };
  const size = batchSize;
  const rows = [];
  const notes = [];
  const batchCount = Math.ceil(fetched.length / size);
  for (let start = 0; start < fetched.length; start += size) {
    const batch = fetched.slice(start, start + size);
    console.log(`Scoring batch ${Math.floor(start / size) + 1}/${batchCount} (${batch.length} roles) with ${model}...`);
    const output = runClaudeTextPrompt({
      spawnSyncImpl,
      bin,
      model,
      input: buildPrompt(batch),
      cwd,
      env,
    });
    const parsed = extractJson(output);
    rows.push(...(parsed.rows || []));
    if (parsed.notes) notes.push(parsed.notes);
  }
  return { rows, notes: notes.join(' ') };
}
