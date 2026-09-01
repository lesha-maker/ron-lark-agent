import crypto from 'node:crypto';
import { normalizeMeetingNotes } from './meetingNormalizer.js';

function timingSafeEqualString(a, b) {
  const left = Buffer.from(a || '');
  const right = Buffer.from(b || '');
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function isAuthorizedMeetingWebhook(headers, config) {
  if (!config.meetingWebhookSecret) return false;
  const provided =
    headers['x-ron-meeting-secret'] ||
    headers['x-webhook-secret'] ||
    headers.authorization?.replace(/^Bearer\s+/i, '');

  return timingSafeEqualString(provided, config.meetingWebhookSecret);
}

export async function handleMeetingNotesWebhook({ rawBody, headers, config, eventStore }) {
  if (!isAuthorizedMeetingWebhook(headers, config)) {
    return { status: 401, body: { error: 'Unauthorized.' } };
  }

  const payload = JSON.parse(rawBody.toString('utf8') || '{}');
  const provider = headers['x-meeting-provider'] || payload.provider || 'google-calendar-apps-script';
  const normalized = normalizeMeetingNotes(payload, provider);
  await eventStore.append(normalized);

  return {
    status: 200,
    body: {
      ok: true,
      source: 'meeting_notes',
      eventId: normalized.meeting.eventId,
    },
  };
}
