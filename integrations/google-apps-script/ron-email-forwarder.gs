const PROCESSED_IDS_KEY = 'RON_PROCESSED_MESSAGE_IDS';
const MAX_PROCESSED_IDS = 500;
const MAX_RETRIES = 3;

function syncRonEmail() {
  const props = PropertiesService.getScriptProperties();
  const webhookUrl = props.getProperty('RON_WEBHOOK_URL');
  const webhookSecret = props.getProperty('RON_EMAIL_WEBHOOK_SECRET');
  const ronEmail = props.getProperty('RON_EMAIL') || 'ron@nas.com';

  if (!webhookUrl || !webhookSecret) {
    throw new Error('Set RON_WEBHOOK_URL and RON_EMAIL_WEBHOOK_SECRET in Script Properties.');
  }

  const processedIds = readProcessedIds_(props);
  const query = `newer_than:14d (to:${ronEmail} OR cc:${ronEmail})`;
  let threads;

  try {
    threads = withRetry_(() => GmailApp.search(query, 0, 50), 'Gmail search');
  } catch (error) {
    Logger.log(`Ron email sync skipped because Gmail search failed: ${error.message}`);
    return;
  }

  const newlyProcessed = [];

  for (const thread of threads) {
    let messages;

    try {
      messages = withRetry_(() => thread.getMessages(), `Read thread ${thread.getId()}`);
    } catch (error) {
      Logger.log(`Skipping thread ${thread.getId()}: ${error.message}`);
      continue;
    }

    for (const message of messages) {
      const messageId = message.getId();
      if (processedIds.has(messageId)) continue;

      try {
        postMessageToRon_(message, thread, webhookUrl, webhookSecret);
      } catch (error) {
        Logger.log(`Leaving message ${messageId} unprocessed for retry: ${error.message}`);
        continue;
      }

      processedIds.add(messageId);
      newlyProcessed.push(messageId);
    }
  }

  if (newlyProcessed.length > 0) {
    writeProcessedIds_(props, processedIds);
  }
}

function testRonWebhook() {
  const props = PropertiesService.getScriptProperties();
  const webhookUrl = props.getProperty('RON_WEBHOOK_URL');
  const webhookSecret = props.getProperty('RON_EMAIL_WEBHOOK_SECRET');
  const ronEmail = props.getProperty('RON_EMAIL') || 'ron@nas.com';

  if (!webhookUrl || !webhookSecret) {
    throw new Error('Set RON_WEBHOOK_URL and RON_EMAIL_WEBHOOK_SECRET in Script Properties.');
  }

  const response = UrlFetchApp.fetch(webhookUrl, {
    method: 'post',
    contentType: 'application/json',
    headers: {
      Authorization: `Bearer ${webhookSecret}`,
      'X-Email-Provider': 'gmail-apps-script-test',
    },
    payload: JSON.stringify({
      provider: 'gmail-apps-script-test',
      messageId: `apps-script-test-${Date.now()}`,
      date: new Date().toISOString(),
      from: Session.getActiveUser().getEmail(),
      to: ronEmail,
      subject: 'Ron Apps Script webhook test',
      text: 'This confirms Apps Script can post to Ron.',
    }),
    muteHttpExceptions: true,
  });

  Logger.log(`Webhook status: ${response.getResponseCode()}`);
  Logger.log(response.getContentText());
}

function debugRonEmailSearch() {
  const props = PropertiesService.getScriptProperties();
  const ronEmail = props.getProperty('RON_EMAIL') || 'ron@nas.com';
  const query = `newer_than:14d (to:${ronEmail} OR cc:${ronEmail})`;
  const threads = GmailApp.search(query, 0, 10);

  Logger.log(`Running as: ${Session.getActiveUser().getEmail()}`);
  Logger.log(`Query: ${query}`);
  Logger.log(`Threads found: ${threads.length}`);

  for (const thread of threads) {
    const messages = thread.getMessages();
    Logger.log(`Thread ${thread.getId()} messages: ${messages.length}`);
    for (const message of messages) {
      Logger.log([
        `messageId=${message.getId()}`,
        `from=${message.getFrom()}`,
        `to=${message.getTo()}`,
        `cc=${message.getCc()}`,
        `subject=${message.getSubject()}`,
      ].join(' | '));
    }
  }
}

function postMessageToRon_(message, thread, webhookUrl, webhookSecret) {
  const payload = {
    provider: 'gmail-apps-script',
    messageId: message.getId(),
    threadId: thread.getId(),
    date: message.getDate().toISOString(),
    from: message.getFrom(),
    to: message.getTo(),
    cc: message.getCc(),
    bcc: message.getBcc(),
    subject: message.getSubject(),
    text: message.getPlainBody(),
    html: message.getBody(),
    attachments: message.getAttachments().map((attachment) => ({
      name: attachment.getName(),
      contentType: attachment.getContentType(),
      size: attachment.getBytes().length,
    })),
  };

  const response = withRetry_(() => UrlFetchApp.fetch(webhookUrl, {
    method: 'post',
    contentType: 'application/json',
    headers: {
      Authorization: `Bearer ${webhookSecret}`,
      'X-Email-Provider': 'gmail-apps-script',
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  }), `Post message ${message.getId()} to Ron`);

  const status = response.getResponseCode();
  if (status < 200 || status >= 300) {
    throw new Error(`Ron webhook failed with HTTP ${status}: ${response.getContentText()}`);
  }
}

function withRetry_(operation, label) {
  let lastError;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      return operation();
    } catch (error) {
      lastError = error;
      Logger.log(`${label} failed on attempt ${attempt}/${MAX_RETRIES}: ${error.message}`);
      if (attempt < MAX_RETRIES) {
        Utilities.sleep(1000 * attempt);
      }
    }
  }

  throw lastError;
}

function readProcessedIds_(props) {
  const raw = props.getProperty(PROCESSED_IDS_KEY);
  if (!raw) return new Set();

  try {
    return new Set(JSON.parse(raw));
  } catch {
    return new Set();
  }
}

function writeProcessedIds_(props, processedIds) {
  const ids = Array.from(processedIds).slice(-MAX_PROCESSED_IDS);
  props.setProperty(PROCESSED_IDS_KEY, JSON.stringify(ids));
}
