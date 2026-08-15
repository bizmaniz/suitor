# Install Suitor

## Prerequisites

- Node.js 22.13 or newer
- Python 3
- Git
- OpenAI Codex CLI, Anthropic Claude Code CLI, or a [Cursor API key](https://cursor.com/dashboard/integrations)

Suitor uses Python for PDF and DOCX text extraction and for application package generation. PDF extraction requires `pypdf`; DOCX extraction requires `python-docx`, which provides the `docx` module.

## Windows

PowerShell:

```powershell
winget install OpenJS.NodeJS.LTS
python --version
python -m pip install pypdf python-docx
git clone https://github.com/Bizmaniz/suitor.git
cd suitor
npm install
npm run setup
npm start
```

To set a temporary override:

```powershell
$env:SUITOR_PORT="8788"; npm start
```

## macOS And Linux

Use your package manager or `nvm` to install Node 22.13 or newer. With `nvm`:

On Ubuntu or Debian, install Python, pip, and virtual-environment support first:

```bash
sudo apt update
sudo apt install python3 python3-pip python3-venv
```

Create a dedicated Python environment outside the repository, activate it, and then install Suitor:

```bash
nvm install 22.13
nvm use 22.13
python3 --version
mkdir -p "$HOME/.venvs"
python3 -m venv "$HOME/.venvs/suitor"
source "$HOME/.venvs/suitor/bin/activate"
python3 -m pip install pypdf python-docx
git clone https://github.com/Bizmaniz/suitor.git
cd suitor
npm install
npm run setup
npm start
```

In each new terminal, activate the environment before starting Suitor:

```bash
source "$HOME/.venvs/suitor/bin/activate"
cd suitor
npm start
```

To set a temporary override:

```bash
SUITOR_PORT=8788 npm start
```

On headless Linux, do not enable LinkedIn browser scanning unless a desktop session or suitable browser display is available. API/feed providers and RSS scans work without a GUI.

Install Node dependencies:

```bash
npm install
```

## Chromium For Browser Features And Tests

Core Suitor runs without Chromium. Chromium is required for LinkedIn browser sessions and searches, browser recovery on JavaScript-rendered pages, and the full regression test suite.

`npm install` provides the Playwright package but does not install the separate Chromium browser. Install Chromium with:

```bash
npx playwright install chromium
```

Playwright upgrades can require a matching browser revision. Run the Chromium install command again after upgrading Playwright if the browser is reported missing.

## Setup

Run:

```bash
npm run setup
```

The setup script writes `suitor.config.json` under your user config directory and creates a profile folder. Start the app:

```bash
npm start
```

Open `http://127.0.0.1:8787`, unlock with the generated token from `<profile root>/.suitor-runtime/local.app-token`, and start onboarding. Complete Tier 1 to unlock scanning; keep going through Tier 2 and Tier 3 when you want stronger tailoring and matching.

Use Capture for pasted application emails or roles found outside configured scanners. Learning Insights, Assessments, and Reference Library hold profile knowledge; Settings is reserved for system controls and data management.

## POSIX Smoke Checklist For Maintainers

Before a release, run this on macOS or Linux:

```bash
node --version
npm ci
npm run check:clean
npm run test:regression
tmp_profile="$(mktemp -d)"
SUITOR_CONFIG_DIR="$(mktemp -d)" SUITOR_PROFILE_ROOT="$tmp_profile" SUITOR_PORT=8789 npm start
```

In another terminal:

```bash
test -f "$tmp_profile/.suitor-runtime/local.app-token"
SUITOR_PROFILE_ROOT="$tmp_profile" npm run scan -- --dry-run --no-websearch
```

Stop the server, then remove the temporary profile directory.

## CLI Authentication

Codex:

```bash
codex --version
codex login
```

Claude Code:

```bash
claude --version
claude login
```

Cursor (local SDK, not the desktop `cursor` CLI):

```bash
# From https://cursor.com/dashboard/integrations
export CURSOR_API_KEY=...
# or paste the key in the setup wizard. Stored in <runtime>/provider-secrets.json
# (mode 0600), never in suitor.config.json. Node 22.13+ is required for @cursor/sdk.
```

Codex and Claude use local CLI login (`codex login` / `claude login`). Cursor needs a user API key from the Cursor dashboard: paste it in the setup wizard or Settings, or set `CURSOR_API_KEY`. The key is stored in `<runtime>/provider-secrets.json`, never in `suitor.config.json`.

## Ports, Firewall, And LAN Mode

Suitor defaults to `127.0.0.1:8787`, reachable only from your computer. To change the port, set `SUITOR_PORT` or edit `suitor.config.json`.

LAN mode is an explicit opt-in because Suitor is a local single-user app and does not provide TLS:

```bash
SUITOR_HOST=0.0.0.0 SUITOR_ALLOW_LAN=1 npm start
```

Use LAN mode only on a trusted private network. The server prints a warning at startup, blocks private-IP URL fetches from user-controlled sources, and can enforce a host allowlist:

```bash
SUITOR_HOST=0.0.0.0 SUITOR_ALLOW_LAN=1 SUITOR_ALLOWED_HOSTS="192.168.1.20:8787,suitor.local" npm start
```

Without `SUITOR_ALLOW_LAN=1`, non-loopback binds such as `0.0.0.0` are refused. `SUITOR_PORT=0` is also refused; choose a positive port explicitly.

## Data Locations

- Config: `~/.suitor/suitor.config.json` unless `SUITOR_CONFIG_DIR` is set.
- Profile: chosen during setup.
- Runtime: `<profile root>/.suitor-runtime/`.
- Database: `<profile root>/.suitor-runtime/suitor.sqlite`.
- Generated materials: `<profile root>/Applications/`.

## Backup

Use the app's backup action or copy the whole profile folder while Suitor is stopped. The most important file is `suitor.sqlite`, but profile Markdown, generated drafts, uploads, and browser state also live under the profile root.

## Update

```bash
git pull
npm install
npm start
```

Database tables are created idempotently on startup.

## Uninstall

Stop Suitor, delete the cloned repo, then delete your config folder and profile folder if you want to remove all local data.
