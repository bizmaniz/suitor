# Security Notes

Suitor is designed as a single-user local app. It binds to `127.0.0.1` by default and stores profile data, resumes, generated drafts, browser state, and the local SQLite database on your machine.

Manual role captures and pasted email classifications are profile-local. Capture does not fetch a pasted URL or connect to an inbox; URL verification happens only through the guarded scan paths. Removing a manual capture soft-deletes its database row so the local audit history remains recoverable.

## LAN Mode

Non-loopback binding is refused unless you explicitly set `SUITOR_ALLOW_LAN=1` with a non-loopback `SUITOR_HOST`, for example:

```bash
SUITOR_HOST=0.0.0.0 SUITOR_ALLOW_LAN=1 npm start
```

Use this only on a trusted private network. Suitor does not provide TLS. In LAN mode, you can restrict accepted Host headers with:

```bash
SUITOR_ALLOWED_HOSTS="192.168.1.20:8787,suitor.local"
```

Set `SUITOR_ALLOWED_HOSTS` when using LAN mode. If it is empty, Suitor starts for compatibility but prints a warning because Host-header checking and DNS-rebinding protection are disabled.

LAN mode also enables stricter URL-fetch protection for user-controlled RSS feeds, provider URLs, verified-scan candidate URLs, browser-recovery navigation, and liveness checks. Suitor blocks private, loopback, link-local, and metadata IP ranges and re-validates redirect targets where it follows redirects itself.

## Authentication

The browser session uses an HttpOnly cookie after login, and state-changing API requests require a same-origin Origin or Referer when those headers are present. Repeated failed auth attempts are rate-limited.

Report vulnerabilities privately through GitHub Security Advisories rather than public issues.
