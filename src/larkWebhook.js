import { decryptLarkPayload, verifyLarkSignature } from './larkSecurity.js';
import { normalizeLarkEvent } from './normalizer.js';
import { shouldReplyToLarkMessage } from './agentResponder.js';
import { generateRonReply } from './conversationAgent.js';
import { handleHistoryBackfillCommand, isHistoryBackfillCommand } from './historyCommand.js';

function verifyToken(payload, expectedToken) {
  return !expectedToken || payload.token === expectedToken || payload.header?.token === expectedToken;
}

function isUrlVerification(payload) {
  return payload.type === 'url_verification' && payload.challenge;
}

function dedupeKeyFor(normalized) {
  return normalized.message?.id || normalized.sourceEventId;
}

async function replyInBackground({ normalized, larkClient, openAiClient, eventStore }) {
  try {
    const reply = isHistoryBackfillCommand(normalized)
      ? await handleHistoryBackfillCommand({ normalizedEvent: normalized, larkClient, eventStore })
      : await generateRonReply({ normalizedEvent: normalized, openAiClient });

    await larkClient.replyText(normalized.message.id, reply);
  } catch (error) {
    console.error('Lark reply failed:', error.message);
  }
}

export async function handleLarkWebhook({
  rawBody,
  headers,
  config,
  eventStore,
  larkClient,
  openAiClient,
  deduper,
}) {
  let payload = JSON.parse(rawBody.toString('utf8') || '{}');
  const encrypted = typeof payload.encrypt === 'string';

  if (encrypted) {
    const hasSignatureHeaders =
      headers['x-lark-request-timestamp'] &&
      headers['x-lark-request-nonce'] &&
      headers['x-lark-signature'];

    if (hasSignatureHeaders) {
      const validSignature = verifyLarkSignature({
        timestamp: headers['x-lark-request-timestamp'],
        nonce: headers['x-lark-request-nonce'],
        signature: headers['x-lark-signature'],
        encryptKey: config.larkEncryptKey,
        rawBody,
      });

      if (!validSignature) {
        return { status: 401, body: { error: 'Invalid Lark signature.' } };
      }
    }

    payload = decryptLarkPayload(payload.encrypt, config.larkEncryptKey);
  }

  if (!verifyToken(payload, config.larkVerificationToken)) {
    return { status: 401, body: { error: 'Invalid Lark verification token.' } };
  }

  if (isUrlVerification(payload)) {
    return { status: 200, body: { challenge: payload.challenge } };
  }

  const normalized = normalizeLarkEvent(payload);
  const isNewEvent = deduper?.claim(dedupeKeyFor(normalized)) ?? true;

  if (!isNewEvent) {
    return { status: 200, body: { ok: true, duplicate: true } };
  }

  await eventStore.append(normalized);

  if (larkClient && shouldReplyToLarkMessage(normalized, config)) {
    setImmediate(() => {
      void replyInBackground({ normalized, larkClient, openAiClient, eventStore });
    });
  }

  return { status: 200, body: { ok: true } };
}
