function cellToText(cell) {
  if (Array.isArray(cell)) {
    return cell.map((part) => part.text || part.link || part.fileToken || '').join('').trim();
  }

  return String(cell || '').trim();
}

function contractAttachments(cell) {
  if (!Array.isArray(cell)) return [];

  return cell
    .filter((part) => part?.fileToken)
    .map((part) => ({
      fileToken: part.fileToken,
      filename: part.text || part.fileToken,
      mimeType: part.mimeType || '',
      size: part.size || null,
    }));
}

export class LarkSheetsClient {
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
      throw new Error(`Lark sheets request failed: ${data.msg || response.statusText}`);
    }

    return data.data || {};
  }

  async getWikiNode(wikiToken) {
    const params = new URLSearchParams({ token: wikiToken });
    return this.get(`/open-apis/wiki/v2/spaces/get_node?${params.toString()}`);
  }

  async getMetaInfo(spreadsheetToken) {
    return this.get(`/open-apis/sheets/v2/spreadsheets/${spreadsheetToken}/metainfo`);
  }

  async getValues(spreadsheetToken, range) {
    const encodedRange = encodeURIComponent(range);
    const data = await this.get(`/open-apis/sheets/v2/spreadsheets/${spreadsheetToken}/values/${encodedRange}`);
    return data.valueRange?.values || [];
  }

  async readContractsOverview(wikiToken) {
    if (!wikiToken) return null;

    const nodeData = await this.getWikiNode(wikiToken);
    const node = nodeData.node || nodeData;
    if (node.obj_type !== 'sheet') {
      throw new Error(`Unsupported Lark contracts object type: ${node.obj_type || 'unknown'}`);
    }

    const meta = await this.getMetaInfo(node.obj_token);
    const sheet = meta.sheets?.[0];
    if (!sheet) throw new Error('Contracts spreadsheet has no sheets.');

    const range = `${sheet.sheetId}!A1:${columnName(sheet.columnCount || 20)}${sheet.rowCount || 200}`;
    const values = await this.getValues(node.obj_token, range);
    const headers = (values[0] || []).map(cellToText);

    const rows = values.slice(1)
      .map((row) => rowToContractRow(headers, row))
      .filter((row) => row.client);

    return {
      title: node.title || meta.properties?.title || '',
      wikiToken,
      spreadsheetToken: node.obj_token,
      sheetId: sheet.sheetId,
      rows,
    };
  }
}

function rowToContractRow(headers, row) {
  const get = (name) => {
    const index = headers.findIndex((header) => header.toLowerCase().trim() === name);
    return index >= 0 ? row[index] : '';
  };

  const contractCell = get('contract');

  return {
    client: cellToText(get('client')),
    agentList: cellToText(get('agent list for pilot')),
    humanNeed: cellToText(get('human need')),
    startDate: cellToText(get('start date')),
    country: cellToText(get('country')),
    firstInvoiceDate: cellToText(get('first invoice date')),
    firstInvoiceRaised: cellToText(get('first invoice raised')),
    contractAttachments: contractAttachments(contractCell),
  };
}

function columnName(columnNumber) {
  let number = columnNumber;
  let name = '';
  while (number > 0) {
    const remainder = (number - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    number = Math.floor((number - 1) / 26);
  }
  return name || 'T';
}
