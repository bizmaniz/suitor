#!/usr/bin/env node

import assert from 'assert/strict';
import { isQuickReject, isSearchResultNoise } from './scan_quality_filters.mjs';

assert.equal(isQuickReject({
  company: 'Ladders',
  title: 'Chief of Staff',
  location: 'United States',
}), true, 'Ladders should not enter the active scan board');

assert.equal(isQuickReject({
  company: 'Robert Half',
  title: 'Director of Strategic Operations',
  location: 'Remote - US',
}), true, 'staffing/recruiting intermediaries should be filtered');

assert.equal(isQuickReject({
  company: 'Acme AI',
  title: 'Product Marketing Manager',
  location: 'Remote - US',
}), true, 'product marketing should be filtered from operator scans');

assert.equal(isQuickReject({
  company: 'Formic',
  title: 'Chief of Staff to the CEO',
  location: 'United States - Remote',
}), false, 'real founder-adjacent operator roles should survive quick reject');

assert.equal(isSearchResultNoise({
  title: '5,000+ Director Alliances jobs in United States',
  url: 'https://www.linkedin.com/jobs/search/?keywords=director%20alliances',
}), true, 'generic LinkedIn search pages should not become job cards');

assert.equal(isSearchResultNoise({
  title: 'Director of Strategic Partnerships Jobs, Employment',
  url: 'https://www.indeed.com/q-director-strategic-partnerships-jobs.html',
}), true, 'generic aggregator search pages should not become job cards');

assert.equal(isSearchResultNoise({
  title: 'Chief of Staff to the CEO',
  url: 'https://jobs.ashbyhq.com/example/123',
}), false, 'real ATS job URLs should not be treated as search-result noise');

console.log('scan quality filter regression passed');
