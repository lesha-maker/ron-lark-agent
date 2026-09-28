import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createOAuthState, verifyOAuthState } from '../src/larkUserAuth.js';

test('creates and verifies signed Lark OAuth state', () => {
  const state = createOAuthState('secret', 1000);

  assert.equal(verifyOAuthState(state, 'secret', 2000), true);
  assert.equal(verifyOAuthState(state, 'wrong-secret', 2000), false);
});

test('rejects expired Lark OAuth state', () => {
  const state = createOAuthState('secret', 1000);

  assert.equal(verifyOAuthState(state, 'secret', 1000 + 11 * 60 * 1000), false);
});
