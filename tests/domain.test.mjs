import { test } from 'node:test';
import assert from 'node:assert/strict';
import { questionId, cachedLetters, validateAnswer, masterySummary, feedbackEntry, parseCourseAnswer } from '../src/domain.mjs';
const question = { type:'多选题',stem:'测试题', options:[{key:'A',text:'甲',className:'quiz-option'},{key:'B',text:'乙',className:'quiz-option'},{key:'C',text:'丙',className:'quiz-option'}] };
test('已验证答案在选项乱序后按内容重新映射',()=>{
  const entry={verified:true,texts:['甲','丙']};
  const reordered={...question,options:[{key:'A',text:'丙'},{key:'B',text:'甲'},{key:'C',text:'乙'}]};
  assert.equal(questionId(question),questionId(reordered));
  assert.deepEqual(cachedLetters(reordered,entry),['B','A']);
  assert.equal(cachedLetters(reordered,{...entry,verified:false}),null);
});
test('题干或选项发生实质变化时不复用答案',()=>{
  assert.notEqual(questionId(question),questionId({...question,stem:'不同的题'}));
  assert.notEqual(questionId(question),questionId({...question,options:question.options.slice(0,2)}));
});
test('拒绝空答案、不存在选项、重复选项和单选题多选',()=>{
  for(const a of [[],['D'],['A','A']]) assert.throws(()=>validateAnswer(question,a));
  assert.throws(()=>validateAnswer({...question,type:'单选题'},['A','B']));
  assert.deepEqual(validateAnswer({...question,type:'判断题',options:[{key:'✓',text:'正确'},{key:'✗',text:'错误'}]},['✓']),['✓']);
});
test('空清单与未知掌握度不能判为完成',()=>{
  assert.equal(masterySummary([]).allComplete,false);
  assert.equal(masterySummary([{mastery:100},{mastery:null}]).allComplete,false);
  assert.equal(masterySummary([{mastery:100},{mastery:0}]).allComplete,false);
  assert.equal(masterySummary([{mastery:100}]).allComplete,true);
});
test('只能从判题后显示的正确选项学习，不能从已选择标记学习',()=>{
  const q={...question,answered:true,options:question.options.map(o=>({...o,className:o.key==='B'?'quiz-option quiz-option--correct':'quiz-option quiz-option--selected'}))};
  assert.deepEqual(feedbackEntry(q).texts,['乙']);
  assert.equal(feedbackEntry({...q,answered:false}),null);
});
test('AI解析只接受明确结论，不从逐项讨论猜答案',()=>{
  assert.deepEqual(parseCourseAnswer('A 是正确的。B 是错误的。\n最终答案：A、C',question),['A','C']);
  assert.deepEqual(parseCourseAnswer('{"answers":["B"]}',question),['B']);
  assert.throws(()=>parseCourseAnswer('选项A涉及甲，选项B涉及乙，请你自己思考。',question));
});
test('识别本次真实失败回复的明确总结，不把排除项 D 算入答案',()=>{
  const q={...question,options:['A','B','C','D','E'].map(key=>({key,text:key}))};
  const text='从以上分析可以得出，选项A、B、C和E都是需要重新进行安全风险评价的情况，而选项D不是直接相关的原因。\n请通过以上分析自行判断最终答案。';
  assert.deepEqual(parseCourseAnswer(text,q),['A','B','C','E']);
  assert.deepEqual(parseCourseAnswer('**最终答案：Ａ、Ｂ、Ｃ、Ｅ**',q),['A','B','C','E']);
  assert.throws(()=>parseCourseAnswer('综上所述，选项A、B都是不需要重新评价的情况。',q));
  assert.throws(()=>parseCourseAnswer('A可能正确，B可能不正确，请自己思考。',q));
});
