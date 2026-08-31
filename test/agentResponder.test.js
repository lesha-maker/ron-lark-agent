import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildPresenceReply, shouldReplyToLarkMessage } from '../src/agentResponder.js';

test('replies to direct messages', () => {
  assert.equal(shouldReplyToLarkMessage({
    sourceEventType: 'im.message.receive_v1',
    channel: { type: 'p2p' },
    message: { id: 'om_123', mentions: [] },
  }, {}), true);
});

test('does not reply to unmentioned group messages by default', () => {
  assert.equal(shouldReplyToLarkMessage({
    sourceEventType: 'im.message.receive_v1',
    channel: { type: 'group' },
    message: { id: 'om_123', mentions: [] },
  }, { larkReplyToAllGroupMessages: false, larkBotOpenId: 'ou_bot' }), false);
});

test('replies to group messages that mention the bot', () => {
  assert.equal(shouldReplyToLarkMessage({
    sourceEventType: 'im.message.receive_v1',
    channel: { type: 'group' },
    message: {
      id: 'om_123',
      mentions: [{ id: { open_id: 'ou_bot' } }],
    },
  }, { larkReplyToAllGroupMessages: false, larkBotOpenId: 'ou_bot' }), true);
});

test('builds a short presence reply', () => {
  const reply = buildPresenceReply({
    message: { text: 'Can we send the pricing today?' },
  });

  assert.match(reply, /Got it/);
  assert.match(reply, /Can we send the pricing today/);
});
