// Score with the selected provider only. Never silently switch to another paid vendor.

export async function runSelectedScoring({
  provider = '',
  fetched = [],
  runCursor,
  runClaude,
  runCodex,
  fallback,
} = {}) {
  const selected = String(provider || '').trim().toLowerCase();
  try {
    if (selected === 'cursor') {
      return await runCursor(fetched);
    }
    if (selected === 'anthropic') {
      if (typeof runClaude !== 'function') {
        throw new Error('Claude scoring is not available in this build; using heuristic fallback. Scores were not taken from Codex or Cursor.');
      }
      return await runClaude(fetched);
    }
    return await runCodex(fetched);
  } catch (err) {
    const reason = err?.message || String(err);
    const message = selected === 'cursor'
      ? `Cursor scoring failed: ${reason} Using heuristic fallback. Scores were not taken from Claude or Codex.`
      : selected === 'anthropic'
        ? `Claude scoring failed: ${reason} Using heuristic fallback. Scores were not taken from Codex or Cursor.`
        : `Codex scoring failed: ${reason} Using heuristic fallback. Scores were not taken from Claude or Cursor.`;
    return fallback(fetched, message);
  }
}
