import http from 'node:http';
import { loadDotEnv } from './loadDotEnv.js';
import { loadConfig } from './config.js';
import { JsonlEventStore } from './eventStore.js';
import { LarkClient } from './larkClient.js';
import { handleLarkWebhook } from './larkWebhook.js';
import { OpenAiClient } from './openAiClient.js';
import { TtlDeduper } from './deduper.js';

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

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, service: 'lark-account-agent' }));
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
