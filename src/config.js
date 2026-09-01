import path from 'node:path';

export function loadConfig(env = process.env) {
  const isRailway = Boolean(env.RAILWAY_ENVIRONMENT_NAME || env.RAILWAY_PROJECT_ID);

  return {
    port: Number(env.PORT || 3000),
    host: env.HOST || (isRailway ? '0.0.0.0' : '127.0.0.1'),
    larkOpenBaseUrl: env.LARK_OPEN_BASE_URL || 'https://open.larksuite.com',
    larkAppId: env.LARK_APP_ID || '',
    larkAppSecret: env.LARK_APP_SECRET || '',
    larkBotOpenId: env.LARK_BOT_OPEN_ID || '',
    larkReplyToAllGroupMessages: env.LARK_REPLY_TO_ALL_GROUP_MESSAGES === 'true',
    larkVerificationToken: env.LARK_VERIFICATION_TOKEN || '',
    larkEncryptKey: env.LARK_ENCRYPT_KEY || '',
    larkTimelineWikiToken: env.LARK_TIMELINE_WIKI_TOKEN || 'NcZ1wTy0IipL3VkrvUYlcb6Cgmg',
    larkContractsWikiToken: env.LARK_CONTRACTS_WIKI_TOKEN || 'Xrs2walDQiSAsPkTIfZlZNiZg6e',
    accountReportLarkChatId: env.ACCOUNT_REPORT_LARK_CHAT_ID || '',
    dailyReportTime: env.DAILY_REPORT_TIME || '21:00',
    dailyReportTimezone: env.DAILY_REPORT_TIMEZONE || 'Asia/Singapore',
    publicBaseUrl: (env.PUBLIC_BASE_URL || env.RAILWAY_PUBLIC_DOMAIN || 'https://ron-lark-agent-production.up.railway.app').replace(/\/$/, ''),
    openAiApiKey: env.OPENAI_API_KEY || '',
    openAiModel: env.OPENAI_MODEL || 'gpt-5.6-luna',
    openAiTimeoutMs: Number(env.OPENAI_TIMEOUT_MS || 25_000),
    eventStorePath: path.resolve(env.EVENT_STORE_PATH || './data/events.jsonl'),
    debugToken: env.DEBUG_TOKEN || '',
    emailWebhookSecret: env.EMAIL_WEBHOOK_SECRET || '',
    meetingWebhookSecret: env.MEETING_WEBHOOK_SECRET || env.EMAIL_WEBHOOK_SECRET || '',
    slackSigningSecret: env.SLACK_SIGNING_SECRET || '',
    slackBotToken: env.SLACK_BOT_TOKEN || '',
    slackReplyToAllChannelMessages: env.SLACK_REPLY_TO_ALL_CHANNEL_MESSAGES === 'true',
    whatsappVerifyToken: env.WHATSAPP_VERIFY_TOKEN || '',
    whatsappAppSecret: env.WHATSAPP_APP_SECRET || '',
    whatsappBearerToken: env.WHATSAPP_BEARER_TOKEN || '',
    whatsappPhoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID || '',
  };
}
