function messageMentionsBot(normalizedEvent, botOpenId) {
  if (!botOpenId) return false;

  return normalizedEvent.message.mentions.some((mention) => {
    const mentionId = mention.id || mention;
    return mentionId.open_id === botOpenId || mentionId.user_id === botOpenId || mentionId === botOpenId;
  });
}

export function shouldReplyToLarkMessage(normalizedEvent, config) {
  if (normalizedEvent.ignored || normalizedEvent.sourceEventType !== 'im.message.receive_v1') return false;
  if (!normalizedEvent.message.id) return false;
  if (normalizedEvent.channel.type === 'p2p') return true;
  if (config.larkReplyToAllGroupMessages) return true;

  return messageMentionsBot(normalizedEvent, config.larkBotOpenId);
}

export function buildPresenceReply(normalizedEvent) {
  const text = normalizedEvent.message.text?.trim();
  const trimmedText = text && text.length > 160 ? `${text.slice(0, 157)}...` : text;

  if (!trimmedText) {
    return 'Ron here. I am tracking this account thread and watching for follow-ups, risks, and next steps.';
  }

  return [
    `Got it. I am tracking this: "${trimmedText}"`,
    'Once account mapping is connected, I will tie this back to the right customer, owner, and follow-up list.',
  ].join('\n');
}
