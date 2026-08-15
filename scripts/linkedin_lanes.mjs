// LinkedIn search lanes: short phrases run one at a time, not one boolean chain.
// `limit` is a per-lane quota. Every lane always runs.

export const MAX_SEARCH_LANES = 14;

export function splitQueries(value) {
  const parts = String(value || '')
    .split(/[;\n]+/)
    .map(part => part.trim())
    .filter(Boolean);
  const seen = new Set();
  const unique = [];
  for (const part of parts) {
    const key = part.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(part);
  }
  return unique.slice(0, MAX_SEARCH_LANES);
}

function linkedInJobKey(row = {}) {
  return String(row.url || row.title || '').trim();
}

function companyWords(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .filter(word => !/^(inc|llc|ltd|limited|corp|corporation|co|gmbh|sa|plc)$/.test(word));
}

function isWordPrefix(prefix, words) {
  return prefix.length <= words.length && prefix.every((word, index) => word === words[index]);
}

export function companyMatches(rowCompany, target) {
  const row = companyWords(rowCompany);
  const want = companyWords(target);
  if (!row.length || !want.length) return false;
  return isWordPrefix(want, row) || isWordPrefix(row, want);
}

// searchFn(query, perLane) -> { results, inspectedUniqueCount, skippedBelowComp, filters }
// Every lane is searched even when the merged count already exceeds perLane.
export async function runSearchLanes(lanes_, perLane, searchFn, onLog = () => {}) {
  const merged = [];
  const skippedBelowComp = [];
  const seen = new Set();
  const lanes = [];
  let filters = '';
  let inspected = 0;
  const logs = [];
  const label = lane => (lane.company ? `${lane.query} [company]` : lane.query);
  const log = message => {
    logs.push(message);
    onLog(message);
  };
  log(`LinkedIn lane plan (${lanes_.length} searches, up to ${perLane} results each)`);
  for (const [index, lane] of lanes_.entries()) {
    log(`LinkedIn lane ${index + 1}/${lanes_.length}: ${label(lane)}`);
    const payload = await searchFn(lane.query, perLane) || {};
    filters = payload.filters || filters;
    inspected += Number(payload.inspectedUniqueCount || 0);
    for (const row of payload.skippedBelowComp || []) skippedBelowComp.push(row);
    let fresh = 0;
    let offCompany = 0;
    for (const row of payload.results || []) {
      if (lane.company && !companyMatches(row.company, lane.company)) {
        offCompany += 1;
        continue;
      }
      const key = linkedInJobKey(row) || row.url || row.title;
      if (!key || seen.has(key)) continue;
      seen.add(key);
      merged.push(row);
      fresh += 1;
    }
    lanes.push({ query: lane.query, company: lane.company || '', found: payload.results?.length || 0, fresh, offCompany });
    log(`LinkedIn lane ${index + 1}/${lanes_.length} done: ${label(lane)} returned ${payload.results?.length || 0} result(s), ${fresh} new after dedupe. Running total ${merged.length}.`);
  }
  log(`LinkedIn lane search saved ${merged.length} unique candidate results across ${lanes.length}/${lanes_.length} lanes`);
  return {
    results: merged,
    lanes,
    inspectedUniqueCount: inspected,
    skippedBelowComp,
    filters,
    query: lanes_.map(lane => lane.query).join(' ; '),
    logs,
  };
}
