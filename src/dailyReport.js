const DAY_MS = 24 * 60 * 60 * 1000;

const KNOWN_CHANNEL_HINTS = [
  ['lark', 'oc_f7c46b8f6e8ece8b4c623153c030ff66', 'Leverage'],
  ['lark', 'oc_8b7b430874ef65683e2e48bee05b9917', 'Pathkind'],
  ['lark', 'oc_4140a8d2f7ab06b9be2d5832cf3f7471', 'Pathkind'],
  ['lark', 'oc_097e8272eee10ee241bb61d0c6ec3471', 'iBeauty'],
  ['lark', 'oc_820890aa8e48075edd2e47ab65a8f288', 'Red Alpha'],
  ['lark', 'oc_f55681e01169b47ca93ec344bb985f36', 'DS18'],
  ['lark', 'oc_bd65d4499aa17fbadb4fc68de8d537ee', 'DS18'],
  ['lark', 'oc_6ff3624aaa1b2203b8d14c5aa0068ffa', 'Dali.ph'],
];

const DAILY_REPORT_INSTRUCTIONS = [
  'You are Ron, an account management agent writing a daily internal account report.',
  'The report must be based primarily on the last 24 hours of daily movement from Lark, Slack, WhatsApp, email, and meeting notes.',
  'Use the live timeline document only as baseline context for target dates and whether a client is expected to be on track.',
  'Use the live contracts spreadsheet only as baseline context for contract, invoice, start date, country, and purchased agent facts.',
  'Do not move evidence between clients. Attribute a movement to a client only if the text names the client, the source channel maps to that client, or the meeting/email subject clearly identifies that client.',
  'If a source is ambiguous, put it in Flags From The Desk as an unassigned signal instead of guessing.',
  'Do not invent movement. If there was no fresh signal for a client, say no new movement today and explain whether the baseline still carries risk.',
  'Write in a concise newspaper style.',
  'Return plain text suitable for chat, not HTML.',
  'Use this exact structure: RON DAILY, date line, headline, Today’s Movement, Flags From The Desk, Ron’s Closing Read.',
  'Under Today’s Movement, include one detailed brief per client in this format: - Client: Status — Movement from the last 24 hours. Why it matters. Next action.',
  'Each client brief should be 2 to 4 short sentences, not a one-liner.',
  'Keep it under 1100 words.',
].join('\n');

