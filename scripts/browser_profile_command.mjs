export function isSuitorBrowserProfileCommand(command, profileDir) {
  const cmd = String(command || '');
  const profile = String(profileDir || '').replace(/[\\/]+$/, '');
  if (!cmd || !profile) return false;
  if (!/(?:chrome|chromium|msedge)/i.test(cmd)) return false;
  const lower = cmd.toLowerCase();
  const flag = '--user-data-dir';
  let from = 0;
  while (from < lower.length) {
    const idx = lower.indexOf(flag, from);
    if (idx < 0) return false;
    const afterFlag = cmd.slice(idx + flag.length);
    if (afterFlag && !/^[\s=]/.test(afterFlag)) {
      from = idx + flag.length;
      continue;
    }
    const after = afterFlag.replace(/^[\s=]+/, '');
    const quoted = after.match(/^"([^"]+)"|^'([^']+)'|^(\S+)/);
    if (!quoted) return false;
    const value = String(quoted[1] || quoted[2] || quoted[3] || '').replace(/[\\/]+$/, '');
    if (value.toLowerCase() === profile.toLowerCase()) return true;
    from = idx + flag.length;
  }
  return false;
}

export function posixBrowserProfileProcessIds(psStdout, profileDir, currentPid) {
  return String(psStdout || '')
    .split(/\r?\n/)
    .flatMap(line => {
      const trimmed = line.trim();
      if (!trimmed) return [];
      const match = trimmed.match(/^(\d+)\s+(.*)$/);
      if (!match) return [];
      const pid = Number(match[1]);
      if (!Number.isFinite(pid) || pid <= 0 || pid === currentPid) return [];
      if (!isSuitorBrowserProfileCommand(match[2], profileDir)) return [];
      return [pid];
    });
}
