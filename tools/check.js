/* =========================================================
   一鍵回歸：改完任何東西，跑這支就對了
     node tools/check.js
   依序執行：語法檢查 → 資料驗證 → 規則/法術/介面測試 → 平衡模擬
   任何一關失敗就以非 0 結束（方便之後接 CI 或 git hook）
   ========================================================= */
'use strict';
const { execFileSync } = require('child_process');
const path = require('path');
const L = require('./loadgame');

const ROOT = L.ROOT;
let failed = 0;

function step(title, fn) {
  console.log('\n\x1b[1m▶ ' + title + '\x1b[0m');
  try {
    const bad = fn();
    if (bad) { failed += bad; console.log('  \x1b[31m✗ 未通過\x1b[0m'); }
  } catch (e) {
    failed++;
    console.log('  \x1b[31m✗ ' + (e.message || e) + '\x1b[0m');
  }
}

step('語法檢查（四個檔合併後必須可執行）', () => {
  new Function(L.source());
  console.log('  ✓ ' + L.FILES.join('　'));
  return 0;
});

step('資料驗證（卡牌與文明欄位）', () => {
  const api = L.headless();
  const err = api.validateData();
  if (err.length) { err.forEach(e => console.log('  ✗ ' + e)); return err.length; }
  const cards = Object.keys(api.CARDS).length;
  const civs = Object.keys(api.CIVS).length;
  console.log(`  ✓ ${cards} 張卡、${civs} 個文明，全部欄位齊備`);
  return 0;
});

/* 子行程失敗時 execFileSync 會拋例外並吞掉輸出 —— 必須自己接回來，
   否則測試失敗時只看得到「Command failed」，等於白測。 */
function runNode(script, extraArgs) {
  try {
    return execFileSync(process.execPath, [path.join(ROOT, script)].concat(extraArgs || []),
      { cwd: ROOT, encoding: 'utf8' });
  } catch (e) {
    return (e.stdout || '') + (e.stderr || '');
  }
}

step('測試套件', () => {
  const out = runNode('tests/run.js');
  process.stdout.write(out);
  const m = out.match(/(\d+) 失敗/);
  return m ? Number(m[1]) : (out.includes('通過') ? 0 : 1);
});

step('平衡模擬（每組配對 40 場，快速版）', () => {
  const out = runNode('tools/sim.js', ['40']);
  process.stdout.write(out.split('\n').map(l => '  ' + l).join('\n'));
  return 0;
});

console.log('\n' + '─'.repeat(50));
if (failed) {
  console.log(`\x1b[31m✗ 有 ${failed} 項未通過\x1b[0m`);
  process.exit(1);
} else {
  console.log('\x1b[32m✓ 全部通過\x1b[0m');
}
