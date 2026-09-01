import { generateRonReply } from './conversationAgent.js';
import { generateAccountSummary, isAccountSummaryCommand } from './accountBrain.js';
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

function eventDedupeKeyFor(normalized) {
  return `slack-event:${normalized.sourceEventId || normalized.message?.id}`;
}

function replyDedupeKeyFor(normalized) {
  if (normalized.channel?.id && normalized.message?.threadTs) {
    return `slack-reply:${normalized.channel.id}:${normalized.message.threadTs}`;
  }

  return `slack-reply:${normalized.message?.id || normalized.sourceEventId}`;
}

async function replyInBackground({
  normalized,
  config,
  slackClient,
  openAiClient,
  eventStore,
  timelineDocsClient,
  contractsSheetsClient,
}) {
  try {
    const reply = isAccountSummaryCommand(normalized)
      ? await generateAccountSummary({
        normalizedEvent: normalized,
        eventStore,
        openAiClient,
        timelineDocsClient,
        timelineWikiToken: config.larkTimelineWikiToken,
        contractsSheetsClient,
        contractsWikiToken: config.larkContractsWikiToken,
      })
      : await generateRonReply({ normalizedEvent: normalized, openAiClient });
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
  timelineDocsClient,
  contractsSheetsClient,
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
  const isNewEvent = deduper?.claim(eventDedupeKeyFor(normalized)) ?? true;

  if (!isNewEvent) {
    return { status: 200, body: { ok: true, duplicate: true } };
  }

  await eventStore.append(normalized);

  if (slackClient?.isConfigured() && shouldReplyToSlackEvent(normalized, payload, config)) {
    const shouldSendReply = deduper?.claim(replyDedupeKeyFor(normalized)) ?? true;
    if (shouldSendReply) {
      setImmediate(() => {
        void replyInBackground({
          normalized,
          config,
          slackClient,
          openAiClient,
          eventStore,
          timelineDocsClient,
          contractsSheetsClient,
        });
      });
    }
  }

  return { status: 200, body: { ok: true } };
}
