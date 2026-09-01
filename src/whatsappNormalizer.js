import crypto from 'node:crypto';

function messageText(message) {
  if (message.text?.body) return message.text.body;
  if (message.button?.text) return message.button.text;
  if (message.interactive?.button_reply?.title) return message.interactive.button_reply.title;
  if (message.interactive?.list_reply?.title) return message.interactive.list_reply.title;
  if (message.image?.caption) return message.image.caption;
  if (message.video?.caption) return message.video.caption;
  if (message.document?.caption) return message.document.caption;
  if (message.type) return `[${message.type} message]`;
  return '';
}

function contactName(value, waId) {
  return value.contacts?.find((contact) => contact.wa_id === waId)?.profile?.name || null;
}

export function normalizeWhatsAppWebhook(payload) {
  const events = [];

  for (const entry of payload.entry || []) {
    for (const change of entry.changes || []) {
      const value = change.value || {};
      const metadata = value.metadata || {};

      for (const message of value.messages || []) {
        const waId = message.from || message.author || '';
        const groupId = message.group_id || message.chat_id || message.group?.id || null;

        events.push({
          source: 'whatsapp',
          provider: 'meta-cloud-api',
          sourceEventId: message.id || crypto.randomUUID(),
          sourceEventType: `whatsapp.${message.type || 'message'}`,
          occurredAt: message.timestamp
            ? new Date(Number(message.timestamp) * 1000).toISOString()
            : new Date().toISOString(),
          accountKey: null,
          channel: {
            type: groupId ? 'whatsapp_group' : 'whatsapp_individual',
            id: groupId || waId,
            phoneNumberId: metadata.phone_number_id || null,
            displayPhoneNumber: metadata.display_phone_number || null,
          },
          actor: {
            waId,
            phone: waId,
            name: contactName(value, waId),
          },
          message: {
            id: message.id || null,
            type: message.type || 'unknown',
            text: messageText(message),
            contextId: message.context?.id || null,
          },
          whatsapp: {
            phoneNumberId: metadata.phone_number_id || null,
            displayPhoneNumber: metadata.display_phone_number || null,
            waId,
            contactName: contactName(value, waId),
            groupId,
            rawType: message.type || 'unknown',
          },
          analysis: {
            actionItems: [],
            risks: [],
            customerSignals: [],
            needsHumanReview: true,
          },
          raw: { entryId: entry.id, changeField: change.field, message },
        });
      }
    }
  }

  return events;
}
