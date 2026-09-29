export function taskListGuidFromInput(input) {
  const value = String(input || '').trim();
  if (!value) return '';

  try {
    const url = new URL(value);
    return url.searchParams.get('guid') || '';
  } catch {
    return value;
  }
}

export class LarkTaskClient {
  constructor({ baseUrl, larkClient, userAuthClient = null, preferUserToken = false, fetchImpl = fetch }) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.larkClient = larkClient;
    this.userAuthClient = userAuthClient;
    this.preferUserToken = preferUserToken;
    this.fetch = fetchImpl;
  }

  async get(path, params = {}) {
    const token = await this.getAccessToken();
    const searchParams = new URLSearchParams(params);
    const query = searchParams.toString();
    const response = await this.fetch(`${this.baseUrl}${path}${query ? `?${query}` : ''}`, {
      method: 'GET',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json; charset=utf-8',
      },
    });
    const data = await response.json();

    if (!response.ok || data.code !== 0) {
      throw new Error(`Lark task request failed: ${data.msg || response.statusText}`);
    }

    return data.data || {};
  }

  async getAccessToken() {
    if (this.preferUserToken) {
      const userToken = await this.userAuthClient?.getAccessToken();
      if (userToken) return userToken;
    }
    return this.larkClient.getTenantAccessToken();
  }

  async getTaskList(taskListGuid) {
    const guid = taskListGuidFromInput(taskListGuid);
    if (!guid) throw new Error('taskListGuid is required.');

    const data = await this.get(`/open-apis/task/v2/tasklists/${encodeURIComponent(guid)}`, {
      user_id_type: 'open_id',
    });
    return data.tasklist || data;
  }

  async listTaskListTasks(taskListGuid, { pageSize = 50, pageToken, limit = 200 } = {}) {
    const guid = taskListGuidFromInput(taskListGuid);
    if (!guid) throw new Error('taskListGuid is required.');

    const tasks = [];
    let nextPageToken = pageToken;

    do {
      const data = await this.get(`/open-apis/task/v2/tasklists/${encodeURIComponent(guid)}/tasks`, {
        user_id_type: 'open_id',
        page_size: String(pageSize),
        ...(nextPageToken ? { page_token: nextPageToken } : {}),
      });
      const items = data.items || data.tasks || data.task_items || [];
      tasks.push(...items);
      nextPageToken = data.has_more && tasks.length < limit ? data.page_token : '';
    } while (nextPageToken);

    return tasks.slice(0, limit);
  }

  async readTaskList(taskListGuid, options = {}) {
    const guid = taskListGuidFromInput(taskListGuid);
    const [tasklist, tasks] = await Promise.all([
      this.getTaskList(guid),
      this.listTaskListTasks(guid, options),
    ]);

    return {
      guid,
      tasklist,
      tasks,
    };
  }
}