function eventToLine(event) {
  const source = event.source || 'unknown';
  const time = event.occurredAt || '';
  const channel = event.channel?.id ? ` channel=${event.channel.id}` : '';
  const channelType = event.channel?.type ? ` channelType=${event.channel.type}` : '';
  const actor =
    event.actor?.email ||
    event.actor?.userId ||
    event.actor?.openId ||
    event.actor?.waId ||
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
  return `[${time}] ${source}${channel}${channelType}${label} actor=${actor}: ${preview}`;
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

function formatChannelHints() {
  return KNOWN_CHANNEL_HINTS
    .map(([source, channelId, client]) => `${source} channel=${channelId} => ${client}`)
    .join('\n');
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
    'Known channel-to-client hints:',
    formatChannelHints(),
    '',
    'Last 24 hours of movement:',
    dailyEvents.map(eventToLine).join('\n') || '(none)',
    '',
    'Live timeline baseline:',
    timelineDoc
      ? `Title: ${timelineDoc.title || 'Untitled'}\n${String(timelineDoc.content || '').slice(0, 8000)}`
      : '(not configured)',
    '',
    'Live contracts baseline:',
    contractsOverview?.error || formatContractsOverview(contractsOverview),
  ].join('\n');

  try {
    return await openAiClient.createTextResponse({
      instructions: DAILY_REPORT_INSTRUCTIONS,
      input,
      maxOutputTokens: 900,
    });
  } catch (error) {
    console.error('Daily account report failed:', error.message);
    return fallbackReport({ date: now, timeZone, events: dailyEvents, contractsOverview });
  }
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function reportLineSections(reportText) {
  const lines = String(reportText || '').split(/\r?\n/);
  const title = lines.find((line) => line.trim() && !line.includes(',')) || 'RON DAILY';
  const dateLine = lines.find((line) => /^[A-Za-z]+,\s/.test(line.trim())) || '';
  const headlineLine = lines.find((line) => /^Headline:/i.test(line.trim())) || '';
  const headline = headlineLine.replace(/^Headline:\s*/i, '') || 'Daily Account Report';
  const movementIndex = lines.findIndex((line) => /^Today.?s Movement$/i.test(line.trim()));
  const flagsIndex = lines.findIndex((line) => /^Flags From The Desk$/i.test(line.trim()));
  const closingIndex = lines.findIndex((line) => /^Ron.?s Closing Read$/i.test(line.trim()));

  const slice = (start, end) => start >= 0
    ? lines.slice(start + 1, end >= 0 ? end : undefined).map((line) => line.trim()).filter(Boolean)
    : [];

  return {
    title,
    dateLine,
    headline,
    movement: slice(movementIndex, flagsIndex),
    flags: slice(flagsIndex, closingIndex),
    closing: slice(closingIndex, -1),
    raw: reportText,
  };
}

export function renderDailyAccountReportHtml({ reportText, generatedAt = new Date(), timeZone = 'Asia/Singapore' }) {
  const sections = reportLineSections(reportText);
  const generated = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(generatedAt);
  const movement = sections.movement.length ? sections.movement : ['No client movement lines were generated.'];
  const flags = sections.flags.length ? sections.flags : ['No flags generated.'];
  const closing = sections.closing.join(' ') || 'No closing read generated.';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(sections.title)} - ${escapeHtml(sections.dateLine)}</title>
  <style>
    :root { --ink:#171717; --muted:#5f5d58; --rule:#c8c0b3; --paper:#f7f2e8; --accent:#9f2f22; --green:#136f4a; --amber:#9a650c; --red:#a53125; }
    * { box-sizing:border-box; }
    body { margin:0; background:#e7e0d3; color:var(--ink); font-family:Georgia,"Times New Roman",serif; line-height:1.45; }
    .page { width:min(1120px,calc(100vw - 32px)); margin:24px auto; background:var(--paper); border:1px solid var(--rule); box-shadow:0 18px 50px rgba(35,28,20,.18); }
    .masthead { padding:28px 34px 18px; border-bottom:4px double var(--ink); text-align:center; }
    .kicker { display:flex; justify-content:space-between; gap:16px; color:var(--muted); font-family:Arial,sans-serif; font-size:12px; font-weight:700; letter-spacing:.08em; text-transform:uppercase; }
    h1 { margin:10px 0 0; font-size:clamp(54px,8vw,112px); line-height:.9; letter-spacing:0; text-transform:uppercase; }
    .tagline { margin:10px auto 0; color:var(--muted); font-family:Arial,sans-serif; font-size:13px; font-weight:700; letter-spacing:.1em; text-transform:uppercase; }
    .lead { display:grid; grid-template-columns:1.45fr .85fr; gap:26px; padding:28px 34px 22px; border-bottom:1px solid var(--rule); }
    .headline { margin:0; font-size:clamp(36px,5vw,64px); line-height:.98; letter-spacing:0; }
    .standfirst { margin:16px 0 0; color:#34312d; font-size:20px; }
    .digest { border-left:1px solid var(--rule); padding-left:22px; }
    .digest h2,.section h2 { margin:0 0 12px; font-family:Arial,sans-serif; font-size:13px; letter-spacing:.12em; text-transform:uppercase; }
    .metric { display:grid; grid-template-columns:44px 1fr; gap:12px; align-items:baseline; padding:10px 0; border-top:1px solid var(--rule); font-family:Arial,sans-serif; }
    .metric strong { font-size:24px; color:var(--accent); }
    .metric span { color:var(--muted); font-size:13px; }
    .content { display:grid; grid-template-columns:2.1fr .9fr; gap:30px; padding:26px 34px 34px; }
    .client-grid { display:grid; grid-template-columns:1fr; gap:0; }
    .client { padding:16px 0; border-top:1px solid var(--rule); }
    .client h3 { margin:0 0 7px; font-size:25px; line-height:1.05; }
    .client p,.box p { margin:0; color:#33302b; font-size:16px; }
    .rail { border-left:1px solid var(--rule); padding-left:24px; }
    .box { padding:16px 0; border-top:4px double var(--ink); }
    .box + .box { margin-top:20px; }
    .box h2 { margin:0 0 10px; font-size:28px; line-height:1; }
    .flags { list-style:none; margin:0; padding:0; font-family:Arial,sans-serif; font-size:14px; }
    .flags li { padding:10px 0; border-top:1px solid var(--rule); }
    .footer { padding:14px 34px; border-top:1px solid var(--rule); color:var(--muted); font-family:Arial,sans-serif; font-size:12px; display:flex; justify-content:space-between; gap:18px; }
    @media (max-width:820px) { .lead,.content,.client-grid { grid-template-columns:1fr; } .digest,.rail { border-left:0; padding-left:0; } .kicker,.footer { flex-direction:column; align-items:center; text-align:center; } }
  </style>
</head>
<body>
  <main class="page">
    <header class="masthead">
      <div class="kicker"><span>Account Management Desk</span><span>${escapeHtml(sections.dateLine)}</span><span>Internal Edition</span></div>
      <h1>${escapeHtml(sections.title)}</h1>
      <p class="tagline">Daily movement first. Live timelines and contracts as baseline.</p>
    </header>
    <section class="lead">
      <article>
        <h2 class="headline">${escapeHtml(sections.headline)}</h2>
        <p class="standfirst">Ron read the last 24 hours across connected chats, email, and meeting notes, then checked timelines and contracts for context.</p>
      </article>
      <aside class="digest">
        <h2>Morning Ledger</h2>
        <div class="metric"><strong>${movement.length}</strong><span>client movement lines</span></div>
        <div class="metric"><strong>${flags.length}</strong><span>flags from the desk</span></div>
        <div class="metric"><strong>24h</strong><span>movement window</span></div>
      </aside>
    </section>
    <section class="content">
      <article class="section">
        <h2>Front Page: Client By Client</h2>
        <div class="client-grid">
          ${movement.map((line) => {
            const clean = line.replace(/^[-•]\s*/, '');
            const [client, ...rest] = clean.split(/[:—-]\s/);
            return `<section class="client"><h3>${escapeHtml(client || 'Client')}</h3><p>${escapeHtml(rest.join(' - ') || clean)}</p></section>`;
          }).join('\n')}
        </div>
      </article>
      <aside class="rail">
        <section class="box"><h2>Flags From The Desk</h2><ul class="flags">${flags.map((flag) => `<li>${escapeHtml(flag.replace(/^[-•]\s*/, ''))}</li>`).join('')}</ul></section>
        <section class="box"><h2>Ron’s Closing Read</h2><p>${escapeHtml(closing)}</p></section>
      </aside>
    </section>
    <footer class="footer"><span>Generated ${escapeHtml(generated)}</span><span>Ron Account Management Agent</span></footer>
  </main>
</body>
</html>`;
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
