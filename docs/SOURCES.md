# Job Sources

Suitor loads providers from `providers/*.mjs`. Run `npm run check:sources` to verify this page mentions every provider file.

| Provider | Type | Login/key | Toggle |
|---|---|---|---|
| `greenhouse` | ATS API/feed | No login | `connections.providers.greenhouse` |
| `lever` | ATS API/feed | No login | `connections.providers.lever` |
| `ashby` | ATS API/feed | No login | `connections.providers.ashby` |
| `smartrecruiters` | ATS API/feed | No login | `connections.providers.smartrecruiters` |
| `workable` | ATS API/feed | No login | `connections.providers.workable` |
| `workday` | ATS page/feed adapter | No login | `connections.providers.workday` |
| `muse` | Public API | No login | `connections.providers.muse` |
| `builtin` | Built-in curated queries | No login | `connections.providers.builtin` |
| `rss` | User-supplied RSS feeds | No login | `connections.providers.rss` and `connections.rssFeeds` |
| `adzuna` | Keyed API | `ADZUNA_APP_ID` and `ADZUNA_APP_KEY` | `connections.providers.adzuna` |
| `websearch` | Web-search fallback | No login, rate-limited | `connections.providers.websearch` |

## Browser Source

LinkedIn is handled by `scripts/browser_adapter.mjs` through Playwright. It opens a real browser profile, and you log in manually. Suitor stores only local browser session files under `.suitor-runtime/browser`; it does not store your password.

Use LinkedIn carefully and at human pace. Prefer API/feed providers for volume.

## Custom Target Companies

The wizard can save target companies and RSS feeds. Generated `portals.yml` lives in the profile root and is read by `scan.mjs`.
