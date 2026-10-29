import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { courseWithRetries, queueAnswer, takeConfirmedAnswer } from '../src/solver.mjs';
import { questionId } from '../src/domain.mjs';
import { writeJSON, readJSON } from '../src/storage.mjs';
const q={type:'多选题',stem:'恢复题',options:[{key:'A',text:'甲'},{key:'B',text:'乙'}]};
test('第一次没有结论时自动重试，保存原始失败回复，第二次成功',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'zhs-retry-')); let count=0;
  try {
    const answer=await courseWithRetries(root,null,q,{solverAttempts:3},async()=>({text:++count===1?'请自行判断。':'最终答案：A、B'}));
    assert.deepEqual(answer,['A','B']); assert.equal(count,2);
    assert.equal((await fs.readdir(path.join(root,'data/solver-replies'))).length,2);
  } finally {await fs.rm(root,{recursive:true,force:true});}
});
test('重试有上限且不返回猜测答案',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'zhs-limit-')); let count=0;
  try {
    await assert.rejects(courseWithRetries(root,null,q,{solverAttempts:2},async()=>{count++;return {text:'请自行判断。'}}),/2 次/);
    assert.equal(count,2);
  } finally {await fs.rm(root,{recursive:true,force:true});}
});
test('超时后填写的确认答案可在重启后消费；旧题和错误 token 不能消费',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'zhs-resume-'));
  try {
    const pending={id:questionId(q),token:'old-token'};
    await writeJSON(path.join(root,'data/pending.json'),pending);
    await writeJSON(path.join(root,'data/answer.json'),{...pending,token:'wrong',answers:['A']});
    assert.equal(await takeConfirmedAnswer(root,q),null);
    await writeJSON(path.join(root,'data/answer.json'),{...pending,answers:['A']});
    assert.equal(await takeConfirmedAnswer(root,{...q,stem:'另一题'}),null);
    assert.deepEqual(await takeConfirmedAnswer(root,q),['A']);
    assert.equal(await readJSON(path.join(root,'data/pending.json')),null);
  } finally {await fs.rm(root,{recursive:true,force:true});}
});
test('人工等待超时后保留题目 token，后续确认能够恢复',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'zhs-queue-'));
  try {
    await writeJSON(path.join(root,'data/pending.json'),{id:questionId(q),token:'keep-me'});
    await assert.rejects(queueAnswer(root,q,{answerTimeoutMs:0}),/等待答案超时/);
    const pending=await readJSON(path.join(root,'data/pending.json'));
    assert.equal(pending.token,'keep-me');
    await writeJSON(path.join(root,'data/answer.json'),{id:pending.id,token:pending.token,answers:['B']});
    assert.deepEqual(await takeConfirmedAnswer(root,q),['B']);
  } finally {await fs.rm(root,{recursive:true,force:true});}
});
