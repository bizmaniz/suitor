# Install Suitor

## Prerequisites

- Node.js 22.5 or newer
- Git
- OpenAI Codex CLI or Anthropic Claude Code CLI

Install dependencies:

```bash
npm install
```

Install Playwright's browser when you want LinkedIn browser support:

```bash
npx playwright install chromium
```

## Setup

Run:

```bash
npm run setup
```

The setup script writes `suitor.config.json` under your user config directory and creates a profile folder. Start the app:

```bash
npm start
```

Open `http://127.0.0.1:8787`, unlock with the generated token from `<profile root>/.suitor-runtime/local.app-token`, and finish onboarding.

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

Suitor never asks for API keys. It launches the local CLI after you authenticate that CLI yourself.

## Ports And Firewall

Suitor defaults to `127.0.0.1:8787`, reachable only from your computer. To change the port, set `SUITOR_PORT` or edit `suitor.config.json`. To expose on a trusted LAN, set `SUITOR_HOST=0.0.0.0`; the server prints a warning.

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
