// Cursor SDK adapter. Same jobs as the Claude CLI (chat, scoring, tailoring),
// but via @cursor/sdk against a local cwd.
//
// SUITOR_CURSOR_STUB: path to a text file used instead of the SDK, so
// regressions never spend Cursor tokens or require a key.
//
// SUITOR_CURSOR_CAPTURE_PROMPT: if set, write the prompt to that path before
// the stub or SDK runs so tests can assert inlined profile/JD text.
//
// Do not use `await using` here: Node's `node --check` does not parse Explicit
// Resource Management even on the Cursor SDK floor (Node 22.13). Dispose with close().

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { cursorApiKeyFrom as readCursorApiKey } from './provider_secrets.mjs';

export function cursorApiKeyFrom(env = process.env, secrets = {}) {
  return readCursorApiKey(env, secrets);
}

const KNOWN_CURSOR_MODELS = new Set([
  'composer-2.5',
  'composer-2',
  'composer-1.5',
  'gpt-5',
  'gpt-5-mini',
  'gpt-5-nano',
  'claude-4-sonnet',
  'claude-4-opus',
  'grok-4',
]);

const CURSOR_MODEL_PATTERN = /^[a-z0-9][a-z0-9.-]{0,63}$/;

export function validateCursorModel(id) {
  const value = String(id || '').trim();
  if (KNOWN_CURSOR_MODELS.has(value)) return value;
  if (value && value.length >= 1 && value.length <= 64 && CURSOR_MODEL_PATTERN.test(value)) return value;
  throw new Error(`Invalid Cursor model id "${id}". Use a known id such as composer-2.5, or a lowercase letters/digits/dots/hyphens id up to 64 characters.`);
}

export function selectedLlmProvider(env = process.env, config = {}) {
  const value = String(env.SUITOR_LLM_PROVIDER || config.llm?.provider || 'openai').trim().toLowerCase();
  if (value === 'cursor' || value === 'anthropic' || value === 'openai') return value;
  return 'openai';
}

function stubText() {
  const path = String(process.env.SUITOR_CURSOR_STUB || '').trim();
  if (!path || !existsSync(path)) return '';
  return readFileSync(path, 'utf-8');
}

function capturePromptIfRequested(prompt) {
  const dest = String(process.env.SUITOR_CURSOR_CAPTURE_PROMPT || '').trim();
  if (!dest) return;
  writeFileSync(dest, String(prompt || ''), 'utf-8');
}

function cursorModel(preferred = '') {
  const value = String(preferred || process.env.SUITOR_CURSOR_MODEL || 'composer-2.5').trim();
  return validateCursorModel(value || 'composer-2.5');
}

async function loadAgent() {
  try {
    return (await import('@cursor/sdk')).Agent;
  } catch (err) {
    throw new Error(`Cursor SDK is not available (${err.message}). Run npm install in the Suitor app root and set a Cursor API key.`);
  }
}

function agentOptions({ cwd, model = '', apiKey = '' } = {}) {
  return {
    apiKey,
    model: { id: cursorModel(model) },
    local: { cwd, settingSources: [] },
    tools: [],
  };
}

function requireCursorKey(apiKey = '') {
  const key = String(apiKey || process.env.CURSOR_API_KEY || '').trim();
  if (!key) throw new Error('Cursor is selected but no API key is set. Save one in setup, or set CURSOR_API_KEY.');
  return key;
}

function failIfErrored(result) {
  if (result?.status === 'error') {
    throw new Error(result.error?.message || `Cursor run failed (${result.id || 'no id'})`);
  }
}

// One-shot: full assistant text. Used for scoring and other non-stream jobs.
export async function completeCursorPrompt({ prompt, cwd, model = '', apiKey = '' } = {}) {
  capturePromptIfRequested(prompt);
  const stub = stubText();
  if (stub) return stub;
  const key = requireCursorKey(apiKey);
  const Agent = await loadAgent();
  const result = await Agent.prompt(String(prompt || ''), agentOptions({ cwd, model, apiKey: key }));
  failIfErrored(result);
  return typeof result.result === 'string' ? result.result : '';
}

function assistantTextFromEvent(event) {
  if (event?.type !== 'assistant') return '';
  const content = event.message?.content;
  if (!Array.isArray(content)) return '';
  return content.filter(block => block?.type === 'text' && block.text).map(block => block.text).join('');
}

// Streaming chat. onText is called with each assistant text chunk.
export async function streamCursorPrompt({ prompt, cwd, model = '', apiKey = '', onText = () => {} } = {}) {
  capturePromptIfRequested(prompt);
  const stub = stubText();
  if (stub) {
    onText(stub);
    return stub;
  }
  const key = requireCursorKey(apiKey);
  const Agent = await loadAgent();
  const agent = await Agent.create(agentOptions({ cwd, model, apiKey: key }));
  try {
    const run = await agent.send(String(prompt || ''));
    let out = '';
    if (typeof run.stream === 'function') {
      for await (const event of run.stream()) {
        const chunk = assistantTextFromEvent(event);
        if (!chunk) continue;
        out += chunk;
        onText(chunk);
      }
    }
    const result = await run.wait();
    failIfErrored(result);
    if (!out && typeof result.result === 'string') {
      out = result.result;
      if (out) onText(out);
    }
    return out;
  } finally {
    try { agent.close(); } catch {}
  }
}
