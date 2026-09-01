import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateAccountSummary, isAccountSummaryCommand } from '../src/accountBrain.js';

test('detects account summary requests', () => {
  assert.equal(isAccountSummaryCommand({
    message: { text: '@Ron what is working and what is blocked here?' },
  }), true);
  assert.equal(isAccountSummaryCommand({
    message: { text: '@Ron hi' },
  }), false);
});

test('summarizes current channel with OpenAI when configured', async () => {
  const summary = await generateAccountSummary({
    normalizedEvent: {
      source: 'slack',
      channel: { id: 'C123' },
      message: { text: '@Ron summarize this account' },
    },
    eventStore: {
      async forChannel(args) {
        assert.deepEqual(args, { source: 'slack', channelId: 'C123', limit: 200 });
        return [{
          source: 'slack',
          occurredAt: '2026-09-01T06:00:00.000Z',
          channel: { id: 'C123' },
          actor: { userId: 'U123' },
          message: { text: 'Customer needs GA4 access confirmed.' },
        }];
      },
    },
    openAiClient: {
      isConfigured: () => true,
      async createTextResponse({ instructions, input }) {
        assert.match(instructions, /Current read/);
        assert.match(input, /Customer needs GA4 access confirmed/);
        return 'Current read\n- Access is the main topic.\nWhat is working\n- Context exists.\nWhat is blocked or risky\n- GA4 needs confirmation.\nNext steps\n- Confirm owner.';
      },
    },
  });

  assert.match(summary, /GA4 needs confirmation/);
});

test('falls back when no OpenAI client is configured', async () => {
  const summary = await generateAccountSummary({
    normalizedEvent: {
      source: 'lark',
      channel: { id: 'oc_123' },
      message: { text: '@Ron summarize' },
    },
    eventStore: {
      async forChannel() {
        return [];
      },
    },
    openAiClient: { isConfigured: () => false },
  });

  assert.match(summary, /I do not have stored messages/);
});
