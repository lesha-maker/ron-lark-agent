import { loadDotEnv } from './loadDotEnv.js';
import { loadConfig } from './config.js';
import { LarkClient } from './larkClient.js';

loadDotEnv();

const config = loadConfig();
const client = new LarkClient({
  baseUrl: config.larkOpenBaseUrl,
  appId: config.larkAppId,
  appSecret: config.larkAppSecret,
});

try {
  const token = await client.getTenantAccessToken();
  console.log(JSON.stringify({
    ok: true,
    appId: config.larkAppId,
    tokenPreview: `${token.slice(0, 6)}...${token.slice(-4)}`,
  }, null, 2));
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    appId: config.larkAppId,
    error: error.message,
  }, null, 2));
  process.exitCode = 1;
}
