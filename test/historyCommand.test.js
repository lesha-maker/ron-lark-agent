import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isHistoryBackfillCommand } from '../src/historyCommand.js';

test('detects group history backfill requests', () => {
  assert.equal(isHistoryBackfillCommand({
    channel: { type: 'group' },
    message: { text: '@_user_1 read all the history of this chat' },
  }), true);
});

test('ignores normal account questions', () => {
  assert.equal(isHistoryBackfillCommand({
    channel: { type: 'group' },
    message: { text: '@_user_1 what are the next steps?' },
  }), false);
});
