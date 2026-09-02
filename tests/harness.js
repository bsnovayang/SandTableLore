/* =========================================================
   極簡測試框架（無外部相依）
   ---------------------------------------------------------
   之所以自己寫而不用 Jest：這個專案刻意維持「無建置步驟」，
   測試工具也應該同樣輕。整支只有斷言 + 計分。

     suite(名稱)              分組
     test(名稱, fn)           同步測試，fn 可回傳 Promise
     eq(實際, 期望, 說明)      深比較
     ok(值, 說明)             真值斷言
     near(實際, 期望, 容差)    數值容差比較（給有隨機性的項目）
   ========================================================= */
'use strict';

const results = [];
let current = '';
const pending = [];

function suite(name) { current = name; }

function test(name, fn) {
  const full = (current ? current + ' › ' : '') + name;
  pending.push(async () => {
    try {
      await fn();
      results.push({ ok: true, name: full });
    } catch (e) {
      results.push({ ok: false, name: full, err: e && e.message ? e.message : String(e) });
    }
  });
}

function fmt(v) {
  if (typeof v === 'string') return v;
  try { return JSON.stringify(v); } catch (e) { return String(v); }
}

function eq(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label ? label + '：' : ''}期望 ${fmt(expected)}，實際 ${fmt(actual)}`);
  }
}

function ok(v, label) {
  if (!v) throw new Error(label || '預期為真，實際為 ' + fmt(v));
}

function near(actual, expected, tol, label) {
  if (Math.abs(actual - expected) > tol) {
    throw new Error(`${label ? label + '：' : ''}期望 ${expected}±${tol}，實際 ${actual}`);
  }
}

async function runAll() {
  for (const fn of pending) await fn();
  const bad = results.filter(r => !r.ok);
  results.forEach(r => {
    if (r.ok) console.log('  ✓ ' + r.name);
    else console.log('  ✗ ' + r.name + '\n      ' + r.err);
  });
  console.log(`\n  ${results.length - bad.length} 通過 / ${bad.length} 失敗（共 ${results.length}）`);
  return bad.length;
}

module.exports = { suite, test, eq, ok, near, runAll, results };
