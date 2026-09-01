import assert from 'node:assert/strict';
import { test } from 'node:test';
import { handleInboundEmailWebhook } from '../src/emailWebhook.js';
import { normalizeInboundEmail } from '../src/emailNormalizer.js';

function memoryStore() {
  const events = [];
  return {
    events,
    async append(event) {
      events.push(event);
    },
  };
}

test('normalizes generic inbound email payloads', () => {
  const event = normalizeInboundEmail({
    messageId: 'email-1',
    from: 'Lesha <lesha@example.com>',
    to: 'Ron <ron@example.com>',
    cc: 'team@example.com',
    subject: 'Pathkind follow-up',
    text: 'Can Ron track this?',
  });

  assert.equal(event.source, 'email');
  assert.equal(event.sourceEventType, 'email.inbound');
  assert.equal(event.email.from.email, 'lesha@example.com');
  assert.equal(event.email.to[0].email, 'ron@example.com');
  assert.equal(event.email.cc[0].email, 'team@example.com');
  assert.equal(event.email.subject, 'Pathkind follow-up');
});

test('accepts authorized inbound email webhooks', async () => {
  const store = memoryStore();
  const result = await handleInboundEmailWebhook({
    rawBody: Buffer.from(JSON.stringify({
      messageId: 'email-2',
      from: 'customer@example.com',
      to: 'ron@example.com',
      subject: 'Access request',
      text: 'Please send access details.',
    })),
    headers: {
      authorization: 'Bearer secret',
      'x-email-provider': 'postmark',
    },
    config: { emailWebhookSecret: 'secret' },
    eventStore: store,
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.messageId, 'email-2');
  assert.equal(store.events.length, 1);
  assert.equal(store.events[0].provider, 'postmark');
});

test('rejects unauthorized inbound email webhooks', async () => {
  const result = await handleInboundEmailWebhook({
    rawBody: Buffer.from('{}'),
    headers: {},
    config: { emailWebhookSecret: 'secret' },
    eventStore: memoryStore(),
  });

  assert.equal(result.status, 401);
});
