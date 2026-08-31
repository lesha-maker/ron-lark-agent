import { normalizeLarkEvent } from './normalizer.js';

function toSeconds(date) {
  return Math.floor(date.getTime() / 1000);
}

function messageToSyntheticEvent(message, chatId) {
  const createTime = message.create_time || message.update_time || String(Date.now());

  return {
    schema: '2.0',
    header: {
      event_id: `history:${message.message_id}`,
      event_type: 'im.message.receive_v1',
      create_time: String(Number(createTime) * (String(createTime).length === 10 ? 1000 : 1)),
    },
    event: {
      sender: {
        sender_type: message.sender?.sender_type || 'user',
        sender_id: message.sender?.id || message.sender_id || {},
      },
      message: {
        message_id: message.message_id,
        chat_id: message.chat_id || chatId,
        chat_type: message.chat_type || 'group',
        message_type: message.msg_type || message.message_type,
        content: message.body?.content || message.content,
        mentions: message.mentions || [],
        create_time: message.create_time,
        update_time: message.update_time,
      },
    },
  };
}

export async function backfillLarkChatHistory({
  larkClient,
  eventStore,
  chatId,
  days = 30,
  startTime,
  endTime,
  maxPages = 20,
  pageSize = 50,
}) {
  if (!chatId) throw new Error('chatId is required.');

  const now = new Date();
  const resolvedEndTime = endTime || toSeconds(now);
  const resolvedStartTime = startTime || toSeconds(new Date(now.getTime() - Number(days) * 24 * 60 * 60 * 1000));
  let pageToken;
  let pages = 0;
  let stored = 0;

  do {
    const page = await larkClient.listMessages({
      containerId: chatId,
      startTime: resolvedStartTime,
      endTime: resolvedEndTime,
      pageSize,
      pageToken,
    });

    for (const message of page.items || []) {
      const normalized = normalizeLarkEvent(messageToSyntheticEvent(message, chatId));
      normalized.ingestion = {
        mode: 'history_backfill',
        backfilledAt: new Date().toISOString(),
      };
      await eventStore.append(normalized);
      stored += 1;
    }

    pages += 1;
    pageToken = page.has_more && pages < maxPages ? page.page_token : undefined;
  } while (pageToken);

  return {
    chatId,
    startTime: resolvedStartTime,
    endTime: resolvedEndTime,
    pages,
    stored,
  };
}
