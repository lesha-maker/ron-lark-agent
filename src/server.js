import http from 'node:http';
import { loadDotEnv } from './loadDotEnv.js';
import { loadConfig } from './config.js';
import { JsonlEventStore } from './eventStore.js';
import { LarkClient } from './larkClient.js';
import { handleLarkWebhook } from './larkWebhook.js';
import { OpenAiClient } from './openAiClient.js';
import { TtlDeduper } from './deduper.js';
import { backfillLarkChatHistory } from './historyBackfill.js';

loadDotEnv();

const config = loadConfig();
const eventStore = new JsonlEventStore(config.eventStorePath);
const deduper = new TtlDeduper();
const larkClient = new LarkClient({
  baseUrl: config.larkOpenBaseUrl,
  appId: config.larkAppId,
  appSecret: config.larkAppSecret,
});
const openAiClient = new OpenAiClient({
  apiKey: config.openAiApiKey,
  model: config.openAiModel,
});

async function readRequestBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

function isAuthorizedDebugRequest(req) {
  if (!config.debugToken) return false;
  return req.headers.authorization === `Bearer ${config.debugToken}`;
}

function redactEvent(event) {
  return {
    source: event.source,
    sourceEventId: event.sourceEventId,
    sourceEventType: event.sourceEventType,
    occurredAt: event.occurredAt,
    channel: event.channel,
    actor: event.actor,
    message: {
      id: event.message?.id || null,
      type: event.message?.type || null,
      textPreview: event.message?.text ? event.message.text.slice(0, 160) : '',
      mentionsCount: event.message?.mentions?.length || 0,
    },
    ignored: event.ignored || false,
  };
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, service: 'lark-account-agent' }));
      return;
    }

    if (req.method === 'GET' && req.url?.startsWith('/debug/recent-events')) {
      if (!isAuthorizedDebugRequest(req)) {
        res.writeHead(401, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized.' }));
        return;
      }

      const events = await eventStore.recent(20);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ events: events.map(redactEvent) }));
      return;
    }

    if (req.method === 'POST' && req.url === '/admin/backfill/lark-history') {
      if (!isAuthorizedDebugRequest(req)) {
        res.writeHead(401, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized.' }));
        return;
      }

      const rawBody = await readRequestBody(req);
      const body = JSON.parse(rawBody.toString('utf8') || '{}');
      const result = await backfillLarkChatHistory({
        larkClient,
        eventStore,
        chatId: body.chatId,
        days: body.days,
        startTime: body.startTime,
        endTime: body.endTime,
        maxPages: body.maxPages,
        pageSize: body.pageSize,
      });

      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(result));
      return;
    }

    if (req.method === 'POST' && req.url === '/webhooks/lark') {
      const rawBody = await readRequestBody(req);
      const result = await handleLarkWebhook({
        rawBody,
        headers: req.headers,
        config,
        eventStore,
        larkClient,
        openAiClient,
        deduper,
      });

      res.writeHead(result.status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(result.body));
      return;
    }

    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found.' }));
  } catch (error) {
    res.writeHead(500, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: error.message }));
  }
});

server.listen(config.port, config.host, () => {
  console.log(`Lark account agent listening on http://${config.host}:${config.port}`);
});
