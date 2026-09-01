import crypto from 'node:crypto';

function firstValue(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== '');
}

function normalizeAddressList(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.flatMap((item) => normalizeAddressList(item));
  }
  if (typeof value === 'object') {
    const email = firstValue(value.email, value.Email, value.address, value.mail);
    const name = firstValue(value.name, value.Name);
    return email ? [{ name: name || null, email }] : [];
  }

  return String(value)
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const match = part.match(/^(.*)<([^>]+)>$/);
      if (!match) return { name: null, email: part };
      return {
        name: match[1].trim().replace(/^"|"$/g, '') || null,
        email: match[2].trim(),
      };
    });
}

function extractTextBody(payload) {
  return firstValue(
    payload.text,
    payload.TextBody,
    payload['body-plain'],
    payload.plain,
    payload.plainText,
    payload.bodyPlain,
    payload.body,
    payload.Body,
    ''
  );
}

function extractHtmlBody(payload) {
  return firstValue(
    payload.html,
    payload.HtmlBody,
    payload['body-html'],
    payload.htmlBody,
    ''
  );
}

export function normalizeInboundEmail(payload, provider = 'generic') {
  const sourceMessageId = firstValue(
    payload.messageId,
    payload.MessageID,
    payload['Message-Id'],
    payload['message-id'],
    payload.id,
    crypto.randomUUID()
  );

  const text = extractTextBody(payload);

  return {
    source: 'email',
    provider,
    sourceEventId: String(sourceMessageId),
    sourceEventType: 'email.inbound',
    occurredAt: firstValue(payload.date, payload.Date)
      ? new Date(firstValue(payload.date, payload.Date)).toISOString()
      : new Date().toISOString(),
    accountKey: null,
    email: {
      messageId: String(sourceMessageId),
      threadId: firstValue(payload.threadId, payload.ThreadID, payload.conversationId, null),
      from: normalizeAddressList(firstValue(payload.from, payload.From))[0] || null,
      to: normalizeAddressList(firstValue(payload.to, payload.To)),
      cc: normalizeAddressList(firstValue(payload.cc, payload.Cc)),
      bcc: normalizeAddressList(firstValue(payload.bcc, payload.Bcc)),
      subject: firstValue(payload.subject, payload.Subject, ''),
      text,
      html: extractHtmlBody(payload),
      attachments: payload.attachments || payload.Attachments || [],
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
