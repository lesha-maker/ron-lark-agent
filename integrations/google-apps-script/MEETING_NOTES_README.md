# Ron Meeting Notes Bridge

Use this Google Apps Script under the `ron@nas.com` Google account to forward Google Calendar meeting notes into Ron.

## Script Properties

Set these properties:

```txt
RON_MEETING_WEBHOOK_URL=https://ron-lark-agent-production.up.railway.app/webhooks/meet/notes
RON_MEETING_WEBHOOK_SECRET=YOUR_MEETING_WEBHOOK_SECRET
RON_CALENDAR_ID=primary
RON_MEETING_LOOKBACK_HOURS=48
```

`RON_MEETING_WEBHOOK_SECRET` should match `MEETING_WEBHOOK_SECRET` in Railway. If `MEETING_WEBHOOK_SECRET` is not set, Ron falls back to `EMAIL_WEBHOOK_SECRET`.

## Required Apps Script Services

Enable the Advanced Google service:

```txt
Calendar API
```

The script also uses:

```txt
DocumentApp
UrlFetchApp
PropertiesService
```

## Setup

1. Create a new Apps Script project while logged in as `ron@nas.com`.
2. Paste `ron-meeting-notes-forwarder.gs` into `Code.gs`.
3. Add the Script Properties above.
4. In Services, add `Calendar API`.
5. Run `testRonMeetingWebhook` and approve permissions.
6. Run `debugRonCalendarMeetings` to confirm Ron can see recent meetings and attached notes.
7. Create a time-driven trigger for `syncRonMeetingNotes`, every 10 or 15 minutes.

For Google Meet calls, invite `ron@nas.com` to the calendar event and make sure Gemini meeting notes are shared with Ron.
