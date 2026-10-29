import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
let files;
try { files = execFileSync('git',['ls-files','-z'],{encoding:'utf8'}).split('\0').filter(Boolean); }
catch { console.error('请在 Git 仓库中运行发布检查（ZIP 使用者日常运行不需要此步骤）。'); process.exit(1); }
const forbidden = /(^|\/)(browser-profile|data|node_modules)(\/|$)|(^|\/)config\.local\.json$|(^|\/)\.env(?:\..+)?$|\.(pem|key|pfx|log)$/i;
const secrets = /gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|C:[\\/]Users[\\/][A-Za-z0-9_-]+[\\/]|mapUid\s*[=:]\s*\d{6,}/;
const problems=[];
for (const file of files) {
  if (forbidden.test(file) && file !== '.env.example') problems.push({file,reason:'不应提交的运行数据或本地配置'});
  if (fs.existsSync(file) && fs.statSync(file).isFile() && secrets.test(fs.readFileSync(file,'utf8'))) problems.push({file,reason:'疑似凭证、个人路径或用户级标识'});
}
if (problems.length) { console.error(JSON.stringify(problems,null,2)); process.exit(1); }
console.log(`发布检查通过：${files.length} 个跟踪文件；此检查不能代替人工审阅，也不检查历史提交。`);
