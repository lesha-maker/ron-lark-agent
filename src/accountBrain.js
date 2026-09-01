const SUMMARY_COMMAND_PATTERN = /\b(summary|summarize|status|learned|learnt|working|blocked|blockers|risks?|next steps?|what('?s| is) going on|what happened|account)\b/i;

const SUMMARY_INSTRUCTIONS = [
  'You are Ron, an account management agent summarizing account workstreams.',
  'Use only the provided events. Do not invent facts.',
  'Treat the live timeline document as the source of truth for delivery timelines and whether accounts are on track.',
  'Treat the live contracts spreadsheet as the source of truth for contracts, invoice status, start dates, countries, and purchased agent lists.',
  'Use stored chat, Slack, and email events as supporting operational evidence.',
  'Write for an internal account team that needs fast operational clarity.',
  'Return a concise summary with exactly these headings: Current read, What is working, What is blocked or risky, Next steps.',
  'Use bullets under each heading. If evidence is thin, say so plainly.',
  'Mention source context when helpful, such as Lark, Slack, or email.',
  'Keep it under 220 words.',
].join('\n');

export function isAccountSummaryCommand(normalizedEvent) {
  return SUMMARY_COMMAND_PATTERN.test(normalizedEvent.message?.text || '');
}

function eventToLine(event) {
  const source = event.source || 'unknown';
  const time = event.occurredAt || '';
  const actor =
    event.actor?.userId ||
    event.actor?.openId ||
    event.actor?.email ||
    event.email?.from?.email ||
    event.email?.from?.name ||
    'unknown';
  const text =
    event.message?.text ||
    event.meeting?.notesTitle ||
    event.email?.text ||
    event.email?.subject ||
    '';
  const subject = event.email?.subject ? ` subject="${event.email.subject}"` : '';
  const meeting = event.meeting?.title ? ` meeting="${event.meeting.title}"` : '';
  const preview = String(text).replace(/\s+/g, ' ').trim().slice(0, 500);

  return `[${time}] ${source}${subject}${meeting} actor=${actor}: ${preview}`;
}

function fallbackSummary(events) {
  if (events.length === 0) {
    return [
      'Current read',
      '- I do not have stored messages for this workstream yet.',
      'What is working',
      '- Ron is connected and ready to track new messages.',
      'What is blocked or risky',
      '- There is not enough account context to identify blockers.',
      'Next steps',
      '- Ask me again after the chat or email thread has more account activity.',
    ].join('\n');
  }

  const recent = events.slice(-8).map(eventToLine);
  return [
    'Current read',
    `- I have ${events.length} stored events for this workstream.`,
    `- Recent signal: ${recent[recent.length - 1]}`,
    'What is working',
    '- The workstream is being captured across connected channels.',
    'What is blocked or risky',
    '- I need OpenAI enabled to produce a deeper judgment from the full context.',
    'Next steps',
    '- Ask for a summary again after OpenAI is configured, or use the debug feed for raw records.',
  ].join('\n');
}

async function readTimelineDoc({ timelineDocsClient, timelineWikiToken }) {
  if (!timelineDocsClient || !timelineWikiToken) return null;

  try {
    return await timelineDocsClient.readWikiDocument(timelineWikiToken);
  } catch (error) {
    console.error('Live timeline doc read failed:', error.message);
    return {
      title: 'Unavailable',
      content: `Live timeline document could not be read: ${error.message}`,
    };
  }
}

async function readContractsOverview({ contractsSheetsClient, contractsWikiToken }) {
  if (!contractsSheetsClient || !contractsWikiToken) return null;

  try {
    return await contractsSheetsClient.readContractsOverview(contractsWikiToken);
  } catch (error) {
    console.error('Live contracts sheet read failed:', error.message);
    return {
      title: 'Unavailable',
      rows: [],
      error: `Live contracts spreadsheet could not be read: ${error.message}`,
    };
  }
}

function formatContractsOverview(overview) {
  if (!overview) return '(not configured)';
  if (overview.error) return overview.error;

  const rows = overview.rows.map((row) => {
    const contractNames = row.contractAttachments.map((attachment) => attachment.filename).join('; ') || 'none attached';
    return [
      row.client,
      `agents=${row.agentList || 'unknown'}`,
      `start=${row.startDate || 'unknown'}`,
      `country=${row.country || 'unknown'}`,
      `invoiceRaised=${row.firstInvoiceRaised || 'unknown'}`,
      `contract=${contractNames}`,
    ].join(' | ');
  });

  return [`Title: ${overview.title || 'Untitled'}`, ...rows].join('\n').slice(0, 12000);
}

export async function generateAccountSummary({
  normalizedEvent,
  eventStore,
  openAiClient,
  timelineDocsClient,
  timelineWikiToken,
  contractsSheetsClient,
  contractsWikiToken,
  limit = 200,
}) {
  const events = normalizedEvent.channel?.id
    ? await eventStore.forChannel({
      source: normalizedEvent.source,
      channelId: normalizedEvent.channel.id,
      limit,
    })
    : await eventStore.recent(limit);

  if (!openAiClient?.isConfigured()) return fallbackSummary(events);

  const timelineDoc = await readTimelineDoc({ timelineDocsClient, timelineWikiToken });
  const contractsOverview = await readContractsOverview({ contractsSheetsClient, contractsWikiToken });
  const timeline = events.map(eventToLine).join('\n');
  const input = [
    `Current user request: ${normalizedEvent.message?.text || ''}`,
    `Current source: ${normalizedEvent.source || 'unknown'}`,
    `Current channel: ${normalizedEvent.channel?.id || 'unknown'}`,
    '',
    'Live timeline document:',
    timelineDoc
      ? `Title: ${timelineDoc.title || 'Untitled'}\n${String(timelineDoc.content || '').slice(0, 12000)}`
      : '(not configured)',
    '',
    'Live contracts spreadsheet:',
    formatContractsOverview(contractsOverview),
    '',
    'Stored events:',
    timeline || '(none)',
  ].join('\n');

  try {
    return await openAiClient.createTextResponse({
      instructions: SUMMARY_INSTRUCTIONS,
      input,
      maxOutputTokens: 500,
    });
  } catch (error) {
    console.error('Account summary failed:', error.message);
    return fallbackSummary(events);
  }
}
