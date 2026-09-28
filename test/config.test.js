import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadConfig } from '../src/config.js';

test('normalizes bare Railway public domain to https URL', () => {
  const config = loadConfig({
    RAILWAY_PUBLIC_DOMAIN: 'ron-lark-agent-production.up.railway.app',
  });

  assert.equal(config.publicBaseUrl, 'https://ron-lark-agent-production.up.railway.app');
});
