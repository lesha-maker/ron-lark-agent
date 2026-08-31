import { loadDotEnv } from './loadDotEnv.js';
import { loadConfig } from './config.js';
import { OpenAiClient } from './openAiClient.js';

loadDotEnv();

const config = loadConfig();
const client = new OpenAiClient({
  apiKey: config.openAiApiKey,
  model: config.openAiModel,
});

try {
  const reply = await client.createTextResponse({
    instructions: 'You are Ron. Reply in one short sentence.',
    input: 'Say hello as Ron, the account management agent.',
    maxOutputTokens: 60,
  });

  console.log(JSON.stringify({
    ok: true,
    model: config.openAiModel,
    reply,
  }, null, 2));
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    model: config.openAiModel,
    error: error.message,
  }, null, 2));
  process.exitCode = 1;
}
