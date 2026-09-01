import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { test } from 'node:test';
import { handleSlackWebhook } from '../src/slackWebhook.js';
import { verifySlackSignature } from '../src/slackSecurity.js';

function slackHeaders(body, signingSecret = 'slack-secret') {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const baseString = `v0:${timestamp}:${body}`;
  const signature = `v0=${crypto
    .createHmac('sha256', signingSecret)
    .update(baseString, 'utf8')
    .digest('hex')}`;

  return {
    'x-slack-request-timestamp': timestamp,
    'x-slack-signature': signature,
  };
}

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
  slackSigningSecret: 'slack-secret',
  slackReplyToAllChannelMessages: false,
};

test('verifies Slack signatures', () => {
  const body = Buffer.from('{"type":"url_verification","challenge":"ok"}');
  assert.equal(verifySlackSignature({
    signingSecret: 'slack-secret',
    timestamp: slackHeaders(body.toString())['x-slack-request-timestamp'],
    signature: slackHeaders(body.toString())['x-slack-signature'],
    rawBody: body,
  }), true);
});

test('responds to Slack URL verification challenge', async () => {
  const body = JSON.stringify({ type: 'url_verification', challenge: 'slack-challenge' });
  const result = await handleSlackWebhook({
    rawBody: Buffer.from(body),
    headers: slackHeaders(body),
    config,
    eventStore: memoryStore(),
  });

  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { challenge: 'slack-challenge' });
});

test('rejects invalid Slack signatures', async () => {
  const body = JSON.stringify({ type: 'url_verification', challenge: 'slack-challenge' });
  const result = await handleSlackWebhook({
    rawBody: Buffer.from(body),
    headers: {
      'x-slack-request-timestamp': String(Math.floor(Date.now() / 1000)),
      'x-slack-signature': 'v0=bad',
    },
    config,
    eventStore: memoryStore(),
  });

  assert.equal(result.status, 401);
});

test('normalizes and replies to Slack app mentions', async () => {
  const body = JSON.stringify({
    type: 'event_callback',
    team_id: 'T123',
    event_id: 'Ev123',
    event: {
      type: 'app_mention',
      user: 'U123',
      channel: 'C123',
      text: '<@URON> hi',
      ts: '1788180000.000100',
      event_ts: '1788180000.000100',
    },
  });
  const store = memoryStore();
  const replies = [];

  const result = await handleSlackWebhook({
    rawBody: Buffer.from(body),
    headers: slackHeaders(body),
    config,
    eventStore: store,
    openAiClient: { isConfigured: () => false },
    slackClient: {
      isConfigured: () => true,
      async postMessage(reply) {
        replies.push(reply);
      },
    },
  });

  assert.equal(result.status, 200);
  assert.equal(store.events.length, 1);
  assert.equal(store.events[0].source, 'slack');
  assert.equal(store.events[0].channel.id, 'C123');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(replies.length, 1);
  assert.equal(replies[0].channel, 'C123');
  assert.equal(replies[0].threadTs, '1788180000.000100');
});
