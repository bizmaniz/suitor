#!/usr/bin/env python3
"""Generic Suitor tailored package generator.

This intentionally writes neutral, editable drafts. It never embeds sample
identity data; candidate facts come from the JSON payload and profile files.
"""

import json
import re
import sys
from pathlib import Path


FLAGGED = [
    re.compile(r"\bdelve\b", re.I),
    re.compile(r"\btapestry\b", re.I),
    re.compile(r"\bproven track record\b", re.I),
    re.compile(r"\bresults-driven\b", re.I),
]


def safe_name(value: str) -> str:
    clean = re.sub(r"[^A-Za-z0-9 ._-]+", "_", value or "Draft").strip(" ._-")
    return clean[:80] or "Draft"


def read_profile(root: Path) -> dict:
    path = root / "Candidate Search Profile.json"
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8-sig"))
    except Exception:
        return {}


def main() -> int:
    if len(sys.argv) != 2:
        raise SystemExit("Usage: generate_tailored_package.py payload.json")
    payload_path = Path(sys.argv[1])
    payload = json.loads(payload_path.read_text(encoding="utf-8-sig"))
    profile_root = Path(payload.get("sourceRoot") or ".").resolve()
    candidate = payload.get("candidateName") or "Candidate"
    company = safe_name(payload.get("company") or "Company")
    role = safe_name(payload.get("role") or "Role")
    jd_text = payload.get("jdText") or ""
    profile = read_profile(profile_root)
    folder = profile_root / "Applications" / f"{company} - {role}"
    folder.mkdir(parents=True, exist_ok=True)

    target = profile.get("targetRole") or "target role"
    logistics = profile.get("logistics") or "location preferences not set"
    compensation = profile.get("compensation") or "compensation preferences not set"
    experience = profile.get("experience") or "Add profile experience details before submitting."

    resume = "\n".join([
        f"# {candidate} - Resume Draft",
        "",
        f"## Target",
        str(target),
        "",
        "## Profile Notes",
        str(experience),
        "",
        "## Tailoring Notes",
        f"Company: {company}",
        f"Role: {role}",
        f"Logistics: {logistics}",
        f"Compensation: {compensation}",
        "",
        "## Job Description Excerpt",
        jd_text[:5000],
        "",
    ])
    letter = "\n".join([
        f"Dear {company} team,",
        "",
        f"I am interested in the {role} role because it aligns with the target work captured in my Suitor profile.",
        "The attached resume draft should be reviewed against the job description and updated with concrete, truthful examples before submission.",
        "",
        "Best,",
        str(candidate),
        "",
    ])

    resume_md = folder / f"{candidate} - Resume Draft - {company} - {role}.md"
    letter_md = folder / f"{candidate} - Cover Letter Draft - {company} - {role}.md"
    resume_md.write_text(resume, encoding="utf-8")
    letter_md.write_text(letter, encoding="utf-8")
    flagged = sorted({p.pattern.strip("\\b").replace("\\", "") for p in FLAGGED if p.search(resume + "\n" + letter)})
    print(json.dumps({
        "folder": str(folder),
        "files": [str(resume_md), str(letter_md)],
        "atsFiles": [str(resume_md), str(letter_md)],
        "designedFiles": [],
        "flaggedLanguage": flagged,
    }))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
