import { loadPlaywright } from './runtime.mjs';
import { questionId, validateAnswer } from './domain.mjs';
export async function connect(config) {
  const { chromium } = loadPlaywright();
  const browser = await chromium.connectOverCDP(config.cdpUrl, { timeout: 15000 });
  const context = browser.contexts()[0];
  context.setDefaultTimeout(20000);
  return { browser, context };
}
export function homePage(context, config) {
  const p = context.pages().find(p => p.url().split('?')[0] === config.courseUrl);
  if (!p) throw new Error('没有找到课程首页。请在专用 Edge 中登录并进入 config.json 指定的课程。');
  return p;
}
export function assessmentPage(context, config) {
  const course = new URL(config.courseUrl).pathname.split('/').slice(-2).join('/');
  return context.pages().find(p => p.url().includes(`/AIEvaluation/${course}`));
}
export async function readMastery(home) {
  await home.locator('.item-content[knowledgeid]').first().waitFor({ timeout: 60000 });
  return home.locator('.item-content[knowledgeid]').evaluateAll(cards => cards.map(el => {
    const p = el.querySelector('.item-top-right [role="progressbar"]');
    return { id: el.getAttribute('knowledgeid'), name: el.querySelector('.item-title')?.textContent.trim(),
      mastery: p ? Number(p.getAttribute('aria-valuenow')) : null,
      module: el.closest('[id^="knowledgeItem-"]')?.querySelector('.title-left-text')?.textContent.trim() ?? null };
  }));
}
export async function openAssessment(context, config) {
  let page = assessmentPage(context, config);
  if (page) return page;
  const home = homePage(context, config);
  const popup = home.waitForEvent('popup', { timeout: 30000 });
  await home.locator('.assess-btn').click();
  page = await popup;
  page.__zhsNewPopup = true;
  await page.waitForLoadState('domcontentloaded');
  return page;
}
export async function startAssessment(page, config) {
  const waitReady = () => page.waitForFunction(() => document.querySelector('.quiz-item') || document.querySelector('.eval-report') || [...document.querySelectorAll('.knowledge-header:not(.knowledge-header--disabled)')].some(e=>e.textContent.includes('测评近期知识点')), null, {timeout:config.timeoutMs});
  await waitReady();
  const existing = await questions(page);
  // A fresh tab can restore the already submitted round from browser storage.
  if (page.__zhsNewPopup && existing.length && existing.every(q=>q.answered)) {
    await page.getByText('新建对话', {exact:true}).click();
    await page.waitForFunction(() => !document.querySelector('.quiz-item'), null, {timeout:config.timeoutMs});
    await waitReady();
  }
  page.__zhsNewPopup = false;
  if (await page.locator('.quiz-item').count()) return;
  const card = page.locator('.knowledge-header:not(.knowledge-header--disabled)').filter({hasText:'测评近期知识点，提升掌握度'});
  try { await card.click({timeout:5000}); }
  catch (e) { if (!(await page.locator('.quiz-item').count())) throw e; }
  await page.locator('.quiz-item').first().waitFor({ timeout: config.timeoutMs });
}
export async function questions(page) {
  return page.locator('.quiz-item').evaluateAll(cards => cards.map((el, index) => ({
    index,
    label: el.querySelector('.quiz-item__index')?.textContent.trim(),
    type: el.querySelector('.quiz-item__type')?.textContent.trim() ?? '',
    stem: el.querySelector('.quiz-item__stem')?.textContent.trim() ?? '',
    options: [...el.querySelectorAll('.quiz-option')].map(o => ({ key: o.querySelector('.quiz-option__key')?.textContent.trim(), text: o.querySelector('.quiz-option__text')?.textContent.trim(), className: o.className })),
    text: el.innerText,
    answered: !!el.querySelector('.quiz-feedback'),
    correct: !!el.querySelector('.quiz-feedback--correct'),
    html: el.outerHTML
  })));
}
export async function answerQuestion(page, q, answer, config) {
  const letters = validateAnswer(q, answer);
  const card = page.locator('.quiz-item').nth(q.index);
  const current = (await questions(page))[q.index];
  if (!current || questionId(current) !== questionId(q) || current.answered) throw new Error('题目已经变化或已作答，拒绝重复提交');
  for (const option of current.options) {
    const selected = /quiz-option--selected/.test(option.className);
    if (q.type.includes('多选') ? selected !== letters.includes(option.key) : letters.includes(option.key)) {
      await card.locator('.quiz-option').nth(current.options.findIndex(o => o.key === option.key)).click();
    }
  }
  if (q.type.includes('多选')) await card.getByText('提交', { exact: true }).click();
  await card.locator('.quiz-feedback').waitFor({ timeout: config.timeoutMs });
  const result = (await questions(page))[q.index];
  await page.waitForFunction(index => document.querySelectorAll('.quiz-item').length > index + 1 || [...document.querySelectorAll('button,div')].some(el => el.textContent.trim() === '提交测评并查看报告'), q.index, { timeout: config.timeoutMs });
  return { id: questionId(q), letters, texts: q.options.filter(o => letters.includes(o.key)).map(o => o.text), verified: result.correct, feedback: result.text };
}
export async function reportData(page, config) {
  const report = page.locator('.eval-report').last();
  await report.waitFor({ timeout: config.timeoutMs });
  await report.locator('.eval-knowledge__item').first().waitFor({ timeout: config.timeoutMs });
  await report.getByText('已完成匹配个性化学习内容', { exact: true }).waitFor({ timeout: config.timeoutMs });
  const toggle = report.locator('.eval-knowledge__toggle');
  if (await toggle.count() && (await toggle.innerText()).trim() === '展开') await toggle.click();
  // All three generation steps must finish; then require stable report content.
  let previous = ''; let stable = 0; const until = Date.now() + config.timeoutMs;
  while (Date.now() < until) {
    const text = await report.innerText();
    stable = text === previous ? stable + 1 : 0; previous = text;
    if (stable >= 3) break;
    await page.waitForTimeout(700);
  }
  if (stable < 3) throw new Error('报告内容尚未稳定，保留标签页供继续检查');
  const mastery = await report.locator('.eval-knowledge__item').evaluateAll(items => items.map(el => ({
    name: el.querySelector('.eval-knowledge__name')?.textContent.trim(),
    mastery: Number(el.querySelector('.eval-knowledge__val')?.textContent.replace('%', '').trim())
  })));
  if (mastery.some(i => !i.name || !Number.isFinite(i.mastery) || i.mastery < 0 || i.mastery > 100)) throw new Error('报告掌握度数据异常');
  return { time: new Date().toISOString(), mastery, text: await report.innerText() };
}
