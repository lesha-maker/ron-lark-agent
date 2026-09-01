import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { test } from 'node:test';
import { normalizeWhatsAppWebhook } from '../src/whatsappNormalizer.js';
import { handleWhatsAppVerification, handleWhatsAppWebhook } from '../src/whatsappWebhook.js';

function memoryStore() {
  const events = [];
  return {
    events,
    async append(event) {
      events.push(event);
    },
  };
}

function samplePayload() {
  return {
    object: 'whatsapp_business_account',
    entry: [{
      id: 'waba_1',
      changes: [{
        field: 'messages',
        value: {
          messaging_product: 'whatsapp',
          metadata: {
            display_phone_number: '6588915187',
            phone_number_id: '103561682653273',
          },
          contacts: [{
            profile: { name: 'Client Person' },
            wa_id: '6599999999',
          }],
          messages: [{
            from: '6599999999',
            id: 'wamid.123',
            timestamp: '1796040000',
            type: 'text',
            text: { body: 'Can we get the reporting agent update?' },
          }],
        },
      }],
    }],
  };
}

test('responds to WhatsApp verification challenge', () => {
  const query = new URLSearchParams({
    'hub.mode': 'subscribe',
    'hub.verify_token': 'verify-secret',
    'hub.challenge': 'challenge-123',
  });

  const result = handleWhatsAppVerification({
    query,
    config: { whatsappVerifyToken: 'verify-secret' },
  });

  assert.equal(result.status, 200);
  assert.equal(result.body, 'challenge-123');
});

test('rejects invalid WhatsApp verification challenge', () => {
  const query = new URLSearchParams({
    'hub.mode': 'subscribe',
    'hub.verify_token': 'wrong',
    'hub.challenge': 'challenge-123',
  });

  const result = handleWhatsAppVerification({
    query,
    config: { whatsappVerifyToken: 'verify-secret' },
  });

  assert.equal(result.status, 403);
});

test('normalizes WhatsApp inbound text messages', () => {
  const [event] = normalizeWhatsAppWebhook(samplePayload());

  assert.equal(event.source, 'whatsapp');
  assert.equal(event.channel.type, 'whatsapp_individual');
  assert.equal(event.channel.phoneNumberId, '103561682653273');
  assert.equal(event.actor.name, 'Client Person');
  assert.match(event.message.text, /reporting agent/);
});

test('stores authorized WhatsApp webhook messages', async () => {
  const store = memoryStore();
  const rawBody = Buffer.from(JSON.stringify(samplePayload()));
  const signature = crypto
    .createHmac('sha256', 'app-secret')
    .update(rawBody)
    .digest('hex');
  const result = await handleWhatsAppWebhook({
    rawBody,
    headers: { 'x-hub-signature-256': `sha256=${signature}` },
    config: { whatsappAppSecret: 'app-secret' },
    eventStore: store,
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.eventsStored, 1);
  assert.equal(store.events[0].sourceEventId, 'wamid.123');
});

test('rejects invalid WhatsApp signatures', async () => {
  const result = await handleWhatsAppWebhook({
    rawBody: Buffer.from(JSON.stringify(samplePayload())),
    headers: { 'x-hub-signature-256': 'sha256=bad' },
    config: { whatsappAppSecret: 'app-secret' },
    eventStore: memoryStore(),
  });

  assert.equal(result.status, 401);
});
