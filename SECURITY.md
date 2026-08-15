# Security Policy

Please report vulnerabilities privately through GitHub Security Advisories for this repository. Do not open a public issue for security reports.

## Supported Versions

| Version | Supported |
|---|---|
| Latest `main` and newest release | Yes |
| Older releases | No; update first |

## Threat Model

Suitor is a single-user local app. It stores profile data, resumes, generated drafts, browser state, and a SQLite database on your machine.

Important boundaries:

- The web server binds to `127.0.0.1` by default.
- LAN exposure is refused unless you set both a non-loopback `SUITOR_HOST` and `SUITOR_ALLOW_LAN=1`.
- LAN mode is trusted-network only. Suitor does not provide TLS; put it behind your own secure network controls if you expose it beyond your machine.
- `SUITOR_ALLOWED_HOSTS` can restrict accepted Host headers in LAN mode.
- In LAN mode, Suitor blocks user-controlled URL fetches to private, loopback, link-local, and metadata IP ranges and re-validates redirects.
- Repeated failed authentication attempts are throttled.
- The assistant reads untrusted job-posting text. Suitor frames that text as data, uses conservative CLI permissions, and runs the agent in the profile folder.
- Codex and Claude use local CLI login. Cursor may store a user API key in `provider-secrets.json` (Unix 0600 or a Windows user-only ACL), never in `suitor.config.json`. Suitor does not store LinkedIn or job-board passwords.
- Suitor does not auto-submit applications or auto-send messages.

## Reporting

Include:

- Affected commit or version.
- Steps to reproduce.
- Expected and actual behavior.
- Impact and suggested fix, if known.

We aim to acknowledge reports within 5 business days.
