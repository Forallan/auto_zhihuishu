import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJSON, writeJSON, log } from './src/storage.mjs';
import { connect, homePage, assessmentPage, readMastery, openAssessment, startAssessment, questions, answerQuestion, reportData } from './src/browser.mjs';
import { questionId, masterySummary } from './src/domain.mjs';
import { run, learn } from './src/runner.mjs';
const root = path.dirname(fileURLToPath(import.meta.url));
const config = { ...await readJSON(path.join(root, 'config.json')), ...await readJSON(path.join(root, 'config.local.json'), {}) };
const [command = 'inspect', ...args] = process.argv.slice(2);
const roundsArg = args.find(arg => arg.startsWith('--rounds='));
if (roundsArg) config.maxRounds = Number(roundsArg.split('=')[1]);
let browser;
try {
  if (command === 'status') {
    const progress = await readJSON(path.join(root, 'data/progress.json'));
    const pending = await readJSON(path.join(root, 'data/pending.json'));
    if (args.includes('--json')) console.log(JSON.stringify({progress,pending},null,2));
    else if (!progress) console.log('尚未启动连续运行器。');
    else {
      const names = {answering:'正在答题',report:'正在生成和保存报告','between-rounds':'准备下一轮',complete:'全部达到 100%','round-limit':'已达到本次轮数上限','needs-attention':'已暂停，需要检查'};
      const summary = masterySummary(progress.homeMastery ?? []);
      console.log(`状态：${names[progress.status] ?? progress.status}\n连续运行器累计完成：${progress.rounds} 轮\n首页知识点：${summary.total} 个；已达 100%：${summary.complete} 个；未达标：${summary.pending.length} 个；未显示掌握度：${summary.unknown.length} 个`);
      if (progress.currentQuestion) console.log(`当前：${progress.currentQuestion.label} ${progress.currentQuestion.stem}`);
      if (progress.reason) console.log(`原因：${progress.reason}`);
      for (const item of [...summary.pending,...summary.unknown]) console.log(`${item.mastery === null ? '待确认' : item.mastery+'%'}  ${item.name}`);
      if (pending) console.log(`等待确认答案：${pending.question.stem}\n${pending.question.options.map(o=>o.key+' '+o.text).join('\n')}\n确认命令：node cli.mjs resolve 选项 ${pending.id}`);
    }
  } else if (command === 'stop') {
    await fs.mkdir(path.join(root, 'data'), {recursive:true});
    await fs.writeFile(path.join(root, 'data/STOP'), new Date().toISOString());
    console.log('已发出停止请求；程序在当前操作完成后保留进度。');
  } else if (command === 'resolve') {
    const pending = await readJSON(path.join(root, 'data/pending.json'));
    if (!pending) throw new Error('当前没有等待确认的题目');
    if (args[1] !== pending.id) throw new Error('请同时提供题目 ID，防止向下一道题写入旧答案');
    const { validateAnswer } = await import('./src/domain.mjs');
    const answers = validateAnswer(pending.question, args[0]?.split('') ?? []);
    await writeJSON(path.join(root, 'data/answer.json'), {token:pending.token,id:pending.id,answers});
    console.log('答案已保存。运行中的程序会自动读取；如果已因超时退出，请重新启动 start.cmd，程序会从保留的题目接续。');
  } else if (command === 'wait-login') {
    const connection = await connect(config); browser = connection.browser;
    const until = Date.now() + 600000; let ready = false;
    while (Date.now() < until) {
      try {
        const home = homePage(connection.context, config);
        await home.locator('.assess-btn').waitFor({timeout:3000}); ready = true; break;
      } catch { await new Promise(r=>setTimeout(r,1500)); }
    }
    if (!ready) throw new Error('等待登录超时，请登录课程后重新启动。');
    console.log('课程登录已就绪。');
  } else {
    if (!['inspect','open','answer','report','finish','run'].includes(command)) throw new Error('命令：inspect | open | answer 选项 | finish | run [--rounds=N] | status | stop | resolve 选项 题目ID');
    if (!Number.isInteger(config.maxRounds) || config.maxRounds < 1 || !Number.isInteger(config.timeoutMs) || config.timeoutMs < 1000) throw new Error('config.json 中的轮数或超时时间无效');
    const existingLock = await readJSON(path.join(root,'data/run.lock'));
    let running = false; if (existingLock?.pid) { try { process.kill(existingLock.pid,0); running = true; } catch {} }
    if (running && !['inspect','run'].includes(command)) throw new Error('自动化正在运行，请使用 resolve 回答等待中的题目，或先执行 stop');
    const connection = await connect(config); browser = connection.browser;
    const { context } = connection;
    const home = homePage(context, config);
    let page = assessmentPage(context, config);
    if (command === 'run') {
      await run(root, context, home, config);
    } else {
      if (page && !running) await learn(root, page);
      if (command === 'open') { page = await openAssessment(context, config); await startAssessment(page, config); }
      if (command === 'report' || command === 'finish') {
        if (!page) throw new Error('没有测评页面');
        if (!(await page.locator('.eval-report').count())) await page.getByText('提交测评并查看报告', { exact: true }).click();
        const report = await reportData(page, config);
        await writeJSON(path.join(root, `data/reports/${Date.now()}.json`), report);
        console.log(JSON.stringify({ report }, null, 2));
        if (command === 'finish') {
          await page.close(); page = null;
          await home.reload({ waitUntil: 'domcontentloaded' });
        }
      }
      if (command === 'answer') {
        if (!page) throw new Error('没有测评页面');
        const q = (await questions(page)).find(q=>!q.answered);
        if (!q) throw new Error('没有可作答题目');
        const result = await answerQuestion(page, q, args[0]?.split('') ?? [], config);
        await log(root, 'answer', { ...result, stem: q.stem }); await learn(root,page);
        console.log(JSON.stringify({ result }));
      }
      const mastery = await readMastery(home);
      const snapshot = { url: page?.url(), mastery, summary: masterySummary(mastery),
        questions: page ? await questions(page) : [], text: page ? await page.locator('body').innerText() : '' };
      await writeJSON(path.join(root, 'data/snapshot.json'), snapshot);
      console.log(JSON.stringify({ summary: { total: snapshot.summary.total, complete: snapshot.summary.complete, pending: snapshot.summary.pending.length, unknown: snapshot.summary.unknown.length },
        question: snapshot.questions.at(-1) ? { id: questionId(snapshot.questions.at(-1)), ...snapshot.questions.at(-1), html: undefined } : null }, null, 2));
    }
  }
} catch (e) { console.error(e.stack ?? e.message); process.exitCode = 1; }
finally { if (browser) await browser.close(); }
