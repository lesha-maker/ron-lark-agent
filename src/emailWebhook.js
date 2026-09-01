import crypto from 'node:crypto';
import { normalizeInboundEmail } from './emailNormalizer.js';

function timingSafeEqualString(a, b) {
  const left = Buffer.from(a || '');
  const right = Buffer.from(b || '');
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function isAuthorizedEmailWebhook(headers, config) {
  if (!config.emailWebhookSecret) return false;
  const provided =
    headers['x-ron-email-secret'] ||
    headers['x-webhook-secret'] ||
    headers.authorization?.replace(/^Bearer\s+/i, '');

  return timingSafeEqualString(provided, config.emailWebhookSecret);
}

export async function handleInboundEmailWebhook({ rawBody, headers, config, eventStore }) {
  if (!isAuthorizedEmailWebhook(headers, config)) {
    return { status: 401, body: { error: 'Unauthorized.' } };
  }

  const payload = JSON.parse(rawBody.toString('utf8') || '{}');
  const provider = headers['x-email-provider'] || payload.provider || 'generic';
  const normalized = normalizeInboundEmail(payload, provider);
  await eventStore.append(normalized);

  return {
    status: 200,
    body: {
      ok: true,
      source: 'email',
      messageId: normalized.email.messageId,
    },
  };
}
