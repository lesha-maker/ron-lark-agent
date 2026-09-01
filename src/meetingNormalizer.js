import crypto from 'node:crypto';

function firstValue(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== '');
}

function normalizeAttendees(value) {
  if (!value) return [];
  if (!Array.isArray(value)) return normalizeAttendees([value]);

  return value
    .map((attendee) => {
      if (typeof attendee === 'string') return { email: attendee, name: null, responseStatus: null };
      return {
        email: firstValue(attendee.email, attendee.Email, attendee.mail, ''),
        name: firstValue(attendee.name, attendee.displayName, attendee.Name, null),
        responseStatus: firstValue(attendee.responseStatus, attendee.status, null),
      };
    })
    .filter((attendee) => attendee.email);
}

function normalizeAttachments(value) {
  if (!value) return [];
  if (!Array.isArray(value)) return normalizeAttachments([value]);

  return value
    .map((attachment) => ({
      title: firstValue(attachment.title, attachment.name, ''),
      url: firstValue(attachment.url, attachment.fileUrl, attachment.alternateLink, ''),
      mimeType: firstValue(attachment.mimeType, attachment.contentType, ''),
      fileId: firstValue(attachment.fileId, attachment.id, ''),
    }))
    .filter((attachment) => attachment.title || attachment.url || attachment.fileId);
}

export function normalizeMeetingNotes(payload, provider = 'google-calendar-apps-script') {
  const sourceId = firstValue(payload.eventId, payload.id, payload.meetingId, crypto.randomUUID());
  const notesText = firstValue(payload.notesText, payload.notes, payload.summary, payload.text, '');
  const endedAt = firstValue(payload.endTime, payload.endedAt, payload.date);

  return {
    source: 'meeting_notes',
    provider,
    sourceEventId: String(sourceId),
    sourceEventType: 'meeting.notes',
    occurredAt: endedAt ? new Date(endedAt).toISOString() : new Date().toISOString(),
    accountKey: null,
    channel: payload.calendarId ? { type: 'calendar', id: payload.calendarId } : undefined,
    actor: {
      email: firstValue(payload.organizer?.email, payload.organizerEmail, null),
      name: firstValue(payload.organizer?.name, payload.organizerName, null),
    },
    message: {
      id: String(sourceId),
      type: 'meeting_notes',
      text: notesText,
    },
    meeting: {
      eventId: String(sourceId),
      calendarId: firstValue(payload.calendarId, null),
      title: firstValue(payload.title, payload.summary, ''),
      startTime: firstValue(payload.startTime, null),
      endTime: firstValue(payload.endTime, null),
      htmlLink: firstValue(payload.htmlLink, payload.url, ''),
      conferenceUrl: firstValue(payload.conferenceUrl, payload.meetLink, payload.zoomLink, ''),
      organizer: {
        email: firstValue(payload.organizer?.email, payload.organizerEmail, null),
        name: firstValue(payload.organizer?.name, payload.organizerName, null),
      },
      attendees: normalizeAttendees(payload.attendees),
      attachments: normalizeAttachments(payload.attachments),
      notesTitle: firstValue(payload.notesTitle, ''),
      notesUrl: firstValue(payload.notesUrl, ''),
      notesDocumentId: firstValue(payload.notesDocumentId, ''),
    },
    analysis: {
      actionItems: [],
      risks: [],
      customerSignals: [],
      needsHumanReview: true,
    },
    raw: payload,
  };
}
