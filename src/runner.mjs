import fs from 'node:fs/promises';
import path from 'node:path';
import { questions, openAssessment, startAssessment, answerQuestion, reportData, readMastery } from './browser.mjs';
import { questionId, feedbackEntry, masterySummary } from './domain.mjs';
import { readJSON, writeJSON, log } from './storage.mjs';
import { solve, checkStop } from './solver.mjs';

export async function learn(root, page) {
  const bank = await readJSON(path.join(root, 'data/answer-bank.json'), {});
  for (const q of await questions(page)) {
    const entry = feedbackEntry(q);
    if (entry) bank[questionId(q)] = entry;
  }
  await writeJSON(path.join(root, 'data/answer-bank.json'), bank);
}
export async function run(root, context, home, config) {
  const lockPath = path.join(root, 'data/run.lock');
  await fs.mkdir(path.dirname(lockPath), { recursive: true });
  let lock;
  try { lock = await fs.open(lockPath, 'wx'); }
  catch (e) {
    if (e.code !== 'EEXIST') throw e;
    const previous = await readJSON(lockPath);
    if (!Number.isInteger(previous?.pid)) throw new Error('运行锁异常，请检查 data/run.lock');
    let active = false; try { process.kill(previous.pid, 0); active = true; } catch {}
    if (active) throw new Error(`已有自动化进程运行（${previous.pid}），不能重复启动`);
    await fs.unlink(lockPath); lock = await fs.open(lockPath, 'wx');
  }
  await lock.writeFile(JSON.stringify({pid:process.pid,time:new Date().toISOString()}));
  await fs.unlink(path.join(root, 'data/STOP')).catch(()=>{});
  let currentPage;
  const progressPath = path.join(root, 'data/progress.json');
  let progress = await readJSON(progressPath, { reports: [], observed: {}, rounds: 0 });
  let stagnant = 0; let lastSignature = '';
  try {
    for (let round = 1; round <= config.maxRounds; round++) {
      await checkStop(root);
      const items = await readMastery(home);
      const summary = masterySummary(items);
      if (summary.allComplete) {
        progress.status = 'complete'; progress.homeMastery = items;
        await writeJSON(progressPath, progress); console.log('全部已列出的知识点掌握度均为 100%'); return;
      }
      currentPage = await openAssessment(context, config);
      await startAssessment(currentPage, config);
      progress.status = 'answering'; delete progress.reason; await writeJSON(progressPath, progress);
      while (true) {
        await checkStop(root);
        await learn(root, currentPage);
        if (await currentPage.locator('.eval-report').count()) break;
        const all = await questions(currentPage);
        const q = all.find(q => !q.answered);
        if (q) {
          progress.currentQuestion = { label:q.label, stem:q.stem, time:new Date().toISOString() };
          await writeJSON(progressPath, progress);
          console.log(JSON.stringify({event:'question',round,label:q.label,stem:q.stem}));
          const answer = await solve(root, home, q, config);
          await checkStop(root);
          const result = await answerQuestion(currentPage, q, answer, config);
          await log(root, 'answer', { ...result, stem: q.stem });
          console.log(JSON.stringify({event:'answered',round,label:q.label,correct:result.verified}));
          continue;
        }
        const submit = currentPage.getByText('提交测评并查看报告', { exact: true });
        if (await submit.isVisible()) { await submit.click(); break; }
        await currentPage.waitForFunction(() => !!document.querySelector('.quiz-item:not(:has(.quiz-feedback))') || [...document.querySelectorAll('button')].some(e=>e.textContent.trim()==='提交测评并查看报告') || !!document.querySelector('.eval-report'), null, {timeout:config.timeoutMs});
      }
      await learn(root, currentPage);
      progress.status = 'report'; await writeJSON(progressPath, progress);
      const report = await reportData(currentPage, config);
      const reportName = `${Date.now()}.json`;
      await writeJSON(path.join(root, 'data/reports', reportName), report);
      progress.reports.push(reportName); progress.rounds++;
      for (const item of report.mastery) progress.observed[item.name] = item.mastery;
      await currentPage.screenshot({ path: path.join(root, 'data/reports', `${reportName}.png`), fullPage: true });
      console.log(JSON.stringify({event:'report',round,mastery:report.mastery}));
      await log(root, 'report', {file:reportName,mastery:report.mastery});
      await currentPage.close(); currentPage = null;
      await home.reload({waitUntil:'domcontentloaded'});
      progress.homeMastery = await readMastery(home);
      progress.status = 'between-rounds'; delete progress.currentQuestion;
      await writeJSON(progressPath, progress);
      const signature = JSON.stringify([progress.homeMastery,progress.observed]);
      stagnant = signature === lastSignature ? stagnant + 1 : 0; lastSignature = signature;
      if (stagnant >= config.maxStagnantRounds) throw new Error(`连续 ${stagnant} 轮掌握度无变化，需要检查模块入口或未显示掌握度的知识点`);
    }
    progress.status = 'round-limit'; await writeJSON(progressPath, progress);
    console.log(`达到本次运行轮数上限 ${config.maxRounds}，进度已保存，可再次启动继续。`);
  } catch (e) {
    progress.status = 'needs-attention'; progress.reason = e.message;
    await writeJSON(progressPath, progress);
    if (currentPage && !currentPage.isClosed()) {
      await currentPage.screenshot({path:path.join(root,'data/last-page.png'),fullPage:true}).catch(()=>{});
      await fs.writeFile(path.join(root,'data/last-page.html'),await currentPage.content()).catch(()=>{});
    }
    throw e;
  } finally {
    await lock.close(); await fs.unlink(lockPath).catch(()=>{});
  }
}
