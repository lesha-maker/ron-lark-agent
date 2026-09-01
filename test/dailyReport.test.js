import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateDailyAccountReport, localTimeParts, renderDailyAccountReportHtml, reportDateKey } from '../src/dailyReport.js';
import { sendDailyAccountReportNow, startDailyReportScheduler } from '../src/dailyReportScheduler.js';

function memoryStore(initialEvents = []) {
  const events = [...initialEvents];
  return {
    events,
    async append(event) {
      events.push(event);
    },
    async all() {
      return events;
    },
  };
}

test('daily report uses only last 24 hours as movement', async () => {
  const now = new Date('2026-09-01T13:00:00.000Z');
  const report = await generateDailyAccountReport({
    now,
    timeZone: 'Asia/Singapore',
    eventStore: memoryStore([
      {
        source: 'slack',
        occurredAt: '2026-09-01T12:00:00.000Z',
        actor: { userId: 'U123' },
        message: { text: 'Pathkind confirmed Reporting Agent QA today.' },
      },
      {
        source: 'lark',
        occurredAt: '2026-08-30T12:00:00.000Z',
        actor: { openId: 'ou_123' },
        message: { text: 'Old update should be outside the window.' },
      },
    ]),
    openAiClient: {
      isConfigured: () => true,
      async createTextResponse({ instructions, input }) {
        assert.match(instructions, /last 24 hours/);
        assert.match(input, /Pathkind confirmed/);
        assert.doesNotMatch(input, /Old update/);
        assert.match(input, /Live contracts baseline/);
        return 'RON DAILY\nTuesday, September 1, 2026\n\nHeadline: Pathkind moved today';
      },
    },
    timelineDocsClient: {
      async readWikiDocument() {
        return { title: 'Important timelines', content: 'Pathkind on track.' };
      },
    },
    timelineWikiToken: 'timeline',
    contractsSheetsClient: {
      async readContractsOverview() {
        return {
          rows: [{
            client: 'Pathkind',
            agentList: 'Company Brain',
            startDate: '13th July',
            country: 'India',
            firstInvoiceRaised: 'Yes',
            contractAttachments: [],
          }],
        };
      },
    },
    contractsWikiToken: 'contracts',
  });

  assert.match(report, /RON DAILY/);
});

test('sends daily report to configured Lark chat and records sent event', async () => {
  const store = memoryStore();
  const sent = [];
  const result = await sendDailyAccountReportNow({
    config: {
      accountReportLarkChatId: 'oc_report',
      dailyReportTimezone: 'Asia/Singapore',
      larkTimelineWikiToken: 'timeline',
      larkContractsWikiToken: 'contracts',
      publicBaseUrl: 'https://ron.example.com',
      larkAppSecret: 'secret',
    },
    eventStore: store,
    larkClient: {
      async sendTextToChat(chatId, text) {
        sent.push({ chatId, text });
      },
    },
    openAiClient: { isConfigured: () => false },
    now: new Date('2026-09-01T13:00:00.000Z'),
  });

  assert.equal(result.dateKey, '2026-09-01');
  assert.equal(sent[0].chatId, 'oc_report');
  assert.match(sent[0].text, /^Ron Daily Account Report is ready: https:\/\/ron\.example\.com\/api\/accounts\/newspaper\?date=2026-09-01&token=/);
  assert.match(result.reportUrl, /^https:\/\/ron\.example\.com\/api\/accounts\/newspaper\?date=2026-09-01&token=/);
  assert.equal(store.events.at(-1).source, 'daily_report');
});

test('renders daily report as newspaper HTML', () => {
  const html = renderDailyAccountReportHtml({
    reportText: [
      'RON DAILY',
      'Tuesday, September 1, 2026',
      '',
      'Headline: Movement picked up today',
      '',
      'Today’s Movement',
      '- Pathkind: Reporting Agent moved.',
      '',
      'Flags From The Desk',
      '- Dolce is delayed.',
      '',
      'Ron’s Closing Read',
      '- Keep chasing access.',
    ].join('\n'),
    generatedAt: new Date('2026-09-01T13:00:00.000Z'),
  });

  assert.match(html, /<!doctype html>/);
  assert.match(html, /Movement picked up today/);
  assert.match(html, /Pathkind/);
  assert.match(html, /Dolce is delayed/);
});

test('scheduler waits for configured local time', async () => {
  const parts = localTimeParts(new Date('2026-09-01T13:00:00.000Z'), 'Asia/Singapore');
  assert.equal(parts.hour, '21');
  assert.equal(parts.minute, '00');
  assert.equal(reportDateKey(new Date('2026-09-01T13:00:00.000Z'), 'Asia/Singapore'), '2026-09-01');
});

test('scheduler is disabled until report chat is configured', () => {
  const timer = startDailyReportScheduler({
    config: { accountReportLarkChatId: '' },
    eventStore: memoryStore(),
    larkClient: {},
    openAiClient: {},
  });

  assert.equal(timer, null);
});
