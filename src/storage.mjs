import fs from 'node:fs/promises';
import path from 'node:path';
export async function readJSON(file, fallback = null) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch (e) { if (e.code === 'ENOENT') return fallback; throw e; }
}
export async function writeJSON(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(temp, JSON.stringify(value, null, 2), 'utf8');
  await fs.rename(temp, file);
}
export async function log(root, event, data = {}) {
  await fs.mkdir(path.join(root, 'data'), { recursive: true });
  await fs.appendFile(path.join(root, 'data/events.jsonl'), JSON.stringify({ time: new Date().toISOString(), event, ...data }) + '\n');
}
