import { normalizeWhatsAppWebhook } from './whatsappNormalizer.js';
import { verifyWhatsAppSignature } from './whatsappSecurity.js';

export function handleWhatsAppVerification({ query, config }) {
  const mode = query.get('hub.mode');
  const token = query.get('hub.verify_token');
  const challenge = query.get('hub.challenge');

  if (mode === 'subscribe' && token && token === config.whatsappVerifyToken) {
    return { status: 200, body: challenge || '', contentType: 'text/plain' };
  }

  return { status: 403, body: 'Forbidden', contentType: 'text/plain' };
}

export async function handleWhatsAppWebhook({ rawBody, headers, config, eventStore }) {
  const signatureIsValid = verifyWhatsAppSignature({
    appSecret: config.whatsappAppSecret,
    signature: headers['x-hub-signature-256'],
    rawBody,
  });

  if (!signatureIsValid) {
    return { status: 401, body: { error: 'Invalid WhatsApp signature.' } };
  }

  const payload = JSON.parse(rawBody.toString('utf8') || '{}');
  const events = normalizeWhatsAppWebhook(payload);

  for (const event of events) {
    await eventStore.append(event);
  }

  return {
    status: 200,
    body: {
      ok: true,
      source: 'whatsapp',
      eventsStored: events.length,
    },
  };
}
