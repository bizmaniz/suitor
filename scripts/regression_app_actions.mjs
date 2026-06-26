#!/usr/bin/env node

import { readFileSync } from 'fs';
import { resolve } from 'path';
import vm from 'vm';

const appPath = resolve('web/static/app.js');
const source = readFileSync(appPath, 'utf-8');
const start = source.indexOf('function extractJsonObjectAt');
const end = source.indexOf('function plainTextFromRendered');

if (start === -1 || end === -1 || end <= start) {
  throw new Error('Could not locate app-action parser functions in web/static/app.js');
}

const parserSource = `${source.slice(start, end)}
globalThis.extractAppActions = extractAppActions;`;
const context = {};
vm.createContext(context);
vm.runInContext(parserSource, context, { filename: appPath });

const hiddenStart = source.indexOf('function scanDecisionIsHidden');
const hiddenEnd = source.indexOf('function browserResultRole');
if (hiddenStart === -1 || hiddenEnd === -1 || hiddenEnd <= hiddenStart) {
  throw new Error('Could not locate scanDecisionIsHidden in web/static/app.js');
}
vm.runInContext(`${source.slice(hiddenStart, hiddenEnd)}
globalThis.scanDecisionIsHidden = scanDecisionIsHidden;`, context, { filename: appPath });

function assert(condition, message, evidence = '') {
  if (!condition) throw new Error(`${message}${evidence ? `\n${evidence}` : ''}`);
}

const sample = [
  'Done. I updated the tracker.',
  '',
  '  [app-action] {"type":"application-stage-update","company":"Product.AI","role":"Chief of Staff to the CEO","status":"screen_scheduled","notes":"Interview scheduled."}',
  '- [app-action] {"type":"scan-decision","decision":"passed","company":"Canopy","role":"Strategic Partnerships Director","reason":"User passed due to direct ecosystem conflict."}',
  '[app-action] {"type":"application-submitted","company":"Example AI","role":"Chief of Staff","notes":"Path includes brace-like text: {not json} inside a string."}',
  '[app-action] {"type":"malformed",',
].join('\n');

const actions = context.extractAppActions(sample);

assert(actions.length === 3, 'parser should extract valid app actions while ignoring malformed actions', JSON.stringify(actions));
assert(actions[0].type === 'application-stage-update' && actions[0].company === 'Product.AI', 'parser should handle indented actions', JSON.stringify(actions[0]));
assert(actions[1].type === 'scan-decision' && actions[1].decision === 'passed', 'parser should handle bullet-prefixed actions', JSON.stringify(actions[1]));
assert(actions[2].type === 'application-submitted' && /\{not json\}/.test(actions[2].notes), 'parser should respect braces inside JSON strings', JSON.stringify(actions[2]));
assert(context.scanDecisionIsHidden({ decision: 'screen_scheduled' }), 'scan visibility should hide screen-scheduled roles');
assert(context.scanDecisionIsHidden({ decision: 'interviewing' }), 'scan visibility should hide interviewing roles');
assert(context.scanDecisionIsHidden({ decision: 'accepted' }), 'scan visibility should hide accepted roles');

console.log('app-action parser regression passed');
