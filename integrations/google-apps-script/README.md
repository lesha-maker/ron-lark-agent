# Gmail / Google Workspace Bridge

Use this when `ron@nas.com` is a Google Workspace or Gmail mailbox.

## Setup

1. Open [Google Apps Script](https://script.google.com/).
2. Create a new project named `Ron Email Bridge`.
3. Paste `ron-email-forwarder.gs` into the editor.
4. Open **Project Settings** > **Script Properties** and add:

```txt
RON_EMAIL=ron@nas.com
RON_WEBHOOK_URL=https://ron-lark-agent-production.up.railway.app/webhooks/email/inbound
RON_EMAIL_WEBHOOK_SECRET=your Railway EMAIL_WEBHOOK_SECRET value
```

5. Click **Run** on `syncRonEmail` once and approve Gmail/URL permissions.
6. Open **Triggers**.
7. Add a trigger:

```txt
Function: syncRonEmail
Event source: Time-driven
Type: Minutes timer
Interval: Every 1 minute or every 5 minutes
```

## Behavior

The script finds recent emails where Ron is in `to` or `cc`, sends the message metadata/body to Ron's Railway webhook, and remembers processed Gmail message IDs so it does not resend the same email.

Attachments are recorded as metadata only in this first version. File ingestion can be added later.

## Diagnostics

Run `testRonWebhook` to confirm Apps Script can post to Ron's Railway endpoint.

Run `debugRonEmailSearch` to confirm the script can see messages addressed or cc'd to `ron@nas.com`. If it finds zero threads, the script is running in the wrong Gmail inbox or Ron has not received a matching email yet.
