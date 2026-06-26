# Troubleshooting

## Wrong Node Version

Suitor needs Node 22.5 or newer because it uses `node:sqlite`.

```bash
node --version
```

Install a newer Node, then rerun `npm install`.

## CLI Not Found

Check:

```bash
codex --version
claude --version
```

You need one of them. If installed somewhere unusual, set `SUITOR_CODEX_BIN` or `SUITOR_CLAUDE_BIN`.

## CLI Login Probe Fails

Run the CLI login command directly:

```bash
codex login
claude login
```

Then restart Suitor.

## Port In Use

Change the port in `suitor.config.json` or set:

```bash
SUITOR_PORT=8788 npm start
```

PowerShell:

```powershell
$env:SUITOR_PORT="8788"; npm start
```

## Cannot Unlock

Read the token file:

```bash
cat "<profile root>/.suitor-runtime/local.app-token"
```

Use that value in the unlock dialog.

## Playwright Browser Missing

Install Chromium:

```bash
npx playwright install chromium
```

## Empty Scan Results

- Finish Tier 1 onboarding.
- Check `docs/SOURCES.md`.
- Confirm `<profile root>/portals.yml` exists.
- Add RSS feeds or target companies in the wizard.
- Keep web search disabled unless you need it.

## Database Locked

Stop duplicate Suitor servers, wait a few seconds, and restart. The database is `<profile root>/.suitor-runtime/suitor.sqlite`.

## Tailoring Is Disabled

Finish Tier 2 intake and upload a resume. Scanning unlocks at Tier 1; tailored materials unlock at Tier 2.

## LinkedIn Checkpoint

Stop the scan, solve the checkpoint manually in the browser, and slow down. Do not try to bypass security controls.
