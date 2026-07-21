# Workspaces

Suitor separates daily job-search work from profile knowledge and system controls.

## Work

- **Applications** tracks active applications, interviews, offers, rejections, follow-ups, and notes.
- **Scans** runs direct provider discovery and verified URL scoring. Durable pass and close-out decisions stay suppressed across later scans.
- **Capture** imports pasted application emails and saves roles found through referrals, recruiters, or outside research. It never connects to an inbox automatically.
- **Resume Studio** stages a canonical master resume and creates profile-backed application packages.

## Knowledge

- **Learning Insights** summarizes application outcomes, source activity, and durable decisions. These are directional signals, not hard filters.
- **Assessments** stores PDF and DOCX workplace assessments inside the active profile. Extracted text is soft context only.
- **Reference Library** shows the canonical profile, operating instructions, and URL-verification rules used by the assistant.

## System

**Settings** contains source connections, browser-session controls, backup, calendar export, and data export. Profile editing remains available from Connections and persona-progress prompts.

## Capture Lifecycle

Manual captures are stored in the active profile's SQLite database. Re-saving the same normalized company, role, and URL updates the existing capture. Remove marks the capture as deleted without erasing the audit row; deleted captures are excluded from the workspace and API list.
