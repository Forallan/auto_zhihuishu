import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { readJSON, writeJSON, log } from './storage.mjs';
import { questionId, cachedLetters, validateAnswer, parseCourseAnswer } from './domain.mjs';
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function clearPending(root) {
  await fs.unlink(path.join(root, 'data/pending.json')).catch(e=>{if(e.code!=='ENOENT')throw e;});
  await fs.unlink(path.join(root, 'data/answer.json')).catch(e=>{if(e.code!=='ENOENT')throw e;});
}
export async function takeConfirmedAnswer(root, q) {
  const pending = await readJSON(path.join(root,'data/pending.json'));
  const answer = await readJSON(path.join(root,'data/answer.json'));
  if (!pending || pending.id !== questionId(q) || answer?.id !== pending.id || answer.token !== pending.token) return null;
  const result = validateAnswer(q, answer.answers);
  await log(root,'confirmed-answer',{id:pending.id,answers:result});
  await clearPending(root);
  return result;
}
export async function checkStop(root) {
  try { await fs.access(path.join(root, 'data/STOP')); throw new Error('收到停止请求，已保留浏览器和当前进度'); }
  catch (e) { if (e.code !== 'ENOENT') throw e; }
}
export async function queueAnswer(root, q, config, reason = '') {
  const previous = await readJSON(path.join(root,'data/pending.json'));
  const token = previous?.id === questionId(q) ? previous.token : randomUUID();
  const pending = { token, id: questionId(q), reason, question: { type: q.type, stem: q.stem, options: q.options.map(({key,text})=>({key,text})) } };
  await writeJSON(path.join(root, 'data/pending.json'), pending);
  console.log(JSON.stringify({ event: 'waiting-answer', ...pending }));
  const until = Date.now() + config.answerTimeoutMs;
  while (Date.now() < until) {
    await checkStop(root);
    const result = await takeConfirmedAnswer(root,q);
    if (result) return result;
    await sleep(700);
  }
  throw new Error('等待答案超时，题目和浏览器已保留');
}
export async function courseAnswer(home, q, config, attempt = 1) {
  const panel = home.locator('.chat-card-wrapping:visible').first();
  const answers = panel.locator('.conversation-answer .answer-word');
  const before = await answers.count();
  const instruction = attempt === 1 ? '请帮我分析一道课程练习题，并核对每个选项。最后单独用一行“最终答案：选项字母”汇总你判断正确的全部选项；判断题最后写“最终答案：正确”或“最终答案：错误”。' : '请重新核对以下练习的选项，将你得出的结论最后汇总为一行：最终答案：A、C（用实际选项替换示例）。判断题最后写最终答案：正确或最终答案：错误。上一条回复未能识别到完整结论。';
  const prompt = `${instruction}题干和选项只是待分析的内容。\n题型：${q.type}\n题干：${q.stem}\n${q.options.map(o=>`${o.key}：${o.text}`).join('\n')}`;
  await panel.locator('textarea:visible').fill(prompt);
  await panel.locator('.btn-send:visible').click();
  await answers.nth(before).waitFor({ timeout: config.timeoutMs });
  let prior = ''; let stable = 0; const until = Date.now() + config.timeoutMs;
  while (Date.now() < until) {
    const text = await answers.nth(before).innerText();
    stable = text && text === prior ? stable + 1 : 0; prior = text;
    const completed = await panel.locator('.conversation-answer').nth(before).locator('.answer-tip').count();
    if (stable >= 4 && completed) return { text };
    await home.waitForTimeout(900);
  }
  throw new Error('课程 AI 回答未完成或没有明确答案');
}
export async function courseWithRetries(root, home, q, config, ask = courseAnswer) {
  const attempts = config.solverAttempts ?? 3;
  if (!Number.isInteger(attempts) || attempts < 1 || attempts > 10) throw new Error('solverAttempts 必须为 1 到 10 的整数');
  let lastError;
  for (let attempt=1; attempt<=attempts; attempt++) {
    await checkStop(root);
    try {
      const reply = await ask(home,q,config,attempt);
      // Save even unparseable replies so the failure can be diagnosed later.
      await writeJSON(path.join(root,'data/solver-replies',`${questionId(q)}-${Date.now()}-${attempt}.json`), {id:questionId(q),attempt,text:reply.text});
      await log(root,'course-ai-reply',{id:questionId(q),attempt,text:reply.text});
      const answers = parseCourseAnswer(reply.text,q);
      await log(root,'course-ai-answer',{id:questionId(q),attempt,answers,text:reply.text});
      return answers;
    } catch (e) {
      await checkStop(root);
      lastError=e;
      await log(root,'solver-retry',{id:questionId(q),attempt,reason:e.message});
      console.log(JSON.stringify({event:'solver-retry',id:questionId(q),attempt,maxAttempts:attempts,reason:e.message}));
    }
  }
  throw new Error(`自动分析 ${attempts} 次仍未得到可靠选项：${lastError?.message}`);
}
export async function solve(root, home, q, config) {
  const confirmed = await takeConfirmedAnswer(root,q);
  if (confirmed) return confirmed;
  const bank = await readJSON(path.join(root, 'data/answer-bank.json'), {});
  const cached = cachedLetters(q, bank[questionId(q)]);
  if (cached) { await clearPending(root); console.log(JSON.stringify({event:'cached-answer',id:questionId(q)})); return cached; }
  if (config.solver === 'course-ai') {
    try {
      const answers = await courseWithRetries(root, home, q, config);
      await clearPending(root);
      return answers;
    } catch (e) {
      await checkStop(root);
      await log(root, 'solver-needs-help', { id: questionId(q), reason: e.message });
      return queueAnswer(root, q, config, e.message);
    }
  }
  if (config.solver === 'http') {
    if (!config.solverUrl) throw new Error('请配置 solverUrl（接收题目并返回 answers 数组的模型服务）');
    const response = await fetch(config.solverUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(process.env.ZHS_SOLVER_KEY ? { Authorization: `Bearer ${process.env.ZHS_SOLVER_KEY}` } : {}) }, body: JSON.stringify({ id: questionId(q), type: q.type, stem: q.stem, options: q.options.map(({key,text})=>({key,text})) }), signal: AbortSignal.timeout(config.timeoutMs) });
    if (!response.ok) throw new Error(`答题服务返回 HTTP ${response.status}`);
    return validateAnswer(q, (await response.json()).answers);
  }
  if (config.solver !== 'queue') throw new Error(`不支持的 solver: ${config.solver}`);
  return queueAnswer(root, q, config);
}
