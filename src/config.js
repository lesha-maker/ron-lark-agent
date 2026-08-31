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
    openAiApiKey: env.OPENAI_API_KEY || '',
    openAiModel: env.OPENAI_MODEL || 'gpt-5.6-luna',
    eventStorePath: path.resolve(env.EVENT_STORE_PATH || './data/events.jsonl'),
  };
}
