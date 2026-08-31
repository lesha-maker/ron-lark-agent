import fs from 'node:fs/promises';
import path from 'node:path';

export class JsonlEventStore {
  constructor(filePath) {
    this.filePath = filePath;
  }

  async append(event) {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.appendFile(this.filePath, `${JSON.stringify(event)}\n`, 'utf8');
  }

  async recent(limit = 20) {
    try {
      const content = await fs.readFile(this.filePath, 'utf8');
      return content
        .trim()
        .split('\n')
        .filter(Boolean)
        .slice(-limit)
        .map((line) => JSON.parse(line));
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw error;
    }
  }
}
