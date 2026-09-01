export class LarkDocsClient {
  constructor({ baseUrl, larkClient, fetchImpl = fetch }) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.larkClient = larkClient;
    this.fetch = fetchImpl;
  }

  async get(path) {
    const token = await this.larkClient.getTenantAccessToken();
    const response = await this.fetch(`${this.baseUrl}${path}`, {
      method: 'GET',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json; charset=utf-8',
      },
    });
    const data = await response.json();

    if (!response.ok || data.code !== 0) {
      throw new Error(`Lark docs request failed: ${data.msg || response.statusText}`);
    }

    return data.data || {};
  }

  async getWikiNode(wikiToken) {
    const params = new URLSearchParams({ token: wikiToken });
    return this.get(`/open-apis/wiki/v2/spaces/get_node?${params.toString()}`);
  }

  async getDocumentRawContent(documentId) {
    const data = await this.get(`/open-apis/docx/v1/documents/${documentId}/raw_content`);
    return data.content || '';
  }

  async readWikiDocument(wikiToken) {
    if (!wikiToken) return null;

    const nodeData = await this.getWikiNode(wikiToken);
    const node = nodeData.node || nodeData;

    if (node.obj_type !== 'docx') {
      throw new Error(`Unsupported Lark wiki object type: ${node.obj_type || 'unknown'}`);
    }

    const content = await this.getDocumentRawContent(node.obj_token);
    return {
      title: node.title || '',
      wikiToken,
      documentId: node.obj_token,
      content,
    };
  }
}
