import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadPlaywright } from '../src/runtime.mjs';
import { startAssessment, questions, reportData } from '../src/browser.mjs';
const config = { timeoutMs:10000 };
async function isolatedPage(work) {
  const browser = await loadPlaywright().chromium.launch({ headless:true, ...(process.env.ZHS_TEST_BROWSER_CHANNEL ? {channel:process.env.ZHS_TEST_BROWSER_CHANNEL} : {}) });
  const page = await browser.newPage();
  try { await work(page); } finally { await page.close(); await browser.close(); }
}
test('新标签页恢复已答完题卡时，新建对话后再开始一轮',async()=>{
  await isolatedPage(async page=>{
    await page.setContent(`<button id="new">新建对话</button><main><div class="quiz-item"><div class="quiz-feedback">已作答</div></div><div class="knowledge-header knowledge-header--disabled">测评近期知识点，提升掌握度</div></main>
      <script>document.querySelector('#new').onclick=()=>{window.resets=(window.resets||0)+1;document.querySelector('main').innerHTML='';setTimeout(()=>{const card=document.createElement('div');card.className='knowledge-header';card.textContent='测评近期知识点，提升掌握度';card.onclick=()=>{document.querySelector('main').innerHTML='<div class="quiz-item"><p class="quiz-item__stem">全新题目</p></div>'};document.querySelector('main').appendChild(card)},150)}</script>`);
    page.__zhsNewPopup = true;
    await startAssessment(page,config);
    assert.equal(await page.evaluate(()=>window.resets),1);
    assert.equal((await questions(page))[0].stem,'全新题目');
    assert.equal((await questions(page))[0].answered,false);
  });
});
test('未完成的现有测评继续作答，不点击旧的禁用开始入口',async()=>{
  await isolatedPage(async page=>{
    await page.setContent('<div class="quiz-item"><p class="quiz-item__stem">待答题目</p></div><div class="knowledge-header knowledge-header--disabled">测评近期知识点，提升掌握度</div>');
    await startAssessment(page,config);
    assert.equal((await questions(page))[0].stem,'待答题目');
  });
});
test('报告必须等生成完成，并展开隐藏的知识点后读取',async()=>{
  await isolatedPage(async page=>{
    await page.setContent(`<section class="eval-report"><span id="step">正在生成</span><div class="eval-knowledge__item"><span class="eval-knowledge__name">知识点甲</span><span class="eval-knowledge__val">100%</span></div><button class="eval-knowledge__toggle">展开</button></section><script>setTimeout(()=>document.querySelector('#step').textContent='已完成匹配个性化学习内容',200);document.querySelector('button').onclick=()=>{const row=document.createElement('div');row.className='eval-knowledge__item';row.innerHTML='<span class="eval-knowledge__name">知识点乙</span><span class="eval-knowledge__val">37%</span>';document.querySelector('section').appendChild(row);document.querySelector('button').textContent='收起';}</script>`);
    const report = await reportData(page,config);
    assert.deepEqual(report.mastery,[{name:'知识点甲',mastery:100},{name:'知识点乙',mastery:37}]);
  });
});
