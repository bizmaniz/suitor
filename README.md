# Suitor

[![Latest release](https://img.shields.io/github/v/release/bizmaniz/suitor?label=release)](https://github.com/bizmaniz/suitor/releases/latest)
[![CI](https://github.com/bizmaniz/suitor/actions/workflows/ci.yml/badge.svg)](https://github.com/bizmaniz/suitor/actions/workflows/ci.yml)
[![CodeQL](https://github.com/bizmaniz/suitor/actions/workflows/codeql.yml/badge.svg)](https://github.com/bizmaniz/suitor/actions/workflows/codeql.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Suitor is a local-first job-search assistant. It helps you build a candidate profile, scan job sources, draft tailored application materials, and track applications, rejections, interviews, and offers in a local SQLite database.

Suitor runs on your machine. There is no hosted Suitor service, no telemetry, and no account with us. Your assistant runs through your own Codex CLI or Claude Code CLI login.

## Highlights

- Recruiter-style onboarding that unlocks scanning quickly and deepens the profile over time.
- Direct job discovery through configurable ATS providers, feeds, target companies, and browser-assisted sources.
- Profile-driven scoring with compensation constraints, hard filters, manual-review rules, and durable decisions.
- Manual capture for referrals, recruiter leads, pasted job descriptions, and application emails.
- Resume Studio for maintaining a master resume and drafting tailored application materials.
- Local application tracking, interview calendar export, assessments, reference documents, and learning insights.
- Localhost-only defaults, profile isolation, authenticated requests, and no automatic job applications.

## Quickstart

Requirements:

- [Node.js 22.5 or newer](https://nodejs.org/en/download)
- Git
- One local AI CLI: OpenAI Codex (`codex`) or Anthropic Claude Code (`claude`)

Confirm Node and npm are available before cloning:

```bash
node --version
npm --version
```

Windows PowerShell:

```powershell
git clone https://github.com/bizmaniz/suitor.git
cd suitor
npm install
npm run setup
npm start
```

macOS or Linux:

```bash
git clone https://github.com/bizmaniz/suitor.git
cd suitor
npm install
npm run setup
npm start
```

Open [http://127.0.0.1:8787](http://127.0.0.1:8787), unlock with the token in `<profile root>/.suitor-runtime/local.app-token`, and finish the wizard.

If `npm` is not found, install Node.js first, open a new terminal, and run the version checks above. See the [installation guide](docs/INSTALL.md) for Windows, macOS, Linux, Playwright, and alternate-port instructions.

## Latest Release

**[Suitor v1.1.0](https://github.com/bizmaniz/suitor/releases/tag/v1.1.0)** adds the Work, Knowledge, and System workspaces; profile-local manual job capture; Learning Insights; generic profile-driven fallback scoring; responsive regression coverage; and SQLite schema version 3.

To upgrade an existing checkout:

```bash
git pull origin main
npm install
npm start
```

Existing profiles migrate automatically. Back up the profile database from Settings before upgrading.

## Screenshots

![Suitor onboarding wizard](docs/assets/onboarding-wizard.png)

![Suitor dashboard](docs/assets/dashboard.png)

## First Run

The wizard walks through:

1. Environment check for Node, Codex, and Claude.
2. LLM choice: ChatGPT via Codex or Claude via Claude Code.
3. Assistant name.
4. A staged recruiter interview that asks for evidence, constraints, tradeoffs, energizers, drainers, and dealbreakers.
5. Rich fallback form sections if you would rather paste structured notes than chat.
6. Connections: local database, LinkedIn manual browser session, providers, custom RSS feeds, and target companies.

Tier 1 unlocks scanning once basics, target-role direction, logistics, and compensation floor exist. Tier 2 unlocks tailored materials once experience/proof, strengths, and voice guardrails exist. Tier 3 is optional and improves matching with workflow, culture, industry, growth, tradeoff, and dealbreaker detail.

The intake writes `Candidate Search Profile.md`, `Candidate Search Profile.json`, `Job Scan Prompt.md`, and `Intake Status.md` under your profile folder. The JSON includes scoring weights, hard filters, automatic rejection criteria, manual-review criteria, and exclude keywords used by scans.

## Workspaces

Suitor keeps daily work, profile knowledge, and system controls separate:

- **Work:** Applications, Scans, Capture, and Resume Studio.
- **Knowledge:** Learning Insights, Assessments, and Reference Library.
- **System:** Settings for connections, source configuration, security, backup, and exports.

Capture accepts pasted application emails and manually discovered roles without connecting to an inbox. Manual captures are deduplicated in the profile-local SQLite database and can be removed with a soft-delete action. Learning Insights summarizes source activity and durable outcomes without turning historical patterns into automatic rules.

## Security And Your Data

- Local-only: profile, resume, scans, generated drafts, browser state, and SQLite database stay on your machine.
- Localhost by default: the server binds to `127.0.0.1`. Non-loopback binding requires both `SUITOR_HOST` and the explicit `SUITOR_ALLOW_LAN=1` acknowledgement.
- Trusted-network LAN mode: Suitor does not provide TLS. Set `SUITOR_ALLOWED_HOSTS` and expose it only on a network you trust.
- No stored LLM keys: Suitor uses your local CLI authentication.
- No stored LinkedIn password: LinkedIn uses a real browser session with manual login.
- No auto-apply: Suitor scans and drafts. You confirm every application or message yourself.

Read [docs/SCANNING_SAFELY.md](docs/SCANNING_SAFELY.md) before using browser-based sources.

## Documentation

- [docs/INSTALL.md](docs/INSTALL.md)
- [docs/CONFIG.md](docs/CONFIG.md)
- [docs/SOURCES.md](docs/SOURCES.md)
- [docs/SCANNING_SAFELY.md](docs/SCANNING_SAFELY.md)
- [docs/SECURITY.md](docs/SECURITY.md)
- [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)
- [docs/WORKSPACES.md](docs/WORKSPACES.md)
- [docs/MIGRATIONS.md](docs/MIGRATIONS.md)

## Useful Commands

```bash
npm run setup
npm start
npm run doctor
npm run check
npm run check:clean
npm run test:regression
```

## License

MIT. You are responsible for complying with the terms of any site or service you connect to Suitor.
