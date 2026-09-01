import { generateRonReply } from './conversationAgent.js';
import { normalizeSlackEvent } from './slackNormalizer.js';
import { verifySlackSignature } from './slackSecurity.js';

function isSlackUrlVerification(payload) {
  return payload.type === 'url_verification' && payload.challenge;
}

function isBotMessage(event) {
  return Boolean(event.bot_id) || event.subtype === 'bot_message';
}

function shouldReplyToSlackEvent(normalized, payload, config) {
  const event = payload.event || {};
  if (!normalized.message.id || isBotMessage(event)) return false;
  if (event.type === 'app_mention') return true;
  if (event.type === 'message' && event.channel_type === 'im') return true;
  if (config.slackReplyToAllChannelMessages && event.type === 'message') return true;
  return false;
}

function dedupeKeyFor(normalized) {
  if (normalized.channel?.id && normalized.message?.threadTs) {
    return `slack:${normalized.channel.id}:${normalized.message.threadTs}`;
  }

  return normalized.sourceEventId || normalized.message?.id;
}

async function replyInBackground({ normalized, slackClient, openAiClient }) {
  try {
    const reply = await generateRonReply({ normalizedEvent: normalized, openAiClient });
    await slackClient.postMessage({
      channel: normalized.channel.id,
      text: reply,
      threadTs: normalized.message.threadTs,
    });
  } catch (error) {
    console.error('Slack reply failed:', error.message);
  }
}

export async function handleSlackWebhook({
  rawBody,
  headers,
  config,
  eventStore,
  slackClient,
  openAiClient,
  deduper,
}) {
  const signatureIsValid = verifySlackSignature({
    signingSecret: config.slackSigningSecret,
    timestamp: headers['x-slack-request-timestamp'],
    signature: headers['x-slack-signature'],
    rawBody,
  });

  if (!signatureIsValid) {
    return { status: 401, body: { error: 'Invalid Slack signature.' } };
  }

  const payload = JSON.parse(rawBody.toString('utf8') || '{}');
  if (isSlackUrlVerification(payload)) {
    return { status: 200, body: { challenge: payload.challenge } };
  }

  const normalized = normalizeSlackEvent(payload);
  const isNewEvent = deduper?.claim(dedupeKeyFor(normalized)) ?? true;

  if (!isNewEvent) {
    return { status: 200, body: { ok: true, duplicate: true } };
  }

  await eventStore.append(normalized);

  if (slackClient?.isConfigured() && shouldReplyToSlackEvent(normalized, payload, config)) {
    setImmediate(() => {
      void replyInBackground({ normalized, slackClient, openAiClient });
    });
  }

  return { status: 200, body: { ok: true } };
}
