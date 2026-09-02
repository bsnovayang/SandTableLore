/* =========================================================
   部署載入測試
   ---------------------------------------------------------
   為什麼需要這一支：其他測試都把四個 JS 內嵌成單一 <script> 執行，
   但線上是四個外部 <script defer>。兩者的 document.readyState 不同，
   進而影響 boot() 是「立刻執行」還是「等 DOMContentLoaded」——
   這個差異讓一個會造成整頁空白的 bug 通過了全部測試才被使用者發現。

   這裡用真實的外部載入路徑（file:// + resources:'usable'）重跑一次。
   ========================================================= */
'use strict';
const { suite, test, eq, ok } = require('./harness');
const path = require('path');
const L = require('../tools/loadgame');

if (!L.hasJsdom()) {
  suite('部署載入');
  test('（略過：未安裝 jsdom）', () => {});
} else {
  const { JSDOM } = require('jsdom');

  /* 用 index.html 原本的 <script defer src=...> 載入，不做任何內嵌 */
  function loadReal() {
    const errors = [];
    return JSDOM.fromFile(path.join(L.ROOT, 'index.html'), {
      runScripts: 'dangerously',
      resources: 'usable',
      pretendToBeVisual: true,
      beforeParse(w) {
        w.addEventListener('error', e => errors.push(e.message));
      },
    }).then(dom => new Promise(res => setTimeout(() => {
      dom.virtualConsole.on('jsdomError', e => errors.push(e.message));
      res({
        w: dom.window, d: dom.window.document, errors,
        run: js => dom.window.eval(js),
      });
    }, 350)));
  }

  suite('部署載入');

  test('外部 script 載入後，遊戲狀態有正確初始化', async () => {
    const g = await loadReal();
    eq(g.errors, [], '不該有未捕捉的錯誤');
    eq(g.run('typeof save'), 'object', 'save 必須建立 —— 沒建立表示頂層程式碼被中斷了');
    eq(g.run('save.gems'), 120, '應為初始寶石');
    eq(g.run('typeof CARDS'), 'object');
    eq(g.run('typeof CIVS'), 'object');
  });

  test('四個資料檔都真的被載入（不是靜默 404）', async () => {
    const g = await loadReal();
    eq(g.run('typeof COUNTER_TABLE'), 'object', 'data/rules.js');
    eq(g.run('Object.keys(CARDS).length > 0'), true, 'data/cards.js');
    eq(g.run('Object.keys(CIVS).length'), 4, 'data/civs.js');
    eq(g.run('typeof render'), 'function', 'game.js');
  });

  test('開機自檢有跑完（警告條移除、探針隱藏）', async () => {
    const g = await loadReal();
    eq(g.d.getElementById('boot'), null, '開機警告條應被移除');
    ok(g.d.getElementById('probe').className.includes('hide'),
      '探針未隱藏 → 代表 boot() 中途死掉');
  });

  test('畫面上的數值有被 JS 更新，不是 HTML 的靜態預設值', async () => {
    const g = await loadReal();
    // index.html 裡 gemHud 的預設字樣是「💎 0」，JS 跑起來後應變成實際寶石數
    ok(g.d.getElementById('gemHud').textContent.includes('120'),
      '寶石顯示仍是靜態預設值 → 初始化沒跑完：' + g.d.getElementById('gemHud').textContent);
  });

  test('進得了組牌頁，文明與卡池都有內容', async () => {
    const g = await loadReal();
    g.run("go('deckbuild')");
    ok(g.d.querySelectorAll('#civList .civ').length === 4, '應列出 4 個文明');
    ok(g.d.querySelectorAll('#pool .card').length > 0, '卡池不該是空的');
    eq(g.errors, [], '切換畫面不該產生錯誤');
  });

  test('boot() 失敗時，遊戲本體仍然可以初始化', async () => {
    // 把 validateData 換成會拋錯的版本，模擬診斷功能壞掉
    const g = await loadReal();
    g.run(`
      window.__boomed = false;
      validateData = () => { window.__boomed = true; throw new Error('故意讓開機檢查爆炸'); };
      boot();
    `);
    eq(g.run('__boomed'), true, '確認有走到會爆炸的路徑');
    eq(g.run('typeof save'), 'object', 'save 仍應存在');
    g.run("go('deckbuild')");
    ok(g.d.querySelectorAll('#civList .civ').length === 4, '遊戲仍可正常使用');
    ok(g.d.getElementById('fatal').classList.contains('on'), '應顯示錯誤訊息而不是靜默');
  });

  test('index.html 引用的資源檔案都存在', async () => {
    const fs = require('fs');
    const html = fs.readFileSync(path.join(L.ROOT, 'index.html'), 'utf8');
    const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
      .map(m => m[1].split('?')[0])
      .filter(u => !/^https?:|^#|^data:/.test(u));
    ok(refs.length >= 5, '應有 css 與四個 js');
    refs.forEach(r => {
      ok(fs.existsSync(path.join(L.ROOT, r)), '找不到檔案：' + r);
    });
  });
}
