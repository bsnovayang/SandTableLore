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
        const hasAnim = st.animationName && st.animationName !== 'none';
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
