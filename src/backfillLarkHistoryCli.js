import { loadDotEnv } from './loadDotEnv.js';
import { loadConfig } from './config.js';
import { JsonlEventStore } from './eventStore.js';
import { LarkClient } from './larkClient.js';
import { backfillLarkChatHistory } from './historyBackfill.js';

function readArg(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

loadDotEnv();

const config = loadConfig();
const chatId = readArg('chat-id') || process.env.BACKFILL_CHAT_ID;
const days = Number(readArg('days') || process.env.BACKFILL_DAYS || 30);
const maxPages = Number(readArg('max-pages') || process.env.BACKFILL_MAX_PAGES || 20);

const result = await backfillLarkChatHistory({
  larkClient: new LarkClient({
    baseUrl: config.larkOpenBaseUrl,
    appId: config.larkAppId,
    appSecret: config.larkAppSecret,
  }),
  eventStore: new JsonlEventStore(config.eventStorePath),
  chatId,
  days,
  maxPages,
});

console.log(JSON.stringify(result, null, 2));
