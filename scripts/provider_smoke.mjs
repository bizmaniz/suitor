#!/usr/bin/env node

import { pathToFileURL } from 'url';
import { resolve } from 'path';
import { makeHttpCtx } from '../providers/_http.mjs';

const APP_ROOT = resolve(import.meta.dirname, '..');

const smokeEntries = {
  smartrecruiters: {
    name: 'M3 USA',
    smartrecruiters_company: 'M3USA',
  },
  workable: {
    name: '2070 Health',
    workable_account: '2070health',
  },
  workday: {
    name: 'Aspen Dental',
    workday_host: 'aspendental.wd1.myworkdayjobs.com',
    workday_tenant: 'aspendental',
    workday_site: 'Careers_Aspen_Dental',
    workday_search_texts: ['Director Operations'],
  },
  websearch: {
    name: 'Heartland Dental',
    careers_url: 'https://jobs.heartland.com/jobs/',
    scan_method: 'websearch',
    scan_query: 'site:jobs.heartland.com/jobs "Regional Manager of Operations"',
  },
  adzuna: {
    name: 'Adzuna Atlanta/Remote Ops',
    scan_method: 'adzuna',
    adzuna_what: 'Director Operations',
    adzuna_where: 'Atlanta OR Remote',
  },
};

async function loadProvider(name) {
  const mod = await import(pathToFileURL(resolve(APP_ROOT, 'providers', `${name}.mjs`)).href);
  return mod.default;
}

async function smokeProvider(name) {
  const provider = await loadProvider(name);
  const entry = smokeEntries[name];
  if (!entry) throw new Error(`No smoke entry configured for provider "${name}"`);
  const jobs = await provider.fetch(entry, makeHttpCtx());
  return {
    provider: name,
    count: jobs.length,
    sample: jobs.slice(0, 5),
  };
}

async function main() {
  const providerArg = process.argv[2];
  const names = providerArg ? [providerArg] : Object.keys(smokeEntries);
  for (const name of names) {
    const result = await smokeProvider(name);
    console.log(JSON.stringify(result, null, 2));
    if (result.count < 1 && result.provider !== 'adzuna') process.exitCode = 1;
  }
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
