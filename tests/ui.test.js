/* 介面測試（需要 jsdom）。
   重點放在「jsdom 抓得到、而人眼容易漏掉」的事：
   畫面切換的實際 display、絕對定位元素是否重疊、狀態有沒有反映到畫面。 */
'use strict';
const { suite, test, eq, ok } = require('./harness');
const L = require('../tools/loadgame');

if (!L.hasJsdom()) {
  suite('介面');
  test('（略過：未安裝 jsdom，執行 npm install 後可啟用）', () => {});
  module.exports = {};
} else {
  const { JSDOM } = require('jsdom');

  function boot() {
    const dom = new JSDOM(L.html(), { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/x/' });
    const w = dom.window, d = w.document;
    const api = {
      w, d,
      click: el => el && el.dispatchEvent(new w.MouseEvent('click', { bubbles: true })),
      run: js => w.eval(js),
      visible: id => w.getComputedStyle(d.getElementById(id)).display !== 'none',
      fatal: () => (d.getElementById('fatal').classList.contains('on') ? d.getElementById('fatal').textContent : ''),
      btn: (root, text) => [...d.querySelectorAll(root + ' button')].find(b => b.textContent.includes(text)),
    };
    return new Promise(res => setTimeout(() => res(api), 60));
  }

  suite('介面 · 開機');

  test('開機自檢通過，警告條被移除', async () => {
    const g = await boot();
    eq(g.d.getElementById('boot'), null, '警告條應被移除');
    eq(g.fatal(), '', '不該有錯誤');
  });

  suite('介面 · 畫面切換');

  test('同一時間只有一個畫面實際可見', async () => {
    const g = await boot();
    const ids = ['menu', 'deckbuild', 'shop', 'battle'];
    const shown = () => ids.filter(g.visible);
    eq(shown(), ['menu']);
    g.click(g.d.querySelector('#menu .btns button'));
    eq(shown(), ['deckbuild']);
    g.click(g.btn('#deckbuild .topbar', '自動補齊'));
    g.click(g.d.getElementById('startBtn'));
    eq(shown(), ['battle']);
    g.click(g.d.querySelector('#battle .topbar button'));
    eq(shown(), ['menu']);
  });

  test('盤面是敵上我下的縱向配置', async () => {
    const g = await boot();
    g.run("go('deckbuild'); autoFill(); startBattle();");
    eq([...g.d.querySelectorAll('.side > div')].map(e => e.id || 'board'),
      ['castleE', 'board', 'castleP']);
    eq(g.w.getComputedStyle(g.d.querySelector('.board')).flexDirection, 'row', '三路並排');
    eq(g.w.getComputedStyle(g.d.querySelector('.lane')).flexDirection, 'column-reverse', '第1格在最下');
    eq(g.d.querySelectorAll('#board .lane').length, 3);
    eq(g.d.querySelectorAll('#board .lane:first-child .cell').length, 6);
  });

  suite('介面 · 組牌');

  test('自動補齊 / 清空 / 開始對戰 都有作用', async () => {
    const g = await boot();
    g.run("go('deckbuild')");
    const count = () => g.d.getElementById('deckCount').textContent;
    g.click(g.btn('#deckbuild .topbar', '自動補齊'));
    ok(count().startsWith(String(g.run('DECK_SIZE'))), '補齊後應滿牌：' + count());
    g.click(g.btn('#deckbuild .topbar', '清空'));
    ok(count().startsWith('0'), '清空應歸零：' + count());
    g.click(g.btn('#deckbuild .topbar', '自動補齊'));
    eq(g.d.getElementById('startBtn').disabled, false);
  });

  test('卡面的絕對定位元素沒有互相重疊', async () => {
    const g = await boot();
    g.run("go('deckbuild')");
    const card = g.d.querySelector('#pool .card');
    const seen = {}, clash = [];
    card.querySelectorAll('div').forEach(el => {
      const s = g.w.getComputedStyle(el);
      if (s.position !== 'absolute') return;
      const key = [s.top, s.right, s.bottom, s.left].join('|');
      const cls = el.className || '(無class)';
      if (seen[key]) clash.push(seen[key] + ' ↔ ' + cls); else seen[key] = cls;
    });
    eq(clash, [], '定位完全相同的元素必定重疊');
  });

  suite('介面 · 戰場狀態顯示');

  test('行動額度的四種狀態都有標示', async () => {
    const g = await boot();
    g.run("go('deckbuild'); autoFill(); startBattle();");
    g.run(`G.units=[]; G.selUnit=null; G.P.front=[COLS,COLS,COLS]; G.P.gold=99;
           G.P.hand=['sword']; playCard('P',0,1,1); window.U=G.units[0]; render();`);
    const badge = () => {
      const el = g.d.querySelector('#board .unit .badge');
      return el ? el.textContent : '';
    };
    eq(badge(), '💤', '剛部署應顯示召喚失調');
    g.run('U.sick=false; render();');
    eq(badge(), '', '完整額度不該有標記');
    g.run('U.attacked=true; render();');
    eq(badge(), '移', '只剩移動');
    g.run('U.attacked=false; U.moved=true; render();');
    eq(badge(), '攻', '只剩攻擊');
    g.run('U.attacked=true; render();');
    eq(badge(), '✓', '全部用完');
  });

  test('齊射命令的加成有反映在棋子數值上', async () => {
    const g = await boot();
    g.run("go('deckbuild'); autoFill(); startBattle();");
    g.run(`G.P.civ='brit'; G.P.gold=9; G.P.heroUsed=false; G.units=[]; G.selUnit=null;
           G.P.front=[COLS,COLS,COLS]; G.P.hand=['archer']; playCard('P',0,1,1);
           G.units[0].sick=false; window.A=G.units[0]; render();`);
    const shown = () => g.d.querySelector('#board .unit .a').textContent;
    const base = g.run('A.atk');
    eq(Number(shown()), base);
    g.run('useHero(); render();');
    eq(Number(shown()), base + 1, '施放後數值應提高');
    eq(g.d.querySelectorAll('#board .unit .a.buff').length, 1, '應有高亮');
    ok(g.d.getElementById('buffTxt').style.display !== 'none', '應顯示增益狀態');
    g.run('endOfTurn("P"); render();');
    eq(Number(shown()), base, '回合結束後應復原');
  });

  test('打不到的敵人會說明原因，而不是靜默無反應', async () => {
    const g = await boot();
    g.run("go('deckbuild'); autoFill(); startBattle();");
    g.run(`G.units=[]; G.selUnit=null; G.P.front=[COLS,COLS,COLS]; G.E.front=[COLS,COLS,COLS];
           G.P.gold=99; G.E.gold=99;
           G.P.hand=['archer']; playCard('P',0,1,1); G.units[0].sick=false; window.A=G.units[0];
           G.E.hand=['militia']; playCard('E',0,1,5); window.T=G.units[1];
           clickUnit(A); clickUnit(T);`);
    const hint = g.d.getElementById('hint').textContent;
    ok(/射程/.test(hint), '應說明超出射程，實際：' + hint);
  });

  suite('介面 · 經濟');

  test('卡包會實際增加收藏並扣除寶石', async () => {
    const g = await boot();
    const total = () => g.run('Object.values(save.collection).reduce((a,b)=>a+b,0)');
    const gems = () => g.run('save.gems');
    const t0 = total(), m0 = gems();
    g.run('buyPack()');
    eq(total(), t0 + g.run('PACK_SIZE'));
    eq(gems(), m0 - g.run('PACK_COST'));
  });

  test('寶石不足時不會扣款', async () => {
    const g = await boot();
    g.run('save.gems = 0; buyPack();');
    eq(g.run('save.gems'), 0);
  });
}
