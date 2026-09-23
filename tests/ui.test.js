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

  // jsdom 預設 innerWidth 是 1024，會觸發相剋表的窄視窗自動收合。
  // 預設模擬桌機寬度，需要測窄視窗時傳 {width:900}。
  function boot(opts) {
    const o = opts || {};
    const dom = new JSDOM(L.html(), {
      runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/x/',
      beforeParse(window) {
        Object.defineProperty(window, 'innerWidth', { value: o.width || 1400, configurable: true });
      },
    });
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

  /* jsdom 的 cssstyle 不會把 `animation` 簡寫展開成 animationName（永遠回傳 "none"），
     所以要自己從簡寫字串取出動畫名稱，否則會把有動畫的元素誤判成沒有。 */
  function animName(style) {
    if (style.animationName && style.animationName !== 'none') return style.animationName;
    const toks = (style.animation || '').split(/\s+/).filter(Boolean);
    const notName = /^(\d|\.|infinite$|normal$|none$|forwards$|backwards$|both$|linear$|ease|cubic-bezier|steps|alternate|reverse|running|paused)/;
    return toks.find(t => !notName.test(t)) || 'none';
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
    ok(g.d.getElementById('mullBanner').classList.contains('on'), '開局應先跳起手換牌');
    g.click(g.d.getElementById('mullOk'));
    g.click(g.d.querySelector('#battle .topbar button'));
    eq(shown(), ['battle'], '投降要先確認，不該直接離開');
    ok(g.d.getElementById('banner').classList.contains('on'), '應跳出確認對話框');
    g.click(g.d.getElementById('bOk'));
    eq(shown(), ['menu']);
  });

  test('盤面是敵上我下的縱向配置', async () => {
    const g = await boot();
    g.run("go('deckbuild'); autoFill(); startBattle(); finishMulligan();");
    eq([...g.d.querySelectorAll('.side > div')].map(e => e.id || 'board'),
      ['castleE', 'board', 'castleP']);
    eq(g.w.getComputedStyle(g.d.querySelector('.board')).flexDirection, 'row', '三路並排');
    eq(g.w.getComputedStyle(g.d.querySelector('.lane')).flexDirection, 'column-reverse', '第1格在最下');
    eq(g.d.querySelectorAll('#board .lane').length, 3);
    eq(g.d.querySelectorAll('#board .lane:first-child .cell').length, 6);
  });

  test('投降按取消不會離開對戰', async () => {
    const g = await boot();
    g.run("go('deckbuild'); autoFill(); startBattle(); finishMulligan();");
    g.click(g.d.querySelector('#battle .topbar button'));
    g.click(g.d.getElementById('bCancel'));
    eq(g.visible('battle'), true, '按取消應留在戰場');
    eq(g.run('G.over'), false, '對局不該被結束');
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

  test('手牌容器留白足夠，選中的卡片不會被裁掉', async () => {
    const g = await boot();
    g.run("go('deckbuild'); autoFill(); startBattle(); finishMulligan();");
    g.run('G.P.hand=["militia","sword"]; G.sel=0; render();');
    const card = g.d.querySelector('#hand .card.sel');
    ok(card, '應有選中的卡片');
    const lift = Math.abs(parseFloat((g.w.getComputedStyle(card).transform.match(/-?[\d.]+px/) || ['0'])[0]));
    const handStyle = g.w.getComputedStyle(g.d.getElementById('hand'));
    const padTop = parseFloat(handStyle.paddingTop);
    // overflow-x:auto 會讓 overflow-y 變成 auto → 容器會裁切子元素
    ok(handStyle.overflowX !== 'visible', '前提：手牌是可捲動容器');
    ok(padTop >= lift, `上方留白 ${padTop}px 應 ≥ 卡片抬起的 ${lift}px`);
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
    g.run("go('deckbuild'); autoFill(); startBattle(); finishMulligan();");
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
    g.run("go('deckbuild'); autoFill(); startBattle(); finishMulligan();");
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
    g.run("go('deckbuild'); autoFill(); startBattle(); finishMulligan();");
    g.run(`G.units=[]; G.selUnit=null; G.P.front=[COLS,COLS,COLS]; G.E.front=[COLS,COLS,COLS];
           G.P.gold=99; G.E.gold=99;
           G.P.hand=['archer']; playCard('P',0,1,1); G.units[0].sick=false; window.A=G.units[0];
           G.E.hand=['militia']; playCard('E',0,1,5); window.T=G.units[1];
           clickUnit(A); clickUnit(T);`);
    const hint = g.d.getElementById('hint').textContent;
    ok(/射程/.test(hint), '應說明超出射程，實際：' + hint);
  });

  suite('介面 · 起手換牌');

  test('開局會跳出換牌畫面，手牌張數與起手一致', async () => {
    const g = await boot();
    g.run("go('deckbuild'); autoFill(); startBattle();");
    ok(g.d.getElementById('mullBanner').classList.contains('on'));
    eq(g.d.querySelectorAll('#mullCards .card').length, g.run('G.P.hand.length'));
  });

  // 注意：finishMulligan() 之後會接 beginTurn('P')，第一回合本來就會抽一張，
  // 所以下面的斷言都要把那一張算進去。
  test('不換牌：原本的起手牌一張都沒少', async () => {
    const g = await boot();
    g.run("go('deckbuild'); autoFill(); startBattle();");
    const before = g.run('G.P.hand.slice()');
    g.click(g.d.getElementById('mullOk'));
    const after = g.run('G.P.hand.slice()');
    eq(after.slice(0, before.length), before, '原本的牌應原封不動');
    eq(after.length, before.length + 1, '多的那張是第一回合的正常抽牌');
    eq(g.d.getElementById('mullBanner').classList.contains('on'), false, '關閉換牌畫面');
  });

  test('換掉一張：補回同樣張數，換掉的牌回到牌庫', async () => {
    const g = await boot();
    g.run("go('deckbuild'); autoFill(); startBattle();");
    const n0 = g.run('G.P.hand.length'), deck0 = g.run('G.P.deck.length');
    const dropped = g.run('G.P.hand[0]');
    g.click(g.d.querySelectorAll('#mullCards .card')[0]);
    eq(g.d.querySelectorAll('#mullCards .card.mull-drop').length, 1, '應標示為要換掉');
    g.click(g.d.getElementById('mullOk'));
    eq(g.run('G.P.hand.length'), n0 + 1, '換掉一張補一張，再加上回合抽牌');
    eq(g.run('G.P.deck.length'), deck0 - 1, '牌庫淨減一張（回合抽牌）');
    ok(g.run(`G.P.deck.concat(G.P.hand).includes(${JSON.stringify(dropped)})`),
      '換掉的牌應回到牌庫而不是消失');
  });

  // 用可控的牌庫測，避免「補抽又抽到高費」造成偶發失敗
  test('NPC 會把高費起手換掉', async () => {
    const g = await boot();
    g.run("go('deckbuild'); autoFill(); startBattle(); finishMulligan();");
    g.run(`G.E.hand=['elite','elite','royalknight'];      // 全是 5 費以上
           G.E.deck=['militia','militia','militia','militia'];
           const drop=[]; G.E.hand.forEach((id,i)=>{ if(CARDS[id].cost>=5) drop.push(i); });
           mulliganFor('E', drop);`);
    eq(g.run('G.E.hand.length'), 3, '張數不變');
    eq(g.run('G.E.hand.filter(id=>CARDS[id].cost>=5).length'), 0, '高費牌應全被換掉');
    ok(g.run("G.E.deck.filter(id=>id==='elite').length") >= 2, '換掉的牌回到牌庫');
  });

  test('換掉的牌不會馬上又被抽回來', async () => {
    const g = await boot();
    g.run("go('deckbuild'); autoFill(); startBattle(); finishMulligan();");
    // 手牌全部要換，牌庫只有民兵 —— 若順序寫錯就會抽回精銳長弓手
    g.run(`G.P.hand=['elite','elite','elite'];
           G.P.deck=['militia','militia','militia'];
           mulliganFor('P',[0,1,2]);`);
    eq(g.run("G.P.hand.filter(id=>id==='elite').length"), 0, '不該抽回剛換掉的牌');
    eq(g.run("G.P.hand.filter(id=>id==='militia').length"), 3);
  });

  suite('介面 · 復原');

  test('部署後復原：單位消失、金幣與手牌都回來', async () => {
    const g = await boot();
    g.run("go('deckbuild'); autoFill(); startBattle(); finishMulligan();");
    g.run(`G.units=[]; G.selUnit=null; undoStack=[]; G.P.front=[COLS,COLS,COLS];
           G.P.hand=['sword','militia']; G.P.gold=7; render();`);
    const gold0 = g.run('G.P.gold'), hand0 = g.run('G.P.hand.length');
    g.run("G.sel=0; clickCell(1,1);");
    eq(g.run('G.units.length'), 1, '應部署成功');
    g.run('undo()');
    eq(g.run('G.units.length'), 0, '單位應消失');
    eq(g.run('G.P.gold'), gold0, '金幣應回復');
    eq(g.run('G.P.hand.length'), hand0, '手牌應回來');
  });

  test('攻擊後復原：雙方血量與行動額度都還原', async () => {
    const g = await boot();
    g.run("go('deckbuild'); autoFill(); startBattle(); finishMulligan();");
    g.run(`G.units=[]; G.selUnit=null; undoStack=[];
           G.P.front=[COLS,COLS,COLS]; G.E.front=[COLS,COLS,COLS]; G.P.gold=99; G.E.gold=99;
           G.P.hand=['sword']; playCard('P',0,1,1); G.units[0].sick=false;
           G.E.hand=['pike'];  playCard('E',0,1,2); G.units[1].sick=false;
           window.A=G.units[0]; window.B=G.units[1]; clickUnit(A); clickUnit(B);`);
    ok(g.run('A.hp') < g.run('A.max'), '攻擊方應受反擊');
    ok(g.run('B.hp') < g.run('B.max'), '被攻擊方應受傷');
    g.run('undo()');
    const a = g.run('G.units.find(u=>u.owner==="P")'), b = g.run('G.units.find(u=>u.owner==="E")');
    eq(a.hp, a.max, '攻擊方血量應還原');
    eq(b.hp, b.max, '被攻擊方血量應還原');
    eq(a.attacked, false, '攻擊額度應還原');
  });

  test('移動後復原：位置與行動額度都還原', async () => {
    const g = await boot();
    g.run("go('deckbuild'); autoFill(); startBattle(); finishMulligan();");
    g.run(`G.units=[]; G.selUnit=null; undoStack=[]; G.P.front=[COLS,COLS,COLS]; G.P.gold=99;
           G.P.hand=['scout']; playCard('P',0,1,1); G.units[0].sick=false;
           window.U=G.units[0]; clickUnit(U); clickCell(1,3);`);
    eq(g.run('U.col'), 3);
    g.run('undo()');
    const u = g.run('G.units[0]');
    eq(u.col, 1, '位置應還原');
    eq(u.moved, false, '移動額度應還原');
  });

  test('不能跨回合復原', async () => {
    const g = await boot();
    g.run("go('deckbuild'); autoFill(); startBattle(); finishMulligan();");
    g.run(`G.units=[]; undoStack=[]; G.P.front=[COLS,COLS,COLS];
           G.P.hand=['militia']; G.P.gold=9; G.sel=0; clickCell(1,1);`);
    ok(g.run('undoStack.length') > 0, '本回合應可復原');
    g.run("beginTurn('P')");
    eq(g.run('undoStack.length'), 0, '新回合應清空復原堆疊');
  });

  test('復原按鈕在沒有可復原步驟時停用', async () => {
    const g = await boot();
    g.run("go('deckbuild'); autoFill(); startBattle(); finishMulligan();");
    g.run('undoStack=[]; render();');
    eq(g.d.getElementById('undoBtn').disabled, true);
    g.run(`G.units=[]; G.P.front=[COLS,COLS,COLS]; G.P.hand=['militia']; G.P.gold=9;
           G.sel=0; clickCell(1,1); render();`);
    eq(g.d.getElementById('undoBtn').disabled, false);
  });

  suite('介面 · 資訊揭露');

  test('棋子的滑鼠提示包含數值與關鍵字說明', async () => {
    const g = await boot();
    g.run("go('deckbuild'); autoFill(); startBattle(); finishMulligan();");
    g.run(`G.units=[]; G.P.front=[COLS,COLS,COLS]; G.P.gold=99;
           G.P.hand=['crusade']; playCard('P',0,1,1); G.units[0].sick=false; render();`);
    const tip = g.d.querySelector('#board .unit').title;
    ok(/十字軍/.test(tip), '應有名稱：' + tip);
    ok(/攻擊/.test(tip) && /血量/.test(tip), '應有數值');
    ok(/聖盾/.test(tip), '應解釋關鍵字');
    ok(/陣型/.test(tip), '應解釋所有關鍵字');
  });

  test('已行動的狀態也會寫在提示裡', async () => {
    const g = await boot();
    g.run("go('deckbuild'); autoFill(); startBattle(); finishMulligan();");
    g.run(`G.units=[]; G.P.front=[COLS,COLS,COLS]; G.P.gold=99;
           G.P.hand=['sword']; playCard('P',0,1,1); window.U=G.units[0];
           U.sick=false; U.attacked=true; render();`);
    ok(/已攻擊/.test(g.d.querySelector('#board .unit').title));
  });

  test('對手文明特色可以看得到', async () => {
    const g = await boot();
    g.run("go('deckbuild'); autoFill(); startBattle(); finishMulligan();");
    const tip = g.d.getElementById('enemyInfo').title;
    const foe = g.run('CIVS[G.E.civ]');
    ok(tip.includes(foe.sk), '應寫出英雄技能名稱：' + tip);
    ok(tip.length > 20, '應包含文明特色說明');
  });

  test('移動後棋子帶有位移動畫', async () => {
    const g = await boot();
    g.run("go('deckbuild'); autoFill(); startBattle(); finishMulligan();");
    g.run(`G.units=[]; G.selUnit=null; G.P.front=[COLS,COLS,COLS]; G.P.gold=99;
           G.P.hand=['scout']; playCard('P',0,1,1); G.units[0].sick=false;
           window.U=G.units[0]; clickUnit(U); clickCell(1,3);`);
    const el = g.d.querySelector('#board .unit');
    ok(el.classList.contains('slide'), '應加上動畫 class');
    eq(g.run('G.units[0].anim'), null, '播放後應清掉，避免重複觸發');
  });

  suite('介面 · 除錯選單');

  test('F2 開關，預設隱藏', async () => {
    const g = await boot();
    const vis = () => g.visible('debugPanel');
    eq(vis(), false, '預設應隱藏');
    const key = k => g.d.dispatchEvent(new g.w.KeyboardEvent('keydown', { key: k, bubbles: true }));
    key('F2'); eq(vis(), true, 'F2 應開啟');
    key('F2'); eq(vis(), false, '再按應關閉');
  });

  test('寶石可設為 99999 或 0，且有存檔', async () => {
    const g = await boot();
    g.run('dbgGems(99999)');
    eq(g.run('save.gems'), 99999);
    eq(g.d.getElementById('gemHud').textContent.includes('99999'), true, '畫面要跟著更新');
    g.run('dbgGems(0)');
    eq(g.run('save.gems'), 0);
  });

  test('收藏全滿：每張卡都達到同名上限', async () => {
    const g = await boot();
    g.run('dbgCollection("full")');
    const kinds = g.run('Object.keys(CARDS).length');
    eq(g.run('Object.keys(save.collection).length'), kinds, '每張卡都要有');
    eq(g.run(`Object.values(save.collection).every(n=>n===COPY_MAX)`), true);
  });

  test('收藏初始：回到剛好能組滿一副牌的狀態', async () => {
    const g = await boot();
    g.run('dbgCollection("full"); dbgCollection("starter");');
    const total = g.run('Object.values(save.collection).reduce((a,b)=>a+b,0)');
    eq(total, g.run('(STARTER_N.length + STARTER_CIV[save.civ].length * Object.keys(CIVS).length) * COPY_MAX'));
    g.run("go('deckbuild'); autoFill();");
    eq(g.d.getElementById('deckCount').textContent, g.run('DECK_SIZE') + ' / ' + g.run('DECK_SIZE'),
      '初始收藏仍應剛好湊滿');
  });

  test('收藏變少時，已存的牌組會被清成合法狀態', async () => {
    const g = await boot();
    g.run("go('deckbuild'); dbgCollection('full'); autoFill();");
    const full = g.run('deck.slice()');
    ok(full.length === g.run('DECK_SIZE'));
    g.run("dbgCollection('starter'); go('menu'); go('deckbuild');");
    const legal = g.run(`deck.every(id => {
      const c = CARDS[id];
      return c && (c.civ === 'N' || c.civ === save.civ) && (save.collection[id] || 0) > 0;
    })`);
    eq(legal, true, '牌組不該留下已經不擁有的卡');
  });

  test('清空存檔會先確認，取消則不動', async () => {
    const g = await boot();
    g.run('dbgGems(555); dbgResetSave();');
    ok(g.d.getElementById('banner').classList.contains('on'), '應跳確認');
    g.click(g.d.getElementById('bCancel'));
    eq(g.run('save.gems'), 555, '取消不該清掉');
    g.run('dbgResetSave()');
    g.click(g.d.getElementById('bOk'));
    eq(g.run('save.gems'), 120, '確認後回到初始寶石');
    eq(g.visible('menu'), true, '應回到主選單');
  });

  test('對戰用的按鈕在非對戰時停用', async () => {
    const g = await boot();
    g.run('toggleDebug()');
    const disabled = () => [...g.d.querySelectorAll('#debugPanel .dbgBattle')].every(b => b.disabled);
    eq(disabled(), true, '主選單時應停用');
    g.run("go('deckbuild'); autoFill(); startBattle(); finishMulligan(); renderDebug();");
    eq(disabled(), false, '對戰中應可用');
  });

  test('對戰輔助功能實際生效', async () => {
    const g = await boot();
    g.run("go('deckbuild'); autoFill(); startBattle(); finishMulligan();");
    g.run('G.P.hp = 3; dbgCastle("P");');
    eq(g.run('G.P.hp'), g.run('CASTLE_HP'));
    g.run('dbgCastle("E")');
    eq(g.run('G.E.hp'), 1);
    g.run('dbgGold()');
    eq(g.run('G.P.gold'), g.run('GOLD_MAX'));
    const before = g.run('G.P.front.slice()');
    g.run('dbgLand()');
    eq(g.run('G.P.front.slice()'), before.map(n => n + 1));
    g.run('G.P.hand=[]; dbgDraw();');
    eq(g.run('G.P.hand.length'), 3);
  });

  suite('介面 · 相剋表');

  test('內容由 COUNTER_TABLE 推導，不是寫死的', async () => {
    const g = await boot();
    g.run("go('deckbuild'); autoFill(); startBattle(); finishMulligan();");
    const rows = [...g.d.querySelectorAll('#codex .row')].map(r => r.textContent);
    eq(rows.length, 6, '兵種三角 3 條 + 攻城三角 3 條');
    ok(rows.some(t => t.includes('遠程') && t.includes('步兵')), '應有 遠程剋步兵');
    ok(rows.some(t => t.includes('攻城') && t.includes('建築')), '應有 攻城剋建築');
    ok(g.d.querySelector('#codex .head').textContent.includes(String(g.run('COUNTER_BONUS'))),
      '標題應顯示實際的加成值');
  });

  test('改了相剋表，面板會自動跟著變', async () => {
    const g = await boot();
    g.run("go('deckbuild'); autoFill(); startBattle(); finishMulligan();");
    const before = g.d.querySelectorAll('#codex .row').length;
    // 拿掉「攻城剋建築」。注意不能拿 R→S 之類的來測：
    // 一般單位剋攻城在面板上是合併成一列的，少一種來源不會少一列。
    g.run("COUNTER_TABLE.S = []; renderCodex();");
    const rows = [...g.d.querySelectorAll('#codex .row')].map(r => r.textContent);
    eq(rows.length, before - 1, '應少一列');
    ok(!rows.some(t => t.includes('🔨攻城') && t.includes('🏰建築')), '該關係應消失');
  });

  test('選取單位會標出它剋誰、誰剋它', async () => {
    const g = await boot();
    g.run("go('deckbuild'); autoFill(); startBattle(); finishMulligan();");
    g.run(`G.units=[]; G.selUnit=null; G.P.front=[COLS,COLS,COLS]; G.P.gold=99;
           G.P.hand=['archer']; playCard('P',0,1,1); G.units[0].sick=false;
           clickUnit(G.units[0]);`);
    const on = [...g.d.querySelectorAll('#codex .row.on')].map(r => r.textContent);
    const weak = [...g.d.querySelectorAll('#codex .row.weak')].map(r => r.textContent);
    ok(on.some(t => t.startsWith('🏹遠程')), '弓兵應高亮「遠程剋步兵」，實際：' + on.join(' / '));
    ok(weak.some(t => t.includes('🐎騎兵')), '應標出騎兵剋遠程，實際：' + weak.join(' / '));
  });

  test('沒選單位時不做任何高亮', async () => {
    const g = await boot();
    g.run("go('deckbuild'); autoFill(); startBattle(); finishMulligan();");
    g.run('G.selUnit=null; render();');
    eq(g.d.querySelectorAll('#codex .row.on, #codex .row.weak').length, 0);
  });

  test('可以收合成小標籤', async () => {
    const g = await boot();
    g.run("go('deckbuild'); autoFill(); startBattle(); finishMulligan();");
    ok(g.d.querySelectorAll('#codex .row').length > 0, '預設展開');
    g.run('toggleCodex()');
    eq(g.d.querySelectorAll('#codex .row').length, 0, '收合後不顯示內容');
    ok(g.d.getElementById('codex').className.includes('mini'));
    g.run('toggleCodex()');
    ok(g.d.querySelectorAll('#codex .row').length > 0, '可再展開');
  });

  test('視窗太窄時自動收合，避免蓋住盤面', async () => {
    const wide = await boot({ width: 1400 });
    wide.run("go('deckbuild'); autoFill(); startBattle(); finishMulligan();");
    ok(wide.d.querySelectorAll('#codex .row').length > 0, '寬視窗應展開');

    const narrow = await boot({ width: 900 });
    narrow.run("go('deckbuild'); autoFill(); startBattle(); finishMulligan();");
    eq(narrow.d.querySelectorAll('#codex .row').length, 0, '窄視窗應收合');
    ok(narrow.d.getElementById('codex').className.includes('mini'));
  });

  test('相剋表不會蓋住盤面（盤面維持置中）', async () => {
    const g = await boot();
    g.run("go('deckbuild'); autoFill(); startBattle(); finishMulligan();");
    const cx = g.w.getComputedStyle(g.d.getElementById('codex'));
    eq(cx.position, 'absolute', '用絕對定位才不會把盤面推偏');
    eq(g.w.getComputedStyle(g.d.querySelector('.field')).position, 'relative', '需要定位基準');
  });

  suite('介面 · 攻擊特效');

  /* jsdom 不做版面計算，getBoundingClientRect 一律回傳 0。
     這裡改寫「原型」而不是個別元素 —— render() 每次都會重建盤面，
     patch 個別元素的話重建後就失效了（正是這個專案踩過好幾次的坑）。 */
  function fakeLayout(g) {
    g.run(`
      Element.prototype.getBoundingClientRect = function () {
        const lane = this.parentElement;
        if (lane && lane.classList.contains('lane')) {
          const l = [...board.children].indexOf(lane);
          const c = [...lane.children].indexOf(this) - 1;   // 第 0 個是路線標籤
          if (l >= 0 && c >= 0) {
            return { left: 100 + l * 90, top: 500 - c * 72, width: 84, height: 66,
                     right: 184 + l * 90, bottom: 566 - c * 72 };
          }
        }
        return { left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0 };
      };
    `);
  }

  async function battle() {
    const g = await boot();
    g.run("go('deckbuild'); autoFill(); startBattle(); finishMulligan();");
    g.run(`G.units=[]; G.selUnit=null; G.P.front=[COLS,COLS,COLS]; G.E.front=[COLS,COLS,COLS];
           G.P.gold=99; G.E.gold=99; render();`);
    return g;
  }

  test('遠程攻擊會射出箭矢，且角度朝向目標', async () => {
    const g = await battle();
    g.run(`G.P.hand=['archer']; playCard('P',0,1,1); G.units[0].sick=false;
           G.E.hand=['militia']; playCard('E',0,1,3);
           render();`);
    fakeLayout(g);
    g.run('attack(G.units[0], G.units[1]); render();');
    const arrow = g.d.querySelector('#fx .fx-arrow');
    ok(arrow, '應產生箭矢');
    // 射手在 col1、目標在 col3，同一路 → 應該往上飛（dy 為負），水平不位移
    eq(arrow.style.getPropertyValue('--dx'), '0px');
    ok(parseFloat(arrow.style.getPropertyValue('--dy')) < 0, '應朝上飛');
  });

  test('近戰攻擊播放刀光，不是箭矢', async () => {
    const g = await battle();
    g.run(`G.P.hand=['sword']; playCard('P',0,1,1); G.units[0].sick=false;
           G.E.hand=['pike']; playCard('E',0,1,2);
           render();`);
    fakeLayout(g);
    g.run('attack(G.units[0], G.units[1]); render();');
    const slash = g.d.querySelector('#fx .fx-slash');
    ok(slash, '應有刀光');
    eq(g.d.querySelectorAll('#fx .fx-arrow').length, 0, '近戰不該有箭矢');
    const blade = slash.querySelector('.fx-blade');
    ok(blade, '刀身應是獨立子元素（才能從一個點延伸成線）');
    const st = g.w.getComputedStyle(blade);
    ok(/scaleX\(0\)/.test(st.transform), '起始應為長度 0 的一個點，實際：' + st.transform);
    eq(parseFloat(st.transformOrigin), 0, '延伸的支點要固定在起點');
  });

  test('受傷會跳出傷害數字', async () => {
    const g = await battle();
    g.run(`G.P.hand=['archer']; playCard('P',0,1,1); G.units[0].sick=false;
           G.E.hand=['pike']; playCard('E',0,1,3);
           render();`);
    fakeLayout(g);
    const before = g.run('G.units[1].hp');
    g.run('attack(G.units[0], G.units[1]); render();');
    const dmg = g.d.querySelector('#fx .fx-dmg');
    ok(dmg, '應跳出傷害數字');
    const shown = Math.abs(parseInt(dmg.textContent, 10));
    eq(shown, before - g.run('G.units[1].hp'), '數字要與實際扣血一致');
  });

  test('陣亡會留下淡出的殘影，且晚於傷害數字', async () => {
    const g = await battle();
    g.run(`G.P.hand=['sword']; playCard('P',0,1,1); G.units[0].sick=false;
           G.E.hand=['militia']; playCard('E',0,1,2);
           render();`);
    fakeLayout(g);
    g.run('attack(G.units[0], G.units[1]); cleanup(); render();');
    const die = g.d.querySelector('#fx .fx-die');
    const dmg = g.d.querySelector('#fx .fx-dmg');
    ok(die, '陣亡應有殘影');
    ok(parseFloat(die.style.animationDelay) > parseFloat(dmg.style.animationDelay),
      '殘影要晚於傷害數字出現');
  });

  test('聖盾擋下時顯示盾牌而不是數字', async () => {
    const g = await battle();
    g.run(`G.P.hand=['sword']; playCard('P',0,1,1); G.units[0].sick=false;
           G.E.hand=['templar']; playCard('E',0,1,2); G.units[1].shield=true;
           render();`);
    fakeLayout(g);
    g.run('attack(G.units[0], G.units[1]); render();');
    const texts = [...g.d.querySelectorAll('#fx .fx-dmg')].map(e => e.textContent);
    ok(texts.includes('🛡'), '應顯示聖盾，實際：' + texts.join(','));
  });

  test('攻擊城堡也有特效與傷害數字', async () => {
    const g = await battle();
    g.run(`G.P.hand=['sword']; playCard('P',0,1,COLS-1); G.units[0].sick=false; render();`);
    fakeLayout(g);
    const before = g.run('G.E.hp');
    g.run('hitCastle(G.units[0]); render();');
    const dmg = [...g.d.querySelectorAll('#fx .fx-dmg')].map(e => e.textContent);
    ok(g.d.querySelector('#fx .fx-slash'), '應有攻擊動作');
    eq(dmg, ['-' + (before - g.run('G.E.hp'))], '傷害數字要與城堡實際扣血一致');
  });

  /* 先前的測試只檢查「元素存在、transform 正確」，卻沒檢查它看不看得見 ——
     結果 `#fx > *{opacity:0}`（特異性 1-0-0）蓋掉了刀光容器的 opacity，
     容器本身沒有動畫可以覆蓋，就全程透明。這條守住可見度。 */
  test('每個特效元素都真的看得見（不會被祖先的 opacity 蓋掉）', async () => {
    const g = await battle();
    g.run(`G.P.hand=['sword'];  playCard('P',0,1,1); G.units[0].sick=false;
           G.E.hand=['militia'];playCard('E',0,1,2);
           G.P.hand=['archer']; playCard('P',0,0,1); G.units[2].sick=false;
           G.E.hand=['pike'];   playCard('E',0,0,3);
           render();`);
    fakeLayout(g);
    g.run(`attack(G.units[0],G.units[1]); attack(G.units[2],G.units[3]); cleanup(); render();`);
    const seen = [];
    ['.fx-slash', '.fx-blade', '.fx-arrow', '.fx-dmg', '.fx-die'].forEach(sel => {
      const el = g.d.querySelector('#fx ' + sel);
      ok(el, '應產生 ' + sel);
      seen.push(sel);
      // 逐層往上檢查 opacity：只要有一層是 0，畫面上就什麼都看不到
      for (let n = el; n && n.id !== 'fx'; n = n.parentElement) {
        const st = g.w.getComputedStyle(n);
        const hasAnim = animName(st) !== 'none';
        ok(!(parseFloat(st.opacity) === 0 && !hasAnim),
          `${sel} 的祖先 .${n.className || n.tagName} opacity 為 0 且沒有動畫可覆蓋 → 永遠看不見`);
      }
    });
    eq(seen.length, 5);
  });

  test('特效層不會攔截點擊', async () => {
    const g = await boot();
    eq(g.w.getComputedStyle(g.d.getElementById('fx')).pointerEvents, 'none');
  });

  test('無介面環境不會因為特效而出錯', async () => {
    // headless（模擬器）沒有真的版面，playFx 必須安靜略過
    const api = require('../tools/loadgame').headless();
    api.G = {
      turn: 1, side: 'P', over: false,
      P: api.mkSide('brit', api.aiDeck('brit'), true),
      E: api.mkSide('france', api.aiDeck('france'), true),
      units: [], sel: null, mode: null, selUnit: null, log: [],
    };
    api.render();
    ok(true, 'render 不該拋例外');
  });

  suite('介面 · 卡包經濟');

  test('抽卡權重與稀有度一致（大樣本）', async () => {
    const g = await boot();
    g.run('window.__roll = () => { const c = {C:0,R:0,H:0}; for (let i=0;i<6000;i++) c[CARDS[rollCard()].rarity]++; return c; };');
    const c = g.run('__roll()');
    const total = c.C + c.R + c.H;
    // 權重是「每張卡」的，稀有卡張數少，所以實際比例不會等於權重，
    // 但順序必須成立：普通 > 精良 > 英雄，且英雄要夠稀有
    ok(c.C > c.R && c.R > c.H, `比例順序不對：${JSON.stringify(c)}`);
    ok(c.H / total < 0.06, '英雄級不該超過 6%，實際 ' + (c.H / total * 100).toFixed(1) + '%');
  });

  test('保底：每包至少一張精良以上', async () => {
    const g = await boot();
    g.run('dbgCollection("starter"); save.gems = 999999;');
    for (let i = 0; i < 40; i++) {
      const pack = g.run('openPack()');
      const best = Math.max(...pack.map(c => g.run(`RARITY_ORDER.indexOf(CARDS[${JSON.stringify(c.id)}].rarity)`)));
      ok(best >= g.run('RARITY_ORDER.indexOf(PACK_PITY)'),
        `第 ${i + 1} 包沒有精良以上：` + pack.map(c => c.id).join(','));
    }
  });

  test('重複卡轉成寶石，收藏不會超過同名上限', async () => {
    const g = await boot();
    g.run('dbgCollection("full"); save.gems = 0;');   // 全滿 → 抽到的一定都是重複
    const pack = g.run('openPack()');
    eq(pack.every(c => c.dup), true, '全滿時應全部是重複');
    const gained = pack.reduce((s, c) => s + c.dust, 0);
    eq(g.run('save.gems'), gained, '重複應轉成寶石');
    eq(g.run('Object.values(save.collection).every(n => n <= COPY_MAX)'), true, '不該超過上限');
  });

  test('買卡包會扣寶石，寶石不足時不扣款', async () => {
    const g = await boot();
    g.run("go('shop'); save.gems = PACK_COST; buyPack();");
    eq(g.run('save.gems >= 0'), true);
    const before = g.run('save.gems');
    g.run('closePack(); save.gems = 0; buyPack();');
    eq(g.run('save.gems'), 0, '寶石不足不該扣款');
    ok(g.d.getElementById('banner').classList.contains('on'), '應提示寶石不足');
  });

  suite('介面 · 開包儀式');

  async function shop() {
    const g = await boot();
    g.run("go('shop'); save.fastPack = false; save.gems = 99999;");
    return g;
  }

  test('買包後進入封印階段', async () => {
    const g = await shop();
    g.run('buyPack()');
    ok(g.d.getElementById('packBanner').classList.contains('on'), '應開啟開包畫面');
    ok(g.d.getElementById('packStage').className.includes('phase-seal'), '應停在封印階段');
    eq(g.d.querySelectorAll('#packCards .flipCard').length, 0, '此時還不該發牌');
  });

  test('打破封印後進入翻牌，牌數等於 PACK_SIZE', async () => {
    const g = await shop();
    g.run('buyPack(); packBreak(); packDeal();');
    ok(g.d.getElementById('packStage').className.includes('phase-cards'));
    eq(g.d.querySelectorAll('#packCards .flipCard').length, g.run('PACK_SIZE'));
    eq(g.d.querySelectorAll('#packCards .flipCard.flipped').length, 0, '預設都是背面');
  });

  test('逐張翻面，全部翻完才出現結果', async () => {
    const g = await shop();
    g.run('buyPack(); packBreak(); packDeal();');
    const n = g.run('PACK_SIZE');
    for (let i = 0; i < n; i++) {
      eq(g.d.querySelector('#packFoot .packSum'), null, '還沒翻完不該有結果');
      g.click(g.d.querySelectorAll('#packCards .flipCard')[i]);
      eq(g.d.querySelectorAll('#packCards .flipCard.flipped').length, i + 1);
    }
    ok(g.d.querySelector('#packFoot .packSum'), '翻完應顯示結果');
  });

  test('英雄級會加上光效', async () => {
    const g = await shop();
    g.run(`buyPack();
           const h = Object.keys(CARDS).find(id => CARDS[id].rarity === 'H');
           packState.cards = [{id:h, dup:false, dust:0}];
           packDeal(); packFlip(0, packCards.children[0]);`);
    ok(g.d.querySelector('#packCards .flipCard.shine'), '英雄級應有光效');
  });

  test('跳過會直接翻開全部並顯示結果', async () => {
    const g = await shop();
    g.run('buyPack(); packSkip();');
    eq(g.d.querySelectorAll('#packCards .flipCard.flipped').length, g.run('PACK_SIZE'));
    ok(g.d.querySelector('#packFoot .packSum'));
  });

  test('勾選「以後直接看結果」會被記住，下次直接跳到結果', async () => {
    const g = await shop();
    g.run('buyPack(); packSkip();');
    g.d.getElementById('packFast').checked = true;
    g.d.getElementById('packFast').dispatchEvent(new g.w.Event('change'));
    eq(g.run('save.fastPack'), true, '偏好應存檔');
    g.run('closePack(); buyPack();');
    eq(g.d.querySelectorAll('#packCards .flipCard.flipped').length, g.run('PACK_SIZE'),
      '下次應直接是翻開狀態');
  });

  test('卡背依稀有度發光，讓懸念在翻開前就開始', async () => {
    const g = await shop();
    g.run(`buyPack();
           packState.cards = [
             {id:Object.keys(CARDS).find(i=>CARDS[i].rarity==='C'), dup:false, dust:0},
             {id:Object.keys(CARDS).find(i=>CARDS[i].rarity==='R'), dup:false, dust:0},
             {id:Object.keys(CARDS).find(i=>CARDS[i].rarity==='H'), dup:false, dust:0}];
           packDeal();`);
    const backs = [...g.d.querySelectorAll('#packCards .flipBack')];
    eq(backs.map(b => b.className.split(' ').pop()), ['back-C', 'back-R', 'back-H']);
    // 普通不發光、精良與英雄要有脈動動畫
    const anim = i => animName(g.w.getComputedStyle(backs[i]));
    eq(anim(0), 'none', '普通卡背不該發光');
    ok(anim(1) !== 'none', '精良卡背應發光');
    ok(anim(2) !== 'none', '英雄卡背應發光');
    ok(anim(1) !== anim(2), '精良與英雄的光效要分得出來');
  });

  test('每包都至少有一張會發光的卡背（保底保證）', async () => {
    const g = await shop();
    for (let i = 0; i < 20; i++) {
      g.run('save.collection = {}; closePack(); buyPack(); packDeal();');
      const glowing = [...g.d.querySelectorAll('#packCards .flipBack')]
        .filter(b => /back-(R|H)/.test(b.className)).length;
      ok(glowing >= 1, `第 ${i + 1} 包沒有任何發光卡背`);
    }
  });

  test('最好的一張留到最後翻', async () => {
    const g = await shop();
    for (let i = 0; i < 15; i++) {
      g.run('save.collection = {}; closePack(); buyPack();');
      const order = g.run('packState.cards.map(c => RARITY_ORDER.indexOf(CARDS[c.id].rarity))');
      const sorted = order.slice().sort((a, b) => a - b);
      eq(order, sorted, '稀有度應由低到高排列，最好的在最後');
    }
  });

  test('翻面後有落定過衝，跳過時不播', async () => {
    const g = await shop();
    g.run('buyPack(); packBreak(); packDeal();');
    const front = () => g.d.querySelector('#packCards .flipFront');
    eq(animName(g.w.getComputedStyle(front())), 'none', '未翻面時不該有');
    g.click(g.d.querySelector('#packCards .flipCard'));
    eq(animName(g.w.getComputedStyle(front())), 'settle', '翻面後應彈一下');

    g.run('closePack(); buyPack(); packSkip();');
    eq(animName(g.w.getComputedStyle(g.d.querySelector('#packCards .flipFront'))), 'none',
      '跳過時不該連續彈跳');
  });

  suite('介面 · 開包華麗特效');

  test('破封印會有白閃、光爆與火花', async () => {
    const g = await shop();
    g.run('buyPack(); packBreak();');
    ok(g.d.getElementById('packBanner').classList.contains('flash'), '應有全畫面白閃');
    ok(g.d.querySelector('#packFx .burst'), '應有光爆圈');
    ok(g.d.querySelectorAll('#packFx .spark').length >= 20, '火花數量應足以讀成爆裂');
  });

  test('火花的角度與距離是隨機的，不是同一條線', async () => {
    const g = await shop();
    g.run('buyPack(); packBreak();');
    const angles = [...g.d.querySelectorAll('#packFx .spark')]
      .map(e => e.style.getPropertyValue('--a'));
    ok(new Set(angles).size > 10, '角度應分散，實際只有 ' + new Set(angles).size + ' 種');
    const dists = [...g.d.querySelectorAll('#packFx .spark')]
      .map(e => parseFloat(e.style.getPropertyValue('--d')));
    ok(Math.max(...dists) - Math.min(...dists) > 40, '距離應有差異');
  });

  test('特效元素都真的看得見，且不擋點擊', async () => {
    const g = await shop();
    g.run('buyPack(); packBreak();');
    eq(g.w.getComputedStyle(g.d.getElementById('packFx')).pointerEvents, 'none',
      '特效層不該攔截點擊');
    ['.burst', '.spark'].forEach(sel => {
      const el = g.d.querySelector('#packFx ' + sel);
      ok(el, '應有 ' + sel);
      for (let n = el; n && n.id !== 'packFx'; n = n.parentElement) {
        const st = g.w.getComputedStyle(n);
        ok(!(parseFloat(st.opacity) === 0 && animName(st) === 'none'),
          sel + ' 的祖先透明且無動畫 → 永遠看不見');
      }
    });
  });

  test('翻到英雄級會觸發全畫面演出', async () => {
    const g = await shop();
    g.run(`buyPack();
           const h = Object.keys(CARDS).find(id => CARDS[id].rarity === 'H');
           packState.cards = [{id:h, dup:false, dust:0}];
           packDeal(); packFlip(0, packCards.children[0]);`);
    ok(g.d.getElementById('packStage').className.includes('legendary'), '應進入英雄演出');
    ok(g.d.querySelector('#packCards .flipCard.hero'), '該卡應被標為主角');
    ok(g.d.querySelector('#packFx .godray'), '應有旋轉光柱');
    ok(g.d.querySelectorAll('#packFx .spark.gold').length >= 20, '應有金色火花');
    // 主角放大、其他卡退場
    ok(/scale\(1\.55\)/.test(g.w.getComputedStyle(g.d.querySelector('.flipCard.hero')).transform),
      '主角應放大');
  });

  test('普通與精良不會觸發英雄演出', async () => {
    const g = await shop();
    g.run(`buyPack();
           const c = Object.keys(CARDS).find(id => CARDS[id].rarity === 'C');
           packState.cards = [{id:c, dup:false, dust:0}];
           packDeal(); packFlip(0, packCards.children[0]);`);
    ok(!g.d.getElementById('packStage').className.includes('legendary'));
    eq(g.d.querySelector('#packFx .godray'), null);
  });

  // 先破封印讓特效層真的有東西，否則這條測試不管程式碼在不在都會過
  test('破封印後再跳過，特效會被清乾淨', async () => {
    const g = await shop();
    g.run('buyPack(); packBreak();');
    ok(g.d.querySelectorAll('#packFx *').length > 0, '前提：破封印後特效層有東西');
    g.run(`const h = Object.keys(CARDS).find(id => CARDS[id].rarity === 'H');
           packState.cards = [{id:h, dup:false, dust:0}];
           packSkip();`);
    eq(g.d.querySelectorAll('#packFx *').length, 0, '跳過應清掉殘留的特效');
    ok(!g.d.getElementById('packStage').className.includes('legendary'),
      '跳過不該觸發英雄演出');
  });

  test('卡片從中心弧線飛出（起始偏移左右對稱）', async () => {
    const g = await shop();
    g.run('buyPack(); packDeal();');
    const fx = [...g.d.querySelectorAll('#packCards .flipCard')]
      .map(e => parseFloat(e.style.getPropertyValue('--fx')));
    eq(fx.length, g.run('PACK_SIZE'));
    ok(fx[0] > 0 && fx[fx.length - 1] < 0, '兩端應往相反方向飛出：' + fx.join(','));
    eq(fx[Math.floor(fx.length / 2)], 0, '中間那張不偏移');
  });

  test('滑鼠傾斜只綁一次，不會重複累積監聽器', async () => {
    const g = await shop();
    g.run('buyPack(); packDeal(); packDeal(); packDeal();');
    eq(g.d.getElementById('packCards').dataset.tilt, '1');
  });

  test('特效的 keyframes 不動用會觸發重排的屬性', async () => {
    const css = require('fs').readFileSync(require('path').join(L.ROOT, 'style.css'), 'utf8');
    const block = css.slice(css.indexOf('開包的華麗特效'));
    // 手動掃出每組 @keyframes 的內容（正則處理不了巢狀大括號）
    const frames = [];
    let idx = 0;
    while ((idx = block.indexOf('@keyframes', idx)) !== -1) {
      const open = block.indexOf('{', idx);
      let depth = 0, end = open;
      for (let i = open; i < block.length; i++) {
        if (block[i] === '{') depth++;
        else if (block[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
      }
      frames.push(block.slice(open + 1, end));
      idx = end + 1;
    }
    ok(frames.length >= 6, '應有多組 keyframes，實際 ' + frames.length);
    // 動這些屬性會觸發重排，粒子一多就會掉幀
    const banned = ['left:', 'top:', 'right:', 'bottom:', 'width:', 'height:', 'margin:', 'padding:'];
    frames.forEach((f, i) => {
      const hit = banned.find(b => f.includes(b));
      ok(!hit, '第 ' + (i + 1) + ' 組 keyframes 動到了 ' + hit + '（會觸發重排）');
    });
  });

  test('商店會顯示各稀有度機率與重複轉換規則', async () => {
    const g = await boot();
    g.run("go('shop')");
    const t = g.d.getElementById('packResult').textContent;
    g.run('RARITY_ORDER').forEach(r => {
      ok(t.includes(g.run(`RARITY[${JSON.stringify(r)}].n`)), '應列出 ' + r);
    });
    ok(/保底|至少/.test(t), '應說明保底');
    ok(/寶石/.test(t), '應說明重複轉換');
  });
}
