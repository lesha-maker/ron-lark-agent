export function normalizeSlackEvent(payload) {
  const event = payload.event || {};
  const occurredAt = event.event_ts || event.ts
    ? new Date(Number(event.event_ts || event.ts) * 1000).toISOString()
    : new Date().toISOString();

  return {
    source: 'slack',
    sourceEventId: payload.event_id || `${event.channel}:${event.ts}`,
    sourceEventType: event.type || payload.type || 'unknown',
    occurredAt,
    accountKey: null,
    channel: {
      type: event.channel_type || null,
      id: event.channel || null,
      teamId: payload.team_id || null,
    },
    actor: {
      userId: event.user || null,
      botId: event.bot_id || null,
    },
    message: {
      id: event.client_msg_id || event.ts || null,
      threadTs: event.thread_ts || event.ts || null,
      type: event.type || null,
      subtype: event.subtype || null,
      text: event.text || '',
      mentions: Array.from((event.text || '').matchAll(/<@([A-Z0-9]+)>/g)).map((match) => match[1]),
    },
    analysis: {
      actionItems: [],
      risks: [],
      customerSignals: [],
      needsHumanReview: true,
    },
    raw: payload,
  };
}
