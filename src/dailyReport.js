const DAY_MS = 24 * 60 * 60 * 1000;

const DAILY_REPORT_INSTRUCTIONS = [
  'You are Ron, an account management agent writing a daily internal account report.',
  'The report must be based primarily on the last 24 hours of daily movement from Lark, Slack, email, and meeting notes.',
  'Use the live timeline document only as baseline context for target dates and whether a client is expected to be on track.',
  'Use the live contracts spreadsheet only as baseline context for contract, invoice, start date, country, and purchased agent facts.',
  'Do not invent movement. If there was no fresh signal for a client, say no new movement today and explain whether the baseline still carries risk.',
  'Write in a concise newspaper style.',
  'Return plain text suitable for chat, not HTML.',
  'Use this exact structure: RON DAILY, date line, headline, Today’s Movement, Flags From The Desk, Ron’s Closing Read.',
  'Include one line per client under Today’s Movement.',
  'Keep it under 700 words.',
].join('\n');

function eventToLine(event) {
  const source = event.source || 'unknown';
  const time = event.occurredAt || '';
  const actor =
    event.actor?.email ||
    event.actor?.userId ||
    event.actor?.openId ||
    event.email?.from?.email ||
    event.email?.from?.name ||
    'unknown';
  const title = event.meeting?.title || event.email?.subject || '';
  const text =
    event.message?.text ||
    event.email?.text ||
    event.email?.subject ||
    event.meeting?.notesTitle ||
    '';
  const preview = String(text).replace(/\s+/g, ' ').trim().slice(0, 500);
  const label = title ? ` title="${title}"` : '';
  return `[${time}] ${source}${label} actor=${actor}: ${preview}`;
}

function formatContractsOverview(contractsOverview) {
  if (!contractsOverview?.rows?.length) return '(not available)';

  return contractsOverview.rows.map((row) => [
    row.client,
    `agents=${row.agentList || 'unknown'}`,
    `start=${row.startDate || 'unknown'}`,
    `country=${row.country || 'unknown'}`,
    `invoiceRaised=${row.firstInvoiceRaised || 'unknown'}`,
    `contracts=${row.contractAttachments?.length || 0}`,
  ].join(' | ')).join('\n');
}

function formatDateForReport(date, timeZone) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date);
}

function fallbackReport({ date, timeZone, events, contractsOverview }) {
  const clients = contractsOverview?.rows?.map((row) => row.client).filter(Boolean) || [];
  const movement = clients.length
    ? clients.map((client) => `- ${client}: No AI-written read available; ${events.length} total daily events were captured across connected sources.`)
    : ['- No client roster available from the contracts spreadsheet.'];

  return [
    'RON DAILY',
    formatDateForReport(date, timeZone),
    '',
    'Headline: Daily movement captured, but OpenAI is unavailable for full account judgment',
    '',
    'Today’s Movement',
    ...movement,
    '',
    'Flags From The Desk',
    '- Review the raw daily events because Ron could not generate a deeper judgment.',
    '',
    'Ron’s Closing Read',
    '- The reporting pipeline is present, but OpenAI needs to be configured for the proper newspaper report.',
  ].join('\n');
}

async function safeReadTimeline({ timelineDocsClient, timelineWikiToken }) {
  if (!timelineDocsClient || !timelineWikiToken) return null;
  try {
    return await timelineDocsClient.readWikiDocument(timelineWikiToken);
  } catch (error) {
    console.error('Daily report timeline read failed:', error.message);
    return { title: 'Unavailable', content: `Timeline read failed: ${error.message}` };
  }
}

async function safeReadContracts({ contractsSheetsClient, contractsWikiToken }) {
  if (!contractsSheetsClient || !contractsWikiToken) return null;
  try {
    return await contractsSheetsClient.readContractsOverview(contractsWikiToken);
  } catch (error) {
    console.error('Daily report contracts read failed:', error.message);
    return { title: 'Unavailable', rows: [], error: `Contracts read failed: ${error.message}` };
  }
}

export async function generateDailyAccountReport({
  eventStore,
  openAiClient,
  timelineDocsClient,
  timelineWikiToken,
  contractsSheetsClient,
  contractsWikiToken,
  now = new Date(),
  timeZone = 'Asia/Singapore',
}) {
  const since = new Date(now.getTime() - DAY_MS);
  const allEvents = await eventStore.all();
  const dailyEvents = allEvents.filter((event) => {
    if (event.source === 'daily_report') return false;
    const occurredAt = event.occurredAt ? new Date(event.occurredAt) : null;
    return occurredAt && occurredAt >= since && occurredAt <= now;
  });
  const timelineDoc = await safeReadTimeline({ timelineDocsClient, timelineWikiToken });
  const contractsOverview = await safeReadContracts({ contractsSheetsClient, contractsWikiToken });

  if (!openAiClient?.isConfigured()) {
    return fallbackReport({ date: now, timeZone, events: dailyEvents, contractsOverview });
  }

  const input = [
    `Report date: ${formatDateForReport(now, timeZone)}`,
    `Window start: ${since.toISOString()}`,
    `Window end: ${now.toISOString()}`,
    '',
    'Last 24 hours of movement:',
    dailyEvents.map(eventToLine).join('\n') || '(none)',
    '',
    'Live timeline baseline:',
    timelineDoc
      ? `Title: ${timelineDoc.title || 'Untitled'}\n${String(timelineDoc.content || '').slice(0, 12000)}`
      : '(not configured)',
    '',
    'Live contracts baseline:',
    contractsOverview?.error || formatContractsOverview(contractsOverview),
  ].join('\n');

  try {
    return await openAiClient.createTextResponse({
      instructions: DAILY_REPORT_INSTRUCTIONS,
      input,
      maxOutputTokens: 1200,
    });
  } catch (error) {
    console.error('Daily account report failed:', error.message);
    return fallbackReport({ date: now, timeZone, events: dailyEvents, contractsOverview });
  }
}

export function reportDateKey(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function localTimeParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}
