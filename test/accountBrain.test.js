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
        assert.match(instructions, /source of truth/);
        assert.match(input, /Live timeline document/);
        assert.match(input, /Pathkind/);
        assert.match(instructions, /Current read/);
        assert.match(input, /Customer needs GA4 access confirmed/);
        return 'Current read\n- Access is the main topic.\nWhat is working\n- Context exists.\nWhat is blocked or risky\n- GA4 needs confirmation.\nNext steps\n- Confirm owner.';
      },
    },
    timelineDocsClient: {
      async readWikiDocument(token) {
        assert.equal(token, 'wiki_123');
        return {
          title: 'Important timelines',
          content: 'Pathkind is on track. Meta Ads target delivery: Sep 14.',
        };
      },
    },
    timelineWikiToken: 'wiki_123',
  });

  assert.match(summary, /GA4 needs confirmation/);
});

test('continues summaries if the live timeline doc cannot be read', async () => {
  const summary = await generateAccountSummary({
    normalizedEvent: {
      source: 'slack',
      channel: { id: 'C123' },
      message: { text: '@Ron what is on track?' },
    },
    eventStore: {
      async forChannel() {
        return [];
      },
    },
    openAiClient: {
      isConfigured: () => true,
      async createTextResponse({ input }) {
        assert.match(input, /Live timeline document could not be read/);
        return 'Current read\n- Timeline unavailable.\nWhat is working\n- Ron still answers.\nWhat is blocked or risky\n- Missing live doc.\nNext steps\n- Retry later.';
      },
    },
    timelineDocsClient: {
      async readWikiDocument() {
        throw new Error('temporary Lark failure');
      },
    },
    timelineWikiToken: 'wiki_123',
  });

  assert.match(summary, /Timeline unavailable/);
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
