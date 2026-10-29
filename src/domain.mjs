import { createHash } from 'node:crypto';
export const normalize = text => String(text).normalize('NFKC').replace(/\s+/g, ' ').trim();
export function questionId(q) {
  return createHash('sha256').update(JSON.stringify([normalize(q.type), normalize(q.stem), q.options.map(o => normalize(o.text)).sort()])).digest('hex').slice(0, 20);
}
export function validateAnswer(q, answer) {
  if (!Array.isArray(answer) || !answer.length) throw new Error('答案必须是非空选项数组');
  const letters = [...new Set(answer.map(s => String(s).trim().toUpperCase()))];
  if (letters.length !== answer.length || letters.some(l => !q.options.some(o => o.key === l))) throw new Error('答案包含重复或不存在的选项');
  if (!q.type.includes('多选') && letters.length !== 1) throw new Error('单选题必须恰好选择一项');
  return letters;
}
export function cachedLetters(q, entry) {
  if (!entry?.verified || !Array.isArray(entry.texts)) return null;
  const letters = entry.texts.map(t => q.options.find(o => normalize(o.text) === normalize(t))?.key);
  if (letters.some(l => !l)) return null;
  try { return validateAnswer(q, letters); } catch { return null; }
}
export function masterySummary(items) {
  return { total: items.length, complete: items.filter(i => i.mastery === 100).length,
    pending: items.filter(i => i.mastery !== null && i.mastery < 100),
    unknown: items.filter(i => i.mastery === null),
    allComplete: items.length > 0 && items.every(i => i.mastery === 100) };
}
export function feedbackEntry(q) {
  if (!q.answered) return null;
  // These classes are the answers revealed by the site after submission.
  const marked = q.options.filter(o => o.className.split(/\s+/).includes('quiz-option--correct'));
  if (!marked.length) return null;
  try { validateAnswer(q, marked.map(o => o.key)); } catch { return null; }
  return { verified: true, source: 'page-feedback', stem: q.stem, texts: marked.map(o => o.text) };
}
export function parseModelAnswer(text, q) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('AI 未返回 JSON 答案');
  const parsed = JSON.parse(match[0]);
  return validateAnswer(q, parsed.answers);
}
export function parseCourseAnswer(text, q) {
  text = String(text).normalize('NFKC').replace(/\*\*|__/g, '');
  try { return parseModelAnswer(text, q); } catch {}
  // Accept an explicit conclusion only, never letters from an option-by-option discussion.
  const conclusions = [...text.matchAll(/(?:最终答案|正确答案|正确选项|答案|应选择|应选)(?:应为|为|是|包括|[:：]|\s)*(?:选项)?\s*([A-H✓✗](?:[、,，和及\s]*[A-H✓✗])*)(?=[。！!；;\n]|$)/g)];
  if (conclusions.length) return validateAnswer(q, conclusions.at(-1)[1].match(/[A-H✓✗]/g));
  // Only accept an explicit affirmative summary, never letters in a discussion.
  const summaries = [...text.matchAll(/(?:从以上分析可以得出|从上述分析可以得出|综上所述|综上|因此|所以)[，,:：\s]*(?:选项)?\s*([A-H](?:[、,，和及\s]*[A-H])*)\s*((?:都是|均是|均为|都属于|均属于|是正确)[^。\n，,；;]*)/g)];
  if (summaries.length) {
    const last = summaries.at(-1);
    if (!/不需要|不正确|错误|不是|并非|不属于/.test(last[2])) return validateAnswer(q, last[1].match(/[A-H]/g));
  }
  if (q.type.includes('判断')) {
    const m = text.match(/(?:最终答案|正确答案|答案|该说法|这一说法|该表述|这一表述)(?:应为|为|是|[:：]|\s)*(正确|错误)(?=[。！!；;\n]|$)/);
    if (m) return validateAnswer(q, [q.options.find(o => o.text === m[1])?.key]);
  }
  throw new Error('课程 AI 没有给出可可靠识别的最终选项，需要人工确认');
}
