# Configuration

Normal users should run `npm run setup` and then finish the web wizard. Power users can override settings with environment variables.

Config file: `suitor.config.json` in `SUITOR_CONFIG_DIR` or `~/.suitor`.

## Core Fields

| Config field | Env var | Default |
|---|---|---|
| `profileRoot` | `SUITOR_PROFILE_ROOT` | `<repo>/.suitor-profile` before setup |
| `runtimeRoot` | `SUITOR_RUNTIME_ROOT` | `<profileRoot>/.suitor-runtime` |
| `assessmentsRoot` | `SUITOR_ASSESSMENTS_ROOT` | `<profileRoot>/Assessments` |
| `host` | `SUITOR_HOST` | `127.0.0.1` |
| `port` | `SUITOR_PORT` | `8787` |
| `personKey` | `SUITOR_PERSON_KEY` | `local` |

## Assistant And LLM

| Config field | Env var | Notes |
|---|---|---|
| `assistantName` | `SUITOR_ASSISTANT_NAME` | 1 to 40 characters in the wizard |
| `llm.provider` | `SUITOR_LLM_PROVIDER` | `openai` or `anthropic` |
| `llm.codexBin` | `SUITOR_CODEX_BIN` | Optional explicit Codex path |
| `llm.claudeBin` | `SUITOR_CLAUDE_BIN` | Optional explicit Claude path |
| `llm.permissionMode` | `SUITOR_CLAUDE_PERMISSION_MODE` | Defaults to conservative CLI behavior |

## Candidate Summary

| Env var | Use |
|---|---|
| `SUITOR_CANDIDATE_NAME` | Display and draft name |
| `SUITOR_CANDIDATE_FIRST` | Short display name |
| `SUITOR_CANDIDATE_INITIALS` | Sidebar mark |
| `SUITOR_LOCKED_TARGET` | Target role summary |
| `SUITOR_LOCATION_SUMMARY` | Location and work-mode summary |
| `SUITOR_COMP_SUMMARY` | Compensation summary |
| `SUITOR_COMP_DETAIL` | Compensation detail |
| `SUITOR_COMP_FLOOR` | Generic local scorer floor |

## Intake

The web wizard stores intake data in `intake.tier1`, `intake.tier2`, `intake.tier3`, and `intake.interview`.

- Tier 1 unlocks scanning: basics, target-role direction, logistics, and compensation.
- Tier 2 unlocks tailored materials: experience/proof, strengths, and voice guardrails.
- Tier 3 enriches matching: workflow, manager/culture, industry/company fit, career direction, tradeoffs, dealbreakers, exclude keywords, automatic rejections, and manual-review criteria.

On save, Suitor writes `Candidate Search Profile.md`, `Candidate Search Profile.json`, `Job Scan Prompt.md`, and `Intake Status.md` in the profile folder. The JSON scoring model uses weights `role 25`, `environment 20`, `compensation 20`, `lifestyle 15`, `growth 10`, and `risk 10`.

Quick Scan and Verified Scan read exclude keywords and automatic-rejection phrases from this profile. The local fallback scorer also routes configured manual-review criteria for human review rather than silently promoting them.

## Document Paths

| Env var | Default |
|---|---|
| `SUITOR_PROFILE_MD` | `<profileRoot>/Candidate Search Profile.md` |
| `SUITOR_SCAN_PROMPT` | `<profileRoot>/Job Scan Prompt.md` |
| `SUITOR_INSTRUCTIONS_MD` | `<profileRoot>/Project Instructions.md` |
| `SUITOR_VERIFICATION_MD` | `<profileRoot>/URL Verification Protocol.md` |
| `SUITOR_INTAKE_MD` | `<profileRoot>/Intake Status.md` |
| `SUITOR_TRACKER_PATH` | `<profileRoot>/Applications Tracker.md` |
| `SUITOR_PORTALS_PATH` | `<profileRoot>/portals.yml` |
| `SUITOR_APPLICATIONS_TRACKER` | Optional external tracker for scanner dedupe |

## Scanning

| Env var | Use |
|---|---|
| `SUITOR_SKIP_WEBSEARCH` | Skip web-search fallback |
| `SUITOR_WEBSEARCH_DELAY_MS` | Delay between web-search requests |
| `SUITOR_VERIFIED_SCAN_LIMIT` | Max verified scan candidates |
| `SUITOR_VERIFY_FETCH_CONCURRENCY` | Verified scan fetch concurrency |
| `SUITOR_JD_SCORING_SCRIPT` | Test-only override for Add JD. Points `POST /api/score-jd` at a stub instead of `scripts/verified_scan.mjs`. Never set in production. |

## LinkedIn Browser

| Env var | Use |
|---|---|
| `SUITOR_LINKEDIN_QUERY` | Default LinkedIn query |
| `SUITOR_LINKEDIN_LOCATION` | Location filter |
| `SUITOR_LINKEDIN_WORKPLACE` | Workplace type |
| `SUITOR_LINKEDIN_EXPERIENCE` | Experience levels |
| `SUITOR_LINKEDIN_RECENCY` | Recency filter |
| `SUITOR_LINKEDIN_SALARY_BUCKET` | Salary bucket |
| `SUITOR_LINKEDIN_LIMIT` | Result cap |
| `SUITOR_LINKEDIN_INSPECT_LIMIT` | Inspection cap |
| `SUITOR_LINKEDIN_MAX_PASSES` | Pagination cap |
| `SUITOR_LINKEDIN_STAGNANT_PASSES` | Stop after no-new-result passes |
| `SUITOR_BROWSER_RECOVERY` | Browser recovery toggle |

## Keyed Providers

Adzuna reads `ADZUNA_APP_ID` and `ADZUNA_APP_KEY`.
