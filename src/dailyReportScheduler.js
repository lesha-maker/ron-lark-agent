import { generateDailyAccountReport, localTimeParts, reportDateKey } from './dailyReport.js';
import { dailyReportUrl } from './reportAccess.js';
import { captureAccountSnapshots } from './accountSnapshots.js';

function reportEventId(dateKey) {
  return `daily-account-report:${dateKey}`;
}

async function wasReportSent(eventStore, dateKey) {
  const events = await eventStore.all();
  return events.some((event) => event.source === 'daily_report' && event.sourceEventId === reportEventId(dateKey));
}

export async function readStoredDailyReport({ eventStore, dateKey }) {
  const events = await eventStore.all();
  return events
    .filter((event) => event.source === 'daily_report' && event.sourceEventId === reportEventId(dateKey))
    .at(-1)?.report || null;
}

async function recordReportSent({ eventStore, dateKey, chatId, text, report }) {
  await eventStore.append({
    source: 'daily_report',
    provider: 'ron-scheduler',
    sourceEventId: reportEventId(dateKey),
    sourceEventType: 'daily_report.sent',
    occurredAt: new Date().toISOString(),
    channel: { type: 'lark', id: chatId },
    message: {
      id: reportEventId(dateKey),
      type: 'text',
      text,
    },
    report,
    analysis: {
      actionItems: [],
      risks: [],
      customerSignals: [],
      needsHumanReview: false,
    },
  });
}

export async function sendDailyAccountReportNow({
  config,
  eventStore,
  larkClient,
  openAiClient,
  timelineDocsClient,
  contractsSheetsClient,
  taskClient,
  now = new Date(),
}) {
  if (!config.accountReportLarkChatId) {
    throw new Error('ACCOUNT_REPORT_LARK_CHAT_ID is required to send the daily report.');
  }

  const dateKey = reportDateKey(now, config.dailyReportTimezone);
  const reportUrl = dailyReportUrl({
    publicBaseUrl: config.publicBaseUrl,
    dateKey,
    secret: config.larkAppSecret,
  });
  const snapshotResult = await captureAccountSnapshots({
    eventStore,
    taskClient,
    taskListGuids: config.larkReportTaskListGuids,
    timelineDocsClient,
    timelineWikiToken: config.larkTimelineWikiToken,
    dateKey,
    now,
    force: true,
  });
  const report = await generateDailyAccountReport({
    eventStore,
    openAiClient,
    timelineDocsClient,
    timelineWikiToken: config.larkTimelineWikiToken,
    contractsSheetsClient,
    contractsWikiToken: config.larkContractsWikiToken,
    now,
    timeZone: config.dailyReportTimezone,
    snapshotChangesText: snapshotResult.changesText,
  });
  const message = `Ron Daily Account Report is ready: ${reportUrl}`;

  await larkClient.sendTextToChat(config.accountReportLarkChatId, message);
  await recordReportSent({
    eventStore,
    dateKey,
    chatId: config.accountReportLarkChatId,
    text: message,
    report,
  });

  return { dateKey, report, reportUrl, message };
}

export function startDailyReportScheduler({
  config,
  eventStore,
  larkClient,
  openAiClient,
  timelineDocsClient,
  contractsSheetsClient,
  taskClient,
  intervalMs = 60_000,
}) {
  if (!config.accountReportLarkChatId) {
    console.log('Daily account report scheduler disabled: ACCOUNT_REPORT_LARK_CHAT_ID is not set.');
    return null;
  }

  const [targetHour, targetMinute] = config.dailyReportTime.split(':').map(Number);
  const tick = async () => {
    const now = new Date();
    const parts = localTimeParts(now, config.dailyReportTimezone);
    if (Number(parts.hour) !== targetHour || Number(parts.minute) !== targetMinute) return;

    const dateKey = reportDateKey(now, config.dailyReportTimezone);
    if (await wasReportSent(eventStore, dateKey)) return;

    try {
      await sendDailyAccountReportNow({
        config,
        eventStore,
        larkClient,
        openAiClient,
        timelineDocsClient,
        contractsSheetsClient,
        taskClient,
        now,
      });
      console.log(`Daily account report sent for ${dateKey}.`);
    } catch (error) {
      console.error('Daily account report send failed:', error.message);
    }
  };

  const timer = setInterval(() => {
    void tick();
  }, intervalMs);
  void tick();
  return timer;
}
