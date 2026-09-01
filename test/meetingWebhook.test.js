import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeMeetingNotes } from '../src/meetingNormalizer.js';
import { handleMeetingNotesWebhook } from '../src/meetingWebhook.js';

function memoryStore() {
  const events = [];
  return {
    events,
    async append(event) {
      events.push(event);
    },
  };
}

test('normalizes Google Meet notes payloads', () => {
  const event = normalizeMeetingNotes({
    eventId: 'calendar-event-1',
    calendarId: 'ron@nas.com',
    title: 'Pathkind weekly call',
    startTime: '2026-09-01T04:00:00.000Z',
    endTime: '2026-09-01T05:00:00.000Z',
    organizerEmail: 'lesha@example.com',
    attendees: [{ email: 'customer@example.com', responseStatus: 'accepted' }],
    notesTitle: 'Meeting notes - Pathkind',
    notesUrl: 'https://docs.google.com/document/d/doc-1/edit',
    notesDocumentId: 'doc-1',
    notesText: 'Decision: move Reporting Agent to production. Next step: security review.',
  });

  assert.equal(event.source, 'meeting_notes');
  assert.equal(event.sourceEventType, 'meeting.notes');
  assert.equal(event.meeting.title, 'Pathkind weekly call');
  assert.equal(event.meeting.attendees[0].email, 'customer@example.com');
  assert.match(event.message.text, /Reporting Agent/);
});

test('accepts authorized meeting notes webhooks', async () => {
  const store = memoryStore();
  const result = await handleMeetingNotesWebhook({
    rawBody: Buffer.from(JSON.stringify({
      eventId: 'calendar-event-2',
      title: 'Client call',
      endTime: '2026-09-01T05:00:00.000Z',
      notesText: 'Customer asked for GA4 access status.',
    })),
    headers: {
      authorization: 'Bearer secret',
      'x-meeting-provider': 'google-calendar-apps-script',
    },
    config: { meetingWebhookSecret: 'secret' },
    eventStore: store,
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.eventId, 'calendar-event-2');
  assert.equal(store.events.length, 1);
  assert.equal(store.events[0].provider, 'google-calendar-apps-script');
});

test('rejects unauthorized meeting notes webhooks', async () => {
  const result = await handleMeetingNotesWebhook({
    rawBody: Buffer.from('{}'),
    headers: {},
    config: { meetingWebhookSecret: 'secret' },
    eventStore: memoryStore(),
  });

  assert.equal(result.status, 401);
});
