#!/usr/bin/env node

import { spawnSync } from 'child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, readdirSync, statSync, renameSync } from 'fs';
import { dirname, join, relative, resolve } from 'path';
import { fileURLToPath } from 'url';
import { htmlToPlainText } from '../providers/_html_text.mjs';
import { assertSafeFetchUrl, strictUrlFetchEnabled } from '../providers/_url_safety.mjs';
import { completeCursorPrompt } from '../web/cursor_agent.mjs';
import { runSelectedScoring } from '../web/llm_routing.mjs';
