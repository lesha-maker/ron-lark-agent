export class SlackClient {
  constructor({ botToken, fetchImpl = fetch }) {
    this.botToken = botToken;
    this.fetch = fetchImpl;
  }

  isConfigured() {
    return Boolean(this.botToken);
  }

  async postMessage({ channel, text, threadTs }) {
    if (!this.botToken) {
      throw new Error('SLACK_BOT_TOKEN is required to send Slack messages.');
    }

    const response = await this.fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.botToken}`,
        'content-type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({
        channel,
        text,
        thread_ts: threadTs,
      }),
    });
    const data = await response.json();

    if (!response.ok || !data.ok) {
      throw new Error(`Failed to send Slack message: ${data.error || response.statusText}`);
    }

    return data;
  }
}
