const MEETING_PROCESSED_IDS_KEY = 'RON_PROCESSED_MEETING_EVENT_IDS';
const MAX_MEETING_PROCESSED_IDS = 500;

function syncRonMeetingNotes() {
  const props = PropertiesService.getScriptProperties();
  const webhookUrl = props.getProperty('RON_MEETING_WEBHOOK_URL');
  const webhookSecret = props.getProperty('RON_MEETING_WEBHOOK_SECRET');
  const calendarId = props.getProperty('RON_CALENDAR_ID') || 'primary';
  const lookbackHours = Number(props.getProperty('RON_MEETING_LOOKBACK_HOURS') || '48');

  if (!webhookUrl || !webhookSecret) {
    throw new Error('Set RON_MEETING_WEBHOOK_URL and RON_MEETING_WEBHOOK_SECRET in Script Properties.');
  }

  const processedIds = readMeetingProcessedIds_(props);
  const now = new Date();
  const timeMin = new Date(now.getTime() - lookbackHours * 60 * 60 * 1000).toISOString();
  const timeMax = now.toISOString();
  const events = Calendar.Events.list(calendarId, {
    timeMin,
    timeMax,
    singleEvents: true,
    orderBy: 'startTime',
    maxResults: 50,
  }).items || [];
  const newlyProcessed = [];

  for (const event of events) {
    if (!event.id || processedIds.has(event.id)) continue;
    if (!hasEnded_(event, now)) continue;

    const notesAttachment = findMeetingNotesAttachment_(event);
    if (!notesAttachment) continue;

    const notes = readGoogleDoc_(notesAttachment.fileId);
    postMeetingNotesToRon_(event, notesAttachment, notes, calendarId, webhookUrl, webhookSecret);
    processedIds.add(event.id);
    newlyProcessed.push(event.id);
  }

  if (newlyProcessed.length > 0) {
    writeMeetingProcessedIds_(props, processedIds);
  }
}

function testRonMeetingWebhook() {
  const props = PropertiesService.getScriptProperties();
  const webhookUrl = props.getProperty('RON_MEETING_WEBHOOK_URL');
  const webhookSecret = props.getProperty('RON_MEETING_WEBHOOK_SECRET');

  if (!webhookUrl || !webhookSecret) {
    throw new Error('Set RON_MEETING_WEBHOOK_URL and RON_MEETING_WEBHOOK_SECRET in Script Properties.');
  }

  const response = UrlFetchApp.fetch(webhookUrl, {
    method: 'post',
    contentType: 'application/json',
    headers: {
      Authorization: `Bearer ${webhookSecret}`,
      'X-Meeting-Provider': 'google-calendar-apps-script-test',
    },
    payload: JSON.stringify({
      provider: 'google-calendar-apps-script-test',
      eventId: `apps-script-meeting-test-${Date.now()}`,
      calendarId: 'primary',
      title: 'Ron meeting webhook test',
      startTime: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      endTime: new Date().toISOString(),
      organizerEmail: Session.getActiveUser().getEmail(),
      attendees: [{ email: Session.getActiveUser().getEmail(), responseStatus: 'accepted' }],
      notesTitle: 'Ron test meeting notes',
      notesText: 'Decision: Ron can receive meeting notes. Next step: enable the trigger.',
    }),
    muteHttpExceptions: true,
  });

  Logger.log(`Webhook status: ${response.getResponseCode()}`);
  Logger.log(response.getContentText());
}

