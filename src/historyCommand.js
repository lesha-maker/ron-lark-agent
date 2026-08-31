const HISTORY_COMMAND_PATTERN = /\b(read|pull|fetch|load|backfill)\b[\s\S]*\b(history|historical|past|previous|old)\b/i;

export function isHistoryBackfillCommand(normalizedEvent) {
  const text = normalizedEvent.message?.text || '';
  return normalizedEvent.channel?.type === 'group' && HISTORY_COMMAND_PATTERN.test(text);
}

export async function handleHistoryBackfillCommand({
  normalizedEvent,
  larkClient,
  eventStore,
  days = 30,
  maxPages = 20,
}) {
  const chatId = normalizedEvent.channel?.id;
  if (!chatId) throw new Error('Cannot backfill history because this message has no chat_id.');

  const { backfillLarkChatHistory } = await import('./historyBackfill.js');
  const result = await backfillLarkChatHistory({
    larkClient,
    eventStore,
    chatId,
    days,
    maxPages,
  });

  return [
    `Done. I pulled ${result.stored} historical messages from this chat.`,
    'I can now use them as account context in the next analysis step.',
  ].join('\n');
}
