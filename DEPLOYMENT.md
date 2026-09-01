# Deploy Ron To Railway

## 1. Push This Folder To GitHub

Create a new GitHub repository, for example:

```txt
ron-lark-agent
```

Push the contents of this folder. Do not commit `.env`; it is ignored because it contains secrets.

## 2. Create A Railway Project

1. Open Railway.
2. Create a new project.
3. Choose **Deploy from GitHub repo**.
4. Select the `ron-lark-agent` repository.
5. Railway should detect Node.js and run `npm start`.

## 3. Set Railway Variables

In the Railway service, open **Variables** and add:

```txt
NODE_ENV=production
HOST=0.0.0.0
LARK_OPEN_BASE_URL=https://open.larksuite.com
LARK_APP_ID=...
LARK_APP_SECRET=...
LARK_BOT_OPEN_ID=...
LARK_REPLY_TO_ALL_GROUP_MESSAGES=false
LARK_VERIFICATION_TOKEN=...
LARK_ENCRYPT_KEY=...
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-5.6-luna
EVENT_STORE_PATH=/tmp/ron-events.jsonl
DEBUG_TOKEN=generate-a-long-random-token
EMAIL_WEBHOOK_SECRET=generate-a-long-random-token
```

Railway provides `PORT` automatically. Do not hard-code `PORT` unless Railway asks you to.

## 4. Update Lark Webhook URL

After Railway deploys, copy the public Railway domain and update Lark's Request URL:

```txt
https://YOUR-RAILWAY-DOMAIN/webhooks/lark
```

Click **Save** or **Verify** in Lark. Ron should answer the URL challenge.

## 5. Test In Lark

DM Ron:

```txt
hi
```

Or mention Ron in a group chat:

```txt
@Ron summarize what we need to do next
```

## Notes

The current JSONL event store uses Railway's ephemeral filesystem. That is fine for the first always-on bot test, but production should move account memory to Postgres or another durable database.

To check whether Lark is sending passive group messages, set `DEBUG_TOKEN`, send a group message without mentioning Ron, then call:

```bash
curl -H "Authorization: Bearer YOUR_DEBUG_TOKEN" https://YOUR-RAILWAY-DOMAIN/debug/recent-events
```

To backfill historical messages from a group chat:

```bash
curl -X POST https://YOUR-RAILWAY-DOMAIN/admin/backfill/lark-history \
  -H "Authorization: Bearer YOUR_DEBUG_TOKEN" \
  -H "content-type: application/json" \
  -d '{"chatId":"oc_xxx","days":30,"maxPages":20}'
```

Ron must be in the group and the Lark app must have permission to get group message history.

## Inbound Email

Create an address for Ron, for example:

```txt
ron@yourdomain.com
```

Configure your inbound email provider to POST parsed email JSON to:

```txt
https://YOUR-RAILWAY-DOMAIN/webhooks/email/inbound
```

Include one of these auth headers:

```txt
Authorization: Bearer YOUR_EMAIL_WEBHOOK_SECRET
X-Ron-Email-Secret: YOUR_EMAIL_WEBHOOK_SECRET
X-Webhook-Secret: YOUR_EMAIL_WEBHOOK_SECRET
```

For Google Workspace/Gmail inboxes, use `integrations/google-apps-script/ron-email-forwarder.gs` to poll `ron@nas.com` and POST new emails into this endpoint.
