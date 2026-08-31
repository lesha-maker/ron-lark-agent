export class LarkClient {
  constructor({ baseUrl, appId, appSecret, fetchImpl = fetch }) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.appId = appId;
    this.appSecret = appSecret;
    this.fetch = fetchImpl;
    this.tenantToken = null;
    this.tenantTokenExpiresAt = 0;
  }

  async getTenantAccessToken() {
    if (this.tenantToken && Date.now() < this.tenantTokenExpiresAt - 60_000) {
      return this.tenantToken;
    }

    if (!this.appId || !this.appSecret) {
      throw new Error('LARK_APP_ID and LARK_APP_SECRET are required to send bot replies.');
    }

    const response = await this.fetch(`${this.baseUrl}/open-apis/auth/v3/tenant_access_token/internal`, {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        app_id: this.appId,
        app_secret: this.appSecret,
      }),
    });
    const data = await response.json();

    if (!response.ok || data.code !== 0) {
      throw new Error(`Failed to get Lark tenant access token: ${data.msg || response.statusText}`);
    }

    this.tenantToken = data.tenant_access_token;
    this.tenantTokenExpiresAt = Date.now() + Number(data.expire || 7200) * 1000;
    return this.tenantToken;
  }

  async replyText(messageId, text) {
    const token = await this.getTenantAccessToken();
    const response = await this.fetch(`${this.baseUrl}/open-apis/im/v1/messages/${messageId}/reply`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({
        msg_type: 'text',
        content: JSON.stringify({ text }),
      }),
    });
    const data = await response.json();

    if (!response.ok || data.code !== 0) {
      throw new Error(`Failed to send Lark reply: ${data.msg || response.statusText}`);
    }

    return data.data;
  }

  async listMessages({
    containerId,
    containerIdType = 'chat',
    startTime,
    endTime,
    pageSize = 50,
    pageToken,
    sortType = 'ByCreateTimeAsc',
  }) {
    const token = await this.getTenantAccessToken();
    const params = new URLSearchParams({
      container_id_type: containerIdType,
      container_id: containerId,
      page_size: String(pageSize),
      sort_type: sortType,
    });

    if (startTime) params.set('start_time', String(startTime));
    if (endTime) params.set('end_time', String(endTime));
    if (pageToken) params.set('page_token', pageToken);

    const response = await this.fetch(`${this.baseUrl}/open-apis/im/v1/messages?${params.toString()}`, {
      method: 'GET',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json; charset=utf-8',
      },
    });
    const data = await response.json();

    if (!response.ok || data.code !== 0) {
      throw new Error(`Failed to list Lark messages: ${data.msg || response.statusText}`);
    }

    return data.data || { items: [], has_more: false };
  }
}
