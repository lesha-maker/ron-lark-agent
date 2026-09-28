import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_TOKEN_TTL_SECONDS = 7200;

function safeJsonParse(value, fallback = null) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function stateSignature(secret, issuedAt) {
  return crypto
    .createHmac('sha256', secret)
    .update(String(issuedAt))
    .digest('hex')
    .slice(0, 24);
}

export function createOAuthState(secret, now = Date.now()) {
  if (!secret) throw new Error('A secret is required to create Lark OAuth state.');
  return `${now}.${stateSignature(secret, now)}`;
}

export function verifyOAuthState(state, secret, now = Date.now()) {
  if (!state || !secret) return false;
  const [issuedAtRaw, signature] = String(state).split('.');
  const issuedAt = Number(issuedAtRaw);
  if (!Number.isFinite(issuedAt) || !signature) return false;
  if (now - issuedAt > 10 * 60 * 1000) return false;
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(stateSignature(secret, issuedAt)),
  );
}

export class LarkUserTokenStore {
  constructor({ tokenPath, env = process.env }) {
    this.tokenPath = tokenPath;
    this.env = env;
  }

  async read() {
    if (this.env.LARK_USER_ACCESS_TOKEN) {
      return {
        accessToken: this.env.LARK_USER_ACCESS_TOKEN,
        refreshToken: this.env.LARK_USER_REFRESH_TOKEN || '',
        expiresAt: Number(this.env.LARK_USER_TOKEN_EXPIRES_AT || 0),
        openId: this.env.LARK_USER_OPEN_ID || '',
        unionId: this.env.LARK_USER_UNION_ID || '',
        name: this.env.LARK_USER_NAME || '',
      };
    }

    if (!this.tokenPath) return null;

    try {
      const raw = await fs.readFile(this.tokenPath, 'utf8');
      return safeJsonParse(raw, null);
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw error;
    }
  }

  async write(token) {
    if (!this.tokenPath) return;
    await fs.mkdir(path.dirname(this.tokenPath), { recursive: true });
    await fs.writeFile(this.tokenPath, `${JSON.stringify(token, null, 2)}\n`, { mode: 0o600 });
  }
}

export class LarkUserAuthClient {
  constructor({ baseUrl, larkClient, tokenStore, publicBaseUrl, appId, stateSecret, fetchImpl = fetch }) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.larkClient = larkClient;
    this.tokenStore = tokenStore;
    this.publicBaseUrl = publicBaseUrl.replace(/\/$/, '');
    this.appId = appId;
    this.stateSecret = stateSecret;
    this.fetch = fetchImpl;
  }

  redirectUri() {
    return `${this.publicBaseUrl}/auth/lark/callback`;
  }

  authorizationUrl() {
    const params = new URLSearchParams({
      app_id: this.appId,
      redirect_uri: this.redirectUri(),
      state: createOAuthState(this.stateSecret),
    });
    return `${this.baseUrl}/open-apis/authen/v1/index?${params.toString()}`;
  }

  async exchangeCode(code) {
    if (!code) throw new Error('Lark OAuth code is required.');
    const appToken = await this.larkClient.getAppAccessToken();
    const response = await this.fetch(`${this.baseUrl}/open-apis/authen/v1/access_token`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${appToken}`,
        'content-type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code,
      }),
    });
    const data = await response.json();

    if (!response.ok || data.code !== 0) {
      throw new Error(`Failed to exchange Lark OAuth code: ${data.msg || response.statusText}`);
    }

    const token = this.normalizeToken(data.data || {});
    await this.tokenStore.write(token);
    return token;
  }

  async refreshToken(token) {
    if (!token?.refreshToken) throw new Error('No Lark refresh token is available.');
    const appToken = await this.larkClient.getAppAccessToken();
    const response = await this.fetch(`${this.baseUrl}/open-apis/authen/v1/refresh_access_token`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${appToken}`,
        'content-type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        refresh_token: token.refreshToken,
      }),
    });
    const data = await response.json();

    if (!response.ok || data.code !== 0) {
      throw new Error(`Failed to refresh Lark user token: ${data.msg || response.statusText}`);
    }

    const refreshed = this.normalizeToken(data.data || {});
    await this.tokenStore.write(refreshed);
    return refreshed;
  }

  async getAccessToken() {
    const token = await this.tokenStore.read();
    if (!token?.accessToken) return '';

    if (!token.expiresAt || Date.now() < token.expiresAt - 60_000) {
      return token.accessToken;
    }

    const refreshed = await this.refreshToken(token);
    return refreshed.accessToken;
  }

  async status() {
    const token = await this.tokenStore.read();
    return {
      authenticated: Boolean(token?.accessToken),
      expiresAt: token?.expiresAt || null,
      openId: token?.openId || '',
      unionId: token?.unionId || '',
      name: token?.name || '',
    };
  }

  normalizeToken(data) {
    const expiresIn = Number(data.expires_in || data.expire || DEFAULT_TOKEN_TTL_SECONDS);
    return {
      accessToken: data.access_token || '',
      refreshToken: data.refresh_token || '',
      expiresAt: Date.now() + expiresIn * 1000,
      openId: data.open_id || '',
      unionId: data.union_id || '',
      name: data.name || data.en_name || '',
    };
  }
}
