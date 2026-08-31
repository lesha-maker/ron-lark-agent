import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateRonReply } from '../src/conversationAgent.js';

const normalizedEvent = {
  channel: { type: 'p2p' },
  actor: { openId: 'ou_user' },
  message: { text: 'hi' },
};

test('uses OpenAI client when configured', async () => {
  const reply = await generateRonReply({
    normalizedEvent,
    openAiClient: {
      isConfigured: () => true,
      async createTextResponse({ instructions, input }) {
        assert.match(instructions, /You are Ron/);
        assert.match(input, /Message: hi/);
        return 'Hey, I am Ron. What account should we look at?';
      },
    },
  });

  assert.equal(reply, 'Hey, I am Ron. What account should we look at?');
});

test('falls back when OpenAI key is missing', async () => {
  const reply = await generateRonReply({
    normalizedEvent,
    openAiClient: { isConfigured: () => false },
  });

  assert.match(reply, /Got it/);
});
