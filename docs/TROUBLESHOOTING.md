# Troubleshooting

## Wrong Node Version

Suitor needs Node 22.5 or newer because it uses `node:sqlite`.

```bash
node --version
```

Install a newer Node, then rerun `npm install`.

## Python Is Not Available

Suitor looks for `python3` first and then `python`. Python is required for PDF and DOCX text extraction and for application package generation.

Windows:

```powershell
python --version
```

macOS or Linux:

```bash
python3 --version
```

If the command is not found, install Python 3 and make sure it is on `PATH`. On Windows, enable the installer option that adds `python.exe` to `PATH`. On Ubuntu or Debian, install the required packages:

```bash
sudo apt update
sudo apt install python3 python3-pip python3-venv
```

Then open a new terminal and restart Suitor.

## Missing pypdf Or docx Module

Errors such as `No module named 'pypdf'` or `No module named 'docx'` mean the extraction packages are not installed for the Python interpreter Suitor found. The `docx` module is installed from the package named `python-docx`.

Windows:

```powershell
python -m pip install pypdf python-docx
```

macOS or Linux:

```bash
mkdir -p "$HOME/.venvs"
python3 -m venv "$HOME/.venvs/suitor"
source "$HOME/.venvs/suitor/bin/activate"
python3 -m pip install pypdf python-docx
```

Run the command with the same interpreter shown by the version check. Keep the virtual environment active when starting Suitor, then retry the PDF or DOCX upload.

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

Core Suitor can run without Chromium. Chromium is required for LinkedIn browser sessions and searches, browser recovery on JavaScript-rendered pages, and the full regression test suite.

`npm install` installs the Playwright package but not the separate Chromium browser. Install Chromium with:

```bash
npx playwright install chromium
```

If this error appears after a Playwright upgrade, run the command again so the installed Chromium revision matches Playwright.

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
