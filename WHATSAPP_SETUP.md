# WhatsApp Setup

Ron can ingest WhatsApp Business Platform webhook messages through:

```txt
https://ron-lark-agent-production.up.railway.app/webhooks/whatsapp
```

## Important Limitation

A normal WhatsApp group created in the phone app is not automatically readable by Ron. For group access, the group must be supported by your WhatsApp Business Platform setup/provider. If your WhatsApp Business Account has Groups API access, Ron's webhook is ready to store group-shaped message events too.

If Groups API is not available on your account, the reliable path is 1:1 WhatsApp conversations with the business number, or use Lark/Slack for client group rooms.

## Railway Variables

Set these in Railway:

```txt
WHATSAPP_VERIFY_TOKEN=choose-a-long-random-string
WHATSAPP_APP_SECRET=your-meta-app-secret
WHATSAPP_BEARER_TOKEN=your-whatsapp-system-user-token
WHATSAPP_PHONE_NUMBER_ID=103561682653273
```

The bearer token should be a long-lived system user token and should never be committed to GitHub.

## Meta Webhook

In the Meta app dashboard:

1. Go to WhatsApp > Configuration.
2. Set Callback URL:

```txt
https://ron-lark-agent-production.up.railway.app/webhooks/whatsapp
```

3. Set Verify token to the exact `WHATSAPP_VERIFY_TOKEN` value from Railway.
4. Subscribe the WhatsApp Business Account to the `messages` webhook field.
5. Send a WhatsApp message to the business number.

Ron will store inbound WhatsApp movement and include it in daily reports.
