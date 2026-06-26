import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { delimiter } from 'path';
import { spawnSync } from 'child_process';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const APP_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const DEFAULT_CONFIG_DIR = resolve(process.env.SUITOR_CONFIG_DIR || process.env.XDG_CONFIG_HOME || resolve(homedir(), '.suitor'));
const CONFIG_PATH = resolve(DEFAULT_CONFIG_DIR, 'suitor.config.json');

function readJson(path, fallback = {}) {
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(readFileSync(path, 'utf-8').replace(/^\uFEFF/, ''));
  } catch {
    return fallback;
  }
}

function env(name, fallback = '') {
  return process.env[name] || fallback;
}

function envFlag(name, fallback = false) {
  const value = process.env[name];
  if (value === undefined) return Boolean(fallback);
  return /^(1|true|yes|on)$/i.test(String(value).trim());
}

function envList(name, fallback = []) {
  const raw = process.env[name];
  const values = raw === undefined ? fallback : String(raw).split(',');
  return (Array.isArray(values) ? values : String(values).split(','))
    .map(value => String(value).trim())
    .filter(Boolean);
}

function initialConfig() {
  const fileConfig = readJson(CONFIG_PATH, {});
  const profileRoot = resolve(env('SUITOR_PROFILE_ROOT', fileConfig.profileRoot || resolve(APP_ROOT, '.suitor-profile')));
  const envProfileRootSet = Boolean(process.env.SUITOR_PROFILE_ROOT);
  const runtimeRoot = resolve(env(
    'SUITOR_RUNTIME_ROOT',
    envProfileRootSet ? resolve(profileRoot, '.suitor-runtime') : (fileConfig.runtimeRoot || resolve(profileRoot, '.suitor-runtime')),
  ));
  const candidateName = env('SUITOR_CANDIDATE_NAME', fileConfig.candidateName || fileConfig.profile?.basics?.preferredName || 'Candidate');
  const first = env('SUITOR_CANDIDATE_FIRST', fileConfig.candidateFirst || String(candidateName).split(/\s+/)[0] || 'Candidate');
  return {
    appRoot: APP_ROOT,
    configDir: DEFAULT_CONFIG_DIR,
    configPath: CONFIG_PATH,
    onboarded: Boolean(fileConfig.onboarded),
    personKey: env('SUITOR_PERSON_KEY', fileConfig.personKey || 'local'),
    profileRoot,
    runtimeRoot,
    assessmentsRoot: resolve(env(
      'SUITOR_ASSESSMENTS_ROOT',
      envProfileRootSet ? resolve(profileRoot, 'Assessments') : (fileConfig.assessmentsRoot || resolve(profileRoot, 'Assessments')),
    )),
    host: env('SUITOR_HOST', fileConfig.host || '127.0.0.1'),
    port: Number(env('SUITOR_PORT', fileConfig.port ?? 8787)),
    allowLan: envFlag('SUITOR_ALLOW_LAN', fileConfig.allowLan || false),
    allowedHosts: envList('SUITOR_ALLOWED_HOSTS', fileConfig.allowedHosts || []),
    candidateName,
    candidateFirst: first,
    candidateInitials: env('SUITOR_CANDIDATE_INITIALS', fileConfig.candidateInitials || initials(candidateName)),
    assistantName: env('SUITOR_ASSISTANT_NAME', fileConfig.assistantName || 'Assistant'),
    lockedTarget: env('SUITOR_LOCKED_TARGET', fileConfig.lockedTarget || 'Target roles not set yet'),
    compSummary: env('SUITOR_COMP_SUMMARY', fileConfig.compSummary || 'Compensation not set yet'),
    compDetail: env('SUITOR_COMP_DETAIL', fileConfig.compDetail || ''),
    locationSummary: env('SUITOR_LOCATION_SUMMARY', fileConfig.locationSummary || 'Locations not set yet'),
    llm: {
      provider: env('SUITOR_LLM_PROVIDER', fileConfig.llm?.provider || 'openai'),
      codexBin: env('SUITOR_CODEX_BIN', fileConfig.llm?.codexBin || ''),
      claudeBin: env('SUITOR_CLAUDE_BIN', fileConfig.llm?.claudeBin || ''),
      permissionMode: env('SUITOR_CLAUDE_PERMISSION_MODE', fileConfig.llm?.permissionMode || 'default'),
    },
    profile: fileConfig.profile || {},
    intake: fileConfig.intake || defaultIntakeState(),
    connections: fileConfig.connections || defaultConnections(),
  };
}

function initials(name) {
  const letters = String(name || 'Candidate').split(/\s+/).filter(Boolean).map(part => part[0]).join('').slice(0, 3);
  return (letters || 'C').toUpperCase();
}

function defaultConnections() {
  return {
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
  };
}

function defaultIntakeState() {
  return {
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
    gapReportPath: '',
  };
}

export const config = initialConfig();

export function saveConfig(nextConfig = config) {
  mkdirSync(dirname(CONFIG_PATH), { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(stripRuntime(nextConfig), null, 2) + '\n', 'utf-8');
  return nextConfig;
}

function stripRuntime(value) {
  const clone = JSON.parse(JSON.stringify(value));
  delete clone.appRoot;
  delete clone.configDir;
  delete clone.configPath;
  return clone;
}

export function detectCli(command) {
  const candidates = knownCliCandidates(command);
  for (const bin of candidates) {
    const probe = spawnSync(bin, ['--version'], { encoding: 'utf-8', shell: false, timeout: 5000 });
    if (!probe.error) {
      return { installed: true, path: bin, version: (probe.stdout || probe.stderr || '').trim() };
    }
  }
  return { installed: false, path: '', version: '' };
}

function knownCliCandidates(command) {
  const names = process.platform === 'win32' ? [`${command}.cmd`, `${command}.exe`, command] : [command];
  const paths = String(process.env.PATH || '').split(delimiter).filter(Boolean);
  return [
    ...names,
    ...paths.flatMap(dir => names.map(name => resolve(dir, name))),
  ];
}

export function onboardingStatus(current = config) {
  const tier1 = intakeTierComplete('tier1', current);
  const tier2 = intakeTierComplete('tier2', current);
  const tier3 = intakeTierComplete('tier3', current);
  return {
    onboarded: Boolean(current.onboarded),
    tier1Complete: tier1,
    tier2Complete: tier2,
    tier3Complete: tier3,
    scanningUnlocked: tier1,
    tailoringUnlocked: tier2,
  };
}

export function intakeTierComplete(tier, current = config) {
  const data = current.intake?.[tier] || {};
  const interview = current.intake?.interview || {};
  const responses = interview.responses || {};
  const value = key => String(data[key] || responses[key]?.summary || responses[key]?.notes || '').trim();
  const required = {
    tier1: ['basics', 'targetRole', 'logistics', 'compensation'],
    tier2: ['experience', 'strengths', 'voice'],
    tier3: ['personalityWorkflow', 'managerCulture', 'industryFit', 'careerDirection', 'tradeoffs', 'dealbreakers'],
  }[tier] || [];
  if (tier === 'tier3') return required.some(key => Boolean(value(key)));
  return required.every(key => Boolean(value(key)));
}
