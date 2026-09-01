import http from 'node:http';
import { loadDotEnv } from './loadDotEnv.js';
import { loadConfig } from './config.js';
import { JsonlEventStore } from './eventStore.js';
import { LarkClient } from './larkClient.js';
import { handleLarkWebhook } from './larkWebhook.js';
import { OpenAiClient } from './openAiClient.js';
import { TtlDeduper } from './deduper.js';
import { backfillLarkChatHistory } from './historyBackfill.js';
import { APP_VERSION } from './version.js';
import { handleInboundEmailWebhook } from './emailWebhook.js';
import { SlackClient } from './slackClient.js';
import { handleSlackWebhook } from './slackWebhook.js';
import { generateAccountSummary } from './accountBrain.js';
import { LarkDocsClient } from './larkDocsClient.js';
import { LarkSheetsClient } from './larkSheetsClient.js';
import { handleMeetingNotesWebhook } from './meetingWebhook.js';
import { generateDailyAccountReport, renderDailyAccountReportHtml } from './dailyReport.js';
import { sendDailyAccountReportNow, startDailyReportScheduler } from './dailyReportScheduler.js';

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
const slackClient = new SlackClient({
  botToken: config.slackBotToken,
});
const timelineDocsClient = new LarkDocsClient({
  baseUrl: config.larkOpenBaseUrl,
  larkClient,
});
const contractsSheetsClient = new LarkSheetsClient({
  baseUrl: config.larkOpenBaseUrl,
  larkClient,
});
startDailyReportScheduler({
  config,
  eventStore,
  larkClient,
  openAiClient,
  timelineDocsClient,
  contractsSheetsClient,
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
    email: event.email ? {
      messageId: event.email.messageId,
      from: event.email.from,
      to: event.email.to,
      cc: event.email.cc,
      subject: event.email.subject,
      textPreview: event.email.text ? event.email.text.slice(0, 160) : '',
    } : undefined,
    meeting: event.meeting ? {
      eventId: event.meeting.eventId,
      title: event.meeting.title,
      startTime: event.meeting.startTime,
      endTime: event.meeting.endTime,
      organizer: event.meeting.organizer,
      attendeesCount: event.meeting.attendees?.length || 0,
      attachmentsCount: event.meeting.attachments?.length || 0,
      notesTitle: event.meeting.notesTitle,
      notesUrl: event.meeting.notesUrl,
      textPreview: event.message?.text ? event.message.text.slice(0, 160) : '',
    } : undefined,
    ignored: event.ignored || false,
  };
}

