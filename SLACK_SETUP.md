# Add Ron To Slack

## 1. Create A Slack App

Create a new Slack app from scratch and name it `Ron`.

## 2. Enable Events

In **Event Subscriptions**, turn events on and set the Request URL:

```txt
https://ron-lark-agent-production.up.railway.app/webhooks/slack
```

Slack will send a URL verification challenge. Ron responds automatically once `SLACK_SIGNING_SECRET` is set in Railway.

## 3. Bot Token Scopes

In **OAuth & Permissions**, add bot scopes:

```txt
app_mentions:read
chat:write
im:history
im:read
channels:history
channels:read
groups:history
groups:read
mpim:history
mpim:read
```

For a cautious first setup, Ron replies only in DMs and when mentioned. Passive channel messages can still be logged if Slack sends them and the app is in the channel.

## 4. Subscribe To Bot Events

In **Event Subscriptions**, subscribe to bot events:

```txt
app_mention
message.im
message.channels
message.groups
message.mpim
```

## 5. Install App

Install Ron to the workspace, then copy:

```txt
Bot User OAuth Token -> SLACK_BOT_TOKEN
Signing Secret -> SLACK_SIGNING_SECRET
```

Add both to Railway variables and redeploy.

## 6. Add Ron To Conversations

Invite Ron into Slack channels:

```txt
/invite @Ron
```

Then test:

```txt
@Ron what should we track here?
```

DMs should also work.

## Debug

After adding Railway variables, check Slack auth:

```bash
curl -H "Authorization: Bearer YOUR_DEBUG_TOKEN" \
  https://ron-lark-agent-production.up.railway.app/debug/slack-auth
```

Send a test Slack message:

```bash
curl -X POST https://ron-lark-agent-production.up.railway.app/admin/slack/test-message \
  -H "Authorization: Bearer YOUR_DEBUG_TOKEN" \
  -H "content-type: application/json" \
  -d '{"channel":"C123","text":"Ron Slack test"}'
```
