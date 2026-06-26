import { existsSync, readFileSync } from 'fs';

export function delay(ms) {
  return new Promise(resolveDelay => setTimeout(resolveDelay, ms));
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 3000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function serverHasListened(output, port) {
  const escapedPort = String(port).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`web app listening on http://127\\.0\\.0\\.1:${escapedPort}`).test(output || '');
}

export async function waitForSuitorServer({
  port,
  tokenPath,
  child,
  getOutput = () => '',
  timeoutMs = 60000,
}) {
  const deadline = Date.now() + timeoutMs;
  let delayMs = 100;
  let lastProbe = 'not started';

  while (Date.now() < deadline) {
    if (child.exitCode != null) throw new Error(`server exited early with ${child.exitCode}`);

    let token = '';
    if (existsSync(tokenPath)) token = readFileSync(tokenPath, 'utf-8').trim();

    if (token) {
      try {
        const res = await fetchWithTimeout(`http://127.0.0.1:${port}/`, {}, 3000);
        lastProbe = `GET / -> ${res.status}`;
        if (res.status === 200) return token;
      } catch (err) {
        lastProbe = `GET / -> ${err.name || err.message}`;
      }

      if (serverHasListened(getOutput(), port)) return token;
    } else if (serverHasListened(getOutput(), port)) {
      lastProbe = 'server listened but token was not written yet';
    }

    await delay(delayMs);
    delayMs = Math.min(Math.ceil(delayMs * 1.35), 1000);
  }

  throw new Error(`server did not become ready within ${timeoutMs}ms; last probe: ${lastProbe}`);
}
