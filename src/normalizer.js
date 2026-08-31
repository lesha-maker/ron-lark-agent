function parseMessageContent(rawContent) {
  if (!rawContent) return {};
  if (typeof rawContent === 'object') return rawContent;

  try {
    return JSON.parse(rawContent);
  } catch {
    return { text: rawContent };
  }
}

function extractText(message) {
  const content = parseMessageContent(message.content);
  if (typeof content.text === 'string') return content.text;
  if (typeof content.title === 'string') return content.title;
  return JSON.stringify(content);
}

export function normalizeLarkEvent(payload) {
  const header = payload.header || {};
  const event = payload.event || {};
  const message = event.message || {};

  if (header.event_type !== 'im.message.receive_v1') {
    return {
      source: 'lark',
      sourceEventId: header.event_id || null,
      sourceEventType: header.event_type || payload.type || 'unknown',
      occurredAt: header.create_time ? new Date(Number(header.create_time)).toISOString() : new Date().toISOString(),
      raw: payload,
      ignored: true,
      ignoreReason: 'Unsupported Lark event type.',
    };
  }

  return {
    source: 'lark',
    sourceEventId: header.event_id,
    sourceEventType: header.event_type,
    occurredAt: header.create_time ? new Date(Number(header.create_time)).toISOString() : new Date().toISOString(),
    accountKey: null,
    channel: {
      type: message.chat_type || null,
      id: message.chat_id || null,
    },
    actor: {
      openId: event.sender?.sender_id?.open_id || null,
      userId: event.sender?.sender_id?.user_id || null,
      unionId: event.sender?.sender_id?.union_id || null,
    },
    message: {
      id: message.message_id || null,
      type: message.message_type || null,
      text: extractText(message),
      mentions: message.mentions || [],
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
