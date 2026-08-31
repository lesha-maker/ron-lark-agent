import { buildPresenceReply } from './agentResponder.js';

const RON_INSTRUCTIONS = [
  'You are Ron, an account management agent that lives in Lark chats.',
  'You are warm, concise, and conversational. Sound like a capable teammate, not a ticketing system.',
  'Your job is to help account teams track customers, commitments, blockers, risks, and next steps.',
  'If the user just says hello, greet them naturally and briefly explain what you can help with.',
  'If the message contains a request, answer directly and ask at most one useful follow-up question.',
  'Do not claim you checked email, calendar, WhatsApp, Slack, CRM, or meeting notes unless that context is provided.',
  'Do not invent account facts. Be clear when you are only reacting to the current chat message.',
  'Keep replies under 90 words unless the user asks for a longer summary.',
].join('\n');

function buildRonInput(normalizedEvent) {
  return [
    `Channel type: ${normalizedEvent.channel.type || 'unknown'}`,
    `Sender open id: ${normalizedEvent.actor.openId || 'unknown'}`,
    `Message: ${normalizedEvent.message.text || ''}`,
  ].join('\n');
}

export async function generateRonReply({ normalizedEvent, openAiClient }) {
  if (!openAiClient?.isConfigured()) {
    return buildPresenceReply(normalizedEvent);
  }

  try {
    return await openAiClient.createTextResponse({
      instructions: RON_INSTRUCTIONS,
      input: buildRonInput(normalizedEvent),
    });
  } catch (error) {
    console.error('OpenAI reply failed:', error.message);
    return buildPresenceReply(normalizedEvent);
  }
}
