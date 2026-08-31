import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { test } from 'node:test';
import { handleLarkWebhook } from '../src/larkWebhook.js';
import { encryptForTest } from '../src/larkSecurity.js';

function memoryStore() {
  const events = [];
  return {
    events,
    async append(event) {
      events.push(event);
    },
  };
}

const config = {
  larkVerificationToken: 'verify-me',
  larkEncryptKey: 'encrypt-me',
};

test('responds to URL verification challenge', async () => {
  const store = memoryStore();
  const result = await handleLarkWebhook({
    rawBody: Buffer.from(JSON.stringify({
      type: 'url_verification',
      token: 'verify-me',
      challenge: 'challenge-value',
    })),
    headers: {},
    config,
    eventStore: store,
  });

  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { challenge: 'challenge-value' });
  assert.equal(store.events.length, 0);
});

test('rejects an invalid verification token', async () => {
  const result = await handleLarkWebhook({
    rawBody: Buffer.from(JSON.stringify({
      type: 'url_verification',
      token: 'wrong',
      challenge: 'challenge-value',
    })),
    headers: {},
    config,
    eventStore: memoryStore(),
  });

  assert.equal(result.status, 401);
});

test('decrypts encrypted URL verification payloads', async () => {
  const encrypted = encryptForTest({
    type: 'url_verification',
    token: 'verify-me',
    challenge: 'encrypted-challenge',
  }, config.larkEncryptKey);

  const result = await handleLarkWebhook({
    rawBody: Buffer.from(JSON.stringify({ encrypt: encrypted })),
    headers: {},
    config,
    eventStore: memoryStore(),
  });

  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { challenge: 'encrypted-challenge' });
});

test('normalizes Lark message receive events', async () => {
  const store = memoryStore();
  const replies = [];
  const result = await handleLarkWebhook({
    rawBody: Buffer.from(JSON.stringify({
      schema: '2.0',
      header: {
        event_id: 'evt_123',
        event_type: 'im.message.receive_v1',
        create_time: '1767225600000',
        token: 'verify-me',
      },
      event: {
        sender: {
          sender_id: { open_id: 'ou_sender' },
        },
        message: {
          message_id: 'om_123',
          chat_id: 'oc_account_room',
          chat_type: 'group',
          message_type: 'text',
          content: JSON.stringify({ text: 'Customer asked for pricing by Friday.' }),
        },
      },
    })),
    headers: {},
    config: { ...config, larkReplyToAllGroupMessages: true },
    eventStore: store,
    larkClient: {
      async replyText(messageId, text) {
        replies.push({ messageId, text });
      },
    },
  });

  assert.equal(result.status, 200);
  assert.equal(store.events.length, 1);
  assert.equal(store.events[0].source, 'lark');
  assert.equal(store.events[0].channel.id, 'oc_account_room');
  assert.equal(store.events[0].message.text, 'Customer asked for pricing by Friday.');
  assert.equal(store.events[0].analysis.needsHumanReview, true);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(replies.length, 1);
  assert.equal(replies[0].messageId, 'om_123');
});

test('deduplicates repeated Lark message deliveries', async () => {
  const store = memoryStore();
  const replies = [];
  const deduper = {
    keys: new Set(),
    claim(key) {
      if (this.keys.has(key)) return false;
      this.keys.add(key);
      return true;
    },
  };
  const rawBody = Buffer.from(JSON.stringify({
    schema: '2.0',
    header: {
      event_id: 'evt_123',
      event_type: 'im.message.receive_v1',
      token: 'verify-me',
    },
    event: {
      message: {
        message_id: 'om_123',
        chat_id: 'oc_account_room',
        chat_type: 'p2p',
        message_type: 'text',
        content: JSON.stringify({ text: 'hi' }),
      },
    },
  }));

  const args = {
    rawBody,
    headers: {},
    config,
    eventStore: store,
    deduper,
    larkClient: {
      async replyText(messageId, text) {
        replies.push({ messageId, text });
      },
    },
  };

  const first = await handleLarkWebhook(args);
  const second = await handleLarkWebhook(args);
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(second.body.duplicate, true);
  assert.equal(store.events.length, 1);
  assert.equal(replies.length, 1);
});

test('rejects encrypted events with invalid signatures', async () => {
  const encrypted = encryptForTest({
    schema: '2.0',
    header: {
      event_id: 'evt_123',
      event_type: 'im.message.receive_v1',
      token: 'verify-me',
    },
    event: { message: { content: '{"text":"hello"}' } },
  }, config.larkEncryptKey);
  const rawBody = Buffer.from(JSON.stringify({ encrypt: encrypted }));

  const result = await handleLarkWebhook({
    rawBody,
    headers: {
      'x-lark-request-timestamp': '1700000000',
      'x-lark-request-nonce': 'nonce',
      'x-lark-signature': crypto.createHash('sha256').update('bad').digest('hex'),
    },
    config,
    eventStore: memoryStore(),
  });

  assert.equal(result.status, 401);
});
