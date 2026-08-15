// Score with the selected provider only. Never silently switch to Claude or Codex.

export async function runSelectedScoring({
  provider = '',
  fetched = [],
  runCursor,
  runCodex,
  fallback,
} = {}) {
  const selected = String(provider || '').trim().toLowerCase();
  try {
    if (selected === 'cursor') {
      return await runCursor(fetched);
    }
    if (selected === 'anthropic') {
      throw new Error('Claude scoring is not available in this build; using heuristic fallback. Scores were not taken from Codex.');
    }
    return await runCodex(fetched);
  } catch (err) {
    const reason = err?.message || String(err);
    const message = selected === 'cursor'
      ? `Cursor scoring failed: ${reason} Using heuristic fallback. Scores were not taken from Claude or Codex.`
      : reason;
    return fallback(fetched, message);
  }
}
