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
}
