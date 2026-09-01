# Lark Account Agent

First connector for the account management agent. It receives Lark bot events, verifies/decrypts them, normalizes incoming chat messages, and stores account-event records as JSONL.

It can also act as a visible Lark bot participant named Ron: when messaged directly, or mentioned in a group chat, it replies conversationally in Lark. If `OPENAI_API_KEY` is configured, Ron uses the OpenAI Responses API for replies; otherwise, he uses a local fallback response.

The webhook acknowledges Lark quickly and replies in the background. Duplicate Lark deliveries are deduped by message ID so one chat message produces one Ron reply.

## Run

```bash
cp .env.example .env
# Fill LARK_APP_ID, LARK_APP_SECRET, LARK_VERIFICATION_TOKEN, and LARK_ENCRYPT_KEY from the Lark developer console.
# Fill OPENAI_API_KEY from the OpenAI dashboard when you want conversational replies.
npm test
npm run check:lark-auth
npm run check:openai
npm start
```

Health check:

```bash
curl http://127.0.0.1:3000/health
```

Railway deployment instructions are in [DEPLOYMENT.md](./DEPLOYMENT.md).

Lark event endpoint:

```txt
POST /webhooks/lark
```

For local Lark testing, expose the server with a tunnel such as ngrok or Cloudflare Tunnel and configure the public URL in Lark Open Platform:

```txt
https://your-public-url/webhooks/lark
```

## Lark Setup Checklist

1. Create an internal Lark app.
2. Name the bot `Ron` and enable bot capability.
3. Configure Event Subscriptions with:
   - Verification Token -> `LARK_VERIFICATION_TOKEN`
   - Encrypt Key -> `LARK_ENCRYPT_KEY`
   - Request URL -> `/webhooks/lark`
4. Subscribe to `im.message.receive_v1`.
5. Grant the required IM/message scopes in the Lark developer console:
   - receive direct messages
   - receive group messages that mention the bot
   - send messages as bot
6. Publish the app internally.
7. Add the bot to account/customer group chats.
8. Mention the bot in a group chat or DM it directly.

By default, the bot replies in DMs and when mentioned in group chats. Set `LARK_REPLY_TO_ALL_GROUP_MESSAGES=true` only if you want it to answer every group message it can see.

## OpenAI Setup

Add an API key to `.env`:

```txt
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-5.6-luna
```

The integration calls `POST https://api.openai.com/v1/responses` from the server only and sets `store: false` on requests.

## Output Shape

Each inbound message becomes one line in `data/events.jsonl`:

```json
{
  "source": "lark",
  "sourceEventType": "im.message.receive_v1",
  "accountKey": null,
  "channel": { "type": "group", "id": "oc_xxx" },
  "actor": { "openId": "ou_xxx" },
  "message": {
    "id": "om_xxx",
    "type": "text",
    "text": "Customer asked for pricing by Friday."
  },
  "analysis": {
    "actionItems": [],
    "risks": [],
    "customerSignals": [],
    "needsHumanReview": true
  }
}
```

The next slice should add account resolution:

- map Lark `chat_id` to account/customer
- map Lark users to internal owners
- enrich messages with action item/risk extraction
- emit daily or weekly account summaries back into Lark

## Passive Read Check

Ron logs every Lark message event that Lark sends to the webhook. To verify whether Lark is sending unmentioned group messages, enable `DEBUG_TOKEN` and inspect:

```txt
GET /debug/recent-events
Authorization: Bearer YOUR_DEBUG_TOKEN
```

## Historical Backfill

Ron can backfill a Lark group chat through:

```txt
POST /admin/backfill/lark-history
Authorization: Bearer YOUR_DEBUG_TOKEN
```

Body:

```json
{
  "chatId": "oc_xxx",
  "days": 30,
  "maxPages": 20
}
```

Ron must be in the chat. For group history, the Lark app also needs permission to get all messages in a group.

## Email Ingestion

Ron can store inbound email from a webhook provider:

```txt
POST /webhooks/email/inbound
Authorization: Bearer YOUR_EMAIL_WEBHOOK_SECRET
```

Accepted payload fields include common names such as `from`, `to`, `cc`, `subject`, `text`, `html`, `messageId`, and `attachments`.

Use this with an inbound email provider so people can cc Ron into account conversations. The provider should forward email for Ron's address to:

```txt
https://YOUR-RAILWAY-DOMAIN/webhooks/email/inbound
```

If `ron@nas.com` is a Google Workspace/Gmail inbox, use the Apps Script bridge in `integrations/google-apps-script`.
