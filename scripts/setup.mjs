#!/usr/bin/env node

import { createInterface } from 'readline/promises';
import { stdin as input, stdout as output } from 'process';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { resolve } from 'path';
import { detectCli } from '../web/config.mjs';

const rl = createInterface({ input, output });

function yes(value) {
  return /^(y|yes|true|1)$/i.test(String(value || '').trim());
}

async function ask(label, fallback = '') {
  const suffix = fallback ? ` (${fallback})` : '';
  const value = await rl.question(`${label}${suffix}: `);
  return value.trim() || fallback;
}

try {
  const nodeMajor = Number(process.versions.node.split('.')[0]);
  if (nodeMajor < 22) {
    throw new Error(`Suitor requires Node 22+. Current version: ${process.version}`);
  }

  const configDir = resolve(process.env.SUITOR_CONFIG_DIR || resolve(homedir(), '.suitor'));
  const configPath = resolve(configDir, 'suitor.config.json');
  console.log('\nSuitor setup\n============\n');
  if (existsSync(configPath)) {
    const overwrite = await rl.question(`Config already exists at ${configPath}. Update it? [y/N]: `);
    if (!yes(overwrite)) {
      console.log('Keeping existing config.');
      process.exit(0);
    }
  }

  const candidateName = await ask('Preferred name', 'Candidate');
  const assistantName = await ask('Assistant name', 'Assistant');
  const providerAnswer = await ask('LLM provider: openai or anthropic', 'openai');
  const provider = /^anthropic|claude$/i.test(providerAnswer) ? 'anthropic' : 'openai';
  const profileRoot = resolve(await ask('Profile/data folder', resolve(homedir(), 'Suitor Profile')));
  const port = Number(await ask('Local port', '8787')) || 8787;
  const codex = detectCli('codex');
  const claude = detectCli('claude');

  mkdirSync(configDir, { recursive: true });
  mkdirSync(profileRoot, { recursive: true });
  mkdirSync(resolve(profileRoot, '.suitor-runtime'), { recursive: true });
  mkdirSync(resolve(profileRoot, 'Applications'), { recursive: true });
  mkdirSync(resolve(profileRoot, 'Assessments'), { recursive: true });

  const config = {
    onboarded: false,
    personKey: 'local',
    candidateName,
    candidateFirst: candidateName.split(/\s+/)[0] || 'Candidate',
    candidateInitials: candidateName.split(/\s+/).map(part => part[0]).join('').slice(0, 3).toUpperCase() || 'C',
    assistantName,
    profileRoot,
    runtimeRoot: resolve(profileRoot, '.suitor-runtime'),
    assessmentsRoot: resolve(profileRoot, 'Assessments'),
    host: '127.0.0.1',
    port,
    llm: {
      provider,
      codexBin: codex.installed ? codex.path : '',
      claudeBin: claude.installed ? claude.path : '',
      permissionMode: 'default',
    },
    connections: {
      database: { enabled: true },
      linkedin: { enabled: false },
      providers: {
        greenhouse: true,
        lever: true,
        ashby: true,
        smartrecruiters: true,
        workable: true,
        workday: true,
        muse: true,
        builtin: true,
        rss: true,
        adzuna: false,
        websearch: false,
      },
      rssFeeds: [],
      targetCompanies: [],
    },
    intake: {
      tier1: { basics: '', targetRole: '', logistics: '', compensation: '' },
      tier2: { experience: '', strengths: '', voice: '' },
      tier3: {
        personalityWorkflow: '',
        managerCulture: '',
        industryFit: '',
        careerDirection: '',
        tradeoffs: '',
        dealbreakers: '',
        excludeKeywords: '',
        automaticRejections: '',
        manualReview: '',
      },
      interview: {
        currentStage: 'baseline',
        responses: {},
        classifications: {},
        energizers: '',
        drainers: '',
        contradictions: '',
      },
      progress: { tier1Complete: false, tier2Complete: false, tier3Complete: false },
    },
  };

  writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
  console.log(`\nWrote ${configPath}`);
  console.log(`Profile data will stay under ${profileRoot}`);
  if (provider === 'openai' && !codex.installed) console.log('Codex CLI was not found. Install and authenticate it before using ChatGPT mode.');
  if (provider === 'anthropic' && !claude.installed) console.log('Claude CLI was not found. Install and authenticate it before using Claude mode.');
  console.log(`\nNext: npm start, then open http://127.0.0.1:${port}`);
} finally {
  rl.close();
}
