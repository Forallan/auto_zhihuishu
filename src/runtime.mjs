import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
export function loadPlaywright() {
  try { return require('playwright'); } catch {}
  throw new Error('未找到项目依赖。首次使用请运行 setup.cmd，或在项目目录执行 npm ci。');
}