function debugRonCalendarMeetings() {
  const props = PropertiesService.getScriptProperties();
  const calendarId = props.getProperty('RON_CALENDAR_ID') || 'primary';
  const lookbackHours = Number(props.getProperty('RON_MEETING_LOOKBACK_HOURS') || '48');
  const now = new Date();
  const timeMin = new Date(now.getTime() - lookbackHours * 60 * 60 * 1000).toISOString();
  const timeMax = now.toISOString();
  const events = Calendar.Events.list(calendarId, {
    timeMin,
    timeMax,
    singleEvents: true,
    orderBy: 'startTime',
    maxResults: 20,
  }).items || [];

  Logger.log(`Running as: ${Session.getActiveUser().getEmail()}`);
  Logger.log(`Calendar: ${calendarId}`);
  Logger.log(`Events found: ${events.length}`);

  for (const event of events) {
    const notesAttachment = findMeetingNotesAttachment_(event);
    Logger.log([
      `id=${event.id}`,
      `summary=${event.summary}`,
      `end=${event.end && (event.end.dateTime || event.end.date)}`,
      `attachments=${(event.attachments || []).length}`,
      `notes=${notesAttachment ? notesAttachment.title : 'none'}`,
    ].join(' | '));
  }
}

function postMeetingNotesToRon_(event, notesAttachment, notes, calendarId, webhookUrl, webhookSecret) {
  const payload = {
    provider: 'google-calendar-apps-script',
    eventId: event.id,
    calendarId,
    title: event.summary || '',
    startTime: event.start && (event.start.dateTime || event.start.date),
    endTime: event.end && (event.end.dateTime || event.end.date),
    htmlLink: event.htmlLink || '',
    conferenceUrl: extractConferenceUrl_(event),
    organizer: event.organizer || null,
    attendees: (event.attendees || []).map((attendee) => ({
      email: attendee.email || '',
      name: attendee.displayName || '',
      responseStatus: attendee.responseStatus || '',
    })),
    attachments: event.attachments || [],
    notesTitle: notesAttachment.title || '',
    notesUrl: notesAttachment.fileUrl || '',
    notesDocumentId: notesAttachment.fileId || '',
    notesText: notes,
  };

  const response = UrlFetchApp.fetch(webhookUrl, {
    method: 'post',
    contentType: 'application/json',
    headers: {
      Authorization: `Bearer ${webhookSecret}`,
      'X-Meeting-Provider': 'google-calendar-apps-script',
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });

  const status = response.getResponseCode();
  if (status < 200 || status >= 300) {
    throw new Error(`Ron meeting webhook failed with HTTP ${status}: ${response.getContentText()}`);
  }
}

function findMeetingNotesAttachment_(event) {
  const attachments = event.attachments || [];
  return attachments.find((attachment) => {
    const title = String(attachment.title || '').toLowerCase();
    const mimeType = String(attachment.mimeType || '').toLowerCase();
    return attachment.fileId &&
      mimeType === 'application/vnd.google-apps.document' &&
      (title.includes('meeting notes') || title.includes('notes') || title.includes('gemini'));
  });
}

function readGoogleDoc_(documentId) {
  if (!documentId) return '';
  const doc = DocumentApp.openById(documentId);
  return doc.getBody().getText();
}

function extractConferenceUrl_(event) {
  if (event.hangoutLink) return event.hangoutLink;
  const entryPoints = event.conferenceData && event.conferenceData.entryPoints;
  if (!entryPoints) return '';
  const video = entryPoints.find((entry) => entry.entryPointType === 'video');
  return video ? video.uri : '';
}

function hasEnded_(event, now) {
  if (!event.end) return false;
  const rawEnd = event.end.dateTime || event.end.date;
  if (!rawEnd) return false;
  return new Date(rawEnd).getTime() <= now.getTime();
}

function readMeetingProcessedIds_(props) {
  const raw = props.getProperty(MEETING_PROCESSED_IDS_KEY);
  if (!raw) return new Set();

  try {
    return new Set(JSON.parse(raw));
  } catch {
    return new Set();
  }
}

function writeMeetingProcessedIds_(props, processedIds) {
  const ids = Array.from(processedIds).slice(-MAX_MEETING_PROCESSED_IDS);
  props.setProperty(MEETING_PROCESSED_IDS_KEY, JSON.stringify(ids));
}