const server = http.createServer(async (req, res) => {
  try {
    const requestUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const pathname = requestUrl.pathname;

    if (req.method === 'GET' && pathname === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, service: 'lark-account-agent', version: APP_VERSION }));
      return;
    }

    if (req.method === 'GET' && pathname === '/version') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ version: APP_VERSION }));
      return;
    }

    if (req.method === 'GET' && pathname === '/debug/recent-events') {
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

    if (req.method === 'POST' && pathname === '/admin/backfill/lark-history') {
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

    if (req.method === 'GET' && pathname === '/debug/slack-auth') {
      if (!isAuthorizedDebugRequest(req)) {
        res.writeHead(401, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized.' }));
        return;
      }

      const auth = await slackClient.authTest();
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        ok: true,
        team: auth.team,
        user: auth.user,
        userId: auth.user_id,
        botId: auth.bot_id,
      }));
      return;
    }

    if (req.method === 'POST' && pathname === '/admin/summarize') {
      if (!isAuthorizedDebugRequest(req)) {
        res.writeHead(401, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized.' }));
        return;
      }

      const rawBody = await readRequestBody(req);
      const body = JSON.parse(rawBody.toString('utf8') || '{}');
      const summary = await generateAccountSummary({
        normalizedEvent: {
          source: body.source,
          channel: { id: body.channelId },
          actor: {},
          message: { text: body.prompt || 'summarize this account' },
        },
        eventStore,
        openAiClient,
        timelineDocsClient,
        timelineWikiToken: config.larkTimelineWikiToken,
        contractsSheetsClient,
        contractsWikiToken: config.larkContractsWikiToken,
        limit: body.limit || 200,
      });

      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, summary }));
      return;
    }

    if (req.method === 'POST' && pathname === '/admin/reports/daily/preview') {
      if (!isAuthorizedDebugRequest(req)) {
        res.writeHead(401, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized.' }));
        return;
      }

      const report = await generateDailyAccountReport({
        eventStore,
        openAiClient,
        timelineDocsClient,
        timelineWikiToken: config.larkTimelineWikiToken,
        contractsSheetsClient,
        contractsWikiToken: config.larkContractsWikiToken,
        now: new Date(),
        timeZone: config.dailyReportTimezone,
      });

      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, report }));
      return;
    }

    if (req.method === 'POST' && pathname === '/admin/reports/daily/send') {
      if (!isAuthorizedDebugRequest(req)) {
        res.writeHead(401, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized.' }));
        return;
      }

      const result = await sendDailyAccountReportNow({
        config,
        eventStore,
        larkClient,
        openAiClient,
        timelineDocsClient,
        contractsSheetsClient,
        now: new Date(),
      });

      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, dateKey: result.dateKey, report: result.report }));
      return;
    }

    if (req.method === 'GET' && pathname === '/api/accounts/newspaper') {
      const dateParam = requestUrl.searchParams.get('date');
      const reportDate = dateParam ? new Date(`${dateParam}T13:00:00.000Z`) : new Date();
      const report = await generateDailyAccountReport({
        eventStore,
        openAiClient,
        timelineDocsClient,
        timelineWikiToken: config.larkTimelineWikiToken,
        contractsSheetsClient,
        contractsWikiToken: config.larkContractsWikiToken,
        now: reportDate,
        timeZone: config.dailyReportTimezone,
      });
      const html = renderDailyAccountReportHtml({
        reportText: report,
        generatedAt: new Date(),
        timeZone: config.dailyReportTimezone,
      });

      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }

    if (req.method === 'POST' && pathname === '/admin/slack/test-message') {
      if (!isAuthorizedDebugRequest(req)) {
        res.writeHead(401, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized.' }));
        return;
      }

      const rawBody = await readRequestBody(req);
      const body = JSON.parse(rawBody.toString('utf8') || '{}');
      const result = await slackClient.postMessage({
        channel: body.channel,
        text: body.text || 'Ron Slack test message.',
        threadTs: body.threadTs,
      });

      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, ts: result.ts, channel: result.channel }));
      return;
    }

    if (req.method === 'POST' && pathname === '/webhooks/lark') {
      const rawBody = await readRequestBody(req);
      const result = await handleLarkWebhook({
        rawBody,
        headers: req.headers,
        config,
        eventStore,
        larkClient,
        openAiClient,
        timelineDocsClient,
        contractsSheetsClient,
        deduper,
      });

      res.writeHead(result.status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(result.body));
      return;
    }

    if (req.method === 'POST' && pathname === '/webhooks/email/inbound') {
      const rawBody = await readRequestBody(req);
      const result = await handleInboundEmailWebhook({
        rawBody,
        headers: req.headers,
        config,
        eventStore,
      });

      res.writeHead(result.status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(result.body));
      return;
    }

    if (req.method === 'POST' && pathname === '/webhooks/meet/notes') {
      const rawBody = await readRequestBody(req);
      const result = await handleMeetingNotesWebhook({
        rawBody,
        headers: req.headers,
        config,
        eventStore,
      });

      res.writeHead(result.status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(result.body));
      return;
    }

    if (req.method === 'POST' && pathname === '/webhooks/slack') {
      const rawBody = await readRequestBody(req);
      const result = await handleSlackWebhook({
        rawBody,
        headers: req.headers,
        config,
        eventStore,
        slackClient,
        openAiClient,
        timelineDocsClient,
        contractsSheetsClient,
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
