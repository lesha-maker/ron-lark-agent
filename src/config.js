import path from 'node:path';

function normalizePublicBaseUrl(value) {
  const raw = String(value || 'https://ron-lark-agent-production.up.railway.app').replace(/\/$/, '');
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
}

const DEFAULT_TASK_LIST_GUIDS = [
  '7882b6a5-3269-4916-8cc4-a90067bdc55f',
  '60cb9c29-db95-4694-ab64-14a15a589e0c',
  'bcab27b0-165e-4d11-a091-3bd5a8611346',
  '958bd61f-1afc-430a-b5ba-c97a4da4a021',
  '207a49c7-89f5-4cfd-bd10-76107195e9de',
  '185ecc4a-16d4-4277-9c65-ead294fcd8c5',
  '67d1f97d-ce76-48e5-8d97-b4c0e8af791f',
];

function parseList(value, fallback = []) {
  const raw = String(value || '').trim();
  if (!raw) return fallback;
  return raw.split(/[\s,]+/).map((item) => item.trim()).filter(Boolean);
}

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
    larkReportTaskListGuids: parseList(env.LARK_REPORT_TASK_LIST_GUIDS, DEFAULT_TASK_LIST_GUIDS),
    larkUserOAuthScopes: env.LARK_USER_OAUTH_SCOPES || 'offline_access,task:tasklist:read,task:tasklist:write,task:task:read,task:task:write,task:section:read,task:section:write',
    accountReportLarkChatId: env.ACCOUNT_REPORT_LARK_CHAT_ID || '',
    dailyReportTime: env.DAILY_REPORT_TIME || '21:00',
    dailyReportTimezone: env.DAILY_REPORT_TIMEZONE || 'Asia/Singapore',
    publicBaseUrl: normalizePublicBaseUrl(env.PUBLIC_BASE_URL || env.RAILWAY_PUBLIC_DOMAIN),
    openAiApiKey: env.OPENAI_API_KEY || '',
    openAiModel: env.OPENAI_MODEL || 'gpt-5.6-luna',
    openAiTimeoutMs: Number(env.OPENAI_TIMEOUT_MS || 60_000),
    eventStorePath: path.resolve(env.EVENT_STORE_PATH || './data/events.jsonl'),
    debugToken: env.DEBUG_TOKEN || '',
    larkUserTokenPath: path.resolve(env.LARK_USER_TOKEN_PATH || './data/lark-user-token.json'),
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
