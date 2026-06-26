#!/usr/bin/env python3
"""Compatibility entrypoint for Suitor's generic package generator."""

import runpy
from pathlib import Path


if __name__ == "__main__":
    runpy.run_path(str(Path(__file__).with_name("generate_tailored_package.py")), run_name="__main__")
