import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createOAuthState, LarkUserAuthClient, verifyOAuthState } from '../src/larkUserAuth.js';

test('creates and verifies signed Lark OAuth state', () => {
  const state = createOAuthState('secret', 1000);

  assert.equal(verifyOAuthState(state, 'secret', 2000), true);
  assert.equal(verifyOAuthState(state, 'wrong-secret', 2000), false);
});

test('rejects expired Lark OAuth state', () => {
  const state = createOAuthState('secret', 1000);

  assert.equal(verifyOAuthState(state, 'secret', 1000 + 11 * 60 * 1000), false);
});

test('authorization URL includes requested user scopes', () => {
  const client = new LarkUserAuthClient({
    baseUrl: 'https://open.larksuite.com',
    larkClient: {},
    tokenStore: {},
    publicBaseUrl: 'https://ron.example.com',
    appId: 'cli_123',
    stateSecret: 'secret',
    scopes: 'task:tasklist:read task:task:read',
  });
  const url = new URL(client.authorizationUrl());

  assert.equal(url.searchParams.get('scope'), 'task:tasklist:read task:task:read');
});
