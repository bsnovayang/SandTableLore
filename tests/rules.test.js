/* 戰鬥規則：相剋、反擊、行動額度、移動、射程、攻城 */
'use strict';
const { suite, test, eq, ok } = require('./harness');
const { newGame, deploy } = require('./util');

suite('資料');

test('validateData 沒有任何問題', () => {
  const api = newGame();
  eq(api.validateData(), []);
});

test('每個文明的起始收藏剛好能組滿牌組', () => {
  const api = newGame();
  const need = api.DECK_SIZE;
  Object.keys(api.CIVS).forEach(cv => {
    const have = api.STARTER_N.length * api.COPY_MAX + api.STARTER_CIV[cv].length * api.COPY_MAX;
    ok(have >= need, `${cv} 起始只有 ${have} 張`);
  });
});

test('每個文明的可用卡種足以做出取捨（收藏上限 > 牌組張數）', () => {
  const api = newGame();
  Object.keys(api.CIVS).forEach(cv => {
    const pool = Object.keys(api.CARDS).filter(id => api.CARDS[id].civ === 'N' || api.CARDS[id].civ === cv);
    ok(pool.length * api.COPY_MAX > api.DECK_SIZE, `${cv} 沒有取捨空間`);
  });
});

suite('兵種相剋');

const TRI = [
  ['archer', 'sword', 2, '🏹遠程 剋 🗡步兵'],
  ['sword', 'scout', 2, '🗡步兵 剋 🐎騎兵'],
  ['scout', 'archer', 2, '🐎騎兵 剋 🏹遠程'],
  ['sword', 'archer', 0, '🗡步兵 打 🏹遠程（不剋）'],
  ['ram', 'barricade', 4, '🔨攻城 剋 🏰建築'],
  ['militia', 'ram', 2, '🗡一般 剋 🔨攻城'],
  ['tower', 'sword', 2, '🏰建築 剋 🗡一般'],
  ['ram', 'sword', 0, '🔨攻城 打 🗡一般（不剋）'],
];
TRI.forEach(([a, b, bonus, label]) => {
  test(label + ' → +' + bonus, () => {
    const api = newGame();
    const ua = deploy(api, a, 'P', 1, 1);
    const ub = deploy(api, b, 'E', 1, 2);
    eq(api.counterBonus(ua, ub), bonus);
  });
});

suite('反擊');

test('近戰互相扣血', () => {
  const api = newGame();
  const a = deploy(api, 'sword', 'P', 1, 1);     // 4/4 步兵
  const b = deploy(api, 'knight', 'E', 1, 2);    // 4/6 防1 騎兵
  api.attack(a, b);
  ok(a.hp < a.max, '攻擊方應受到反擊');
  ok(b.hp < b.max, '被攻擊方應受傷');
});

test('遠程攻擊不受反擊', () => {
  const api = newGame();
  const a = deploy(api, 'archer', 'P', 1, 1);    // 射程 2
  const b = deploy(api, 'sword', 'E', 1, 3);
  api.attack(a, b);
  eq(a.hp, a.max, '遠程攻擊方不該受傷');
  ok(b.hp < b.max);
});

test('機動單位移動後攻擊不受反擊（打帶跑）', () => {
  const api = newGame();
  const a = deploy(api, 'lightcav', 'P', 1, 1);
  const b = deploy(api, 'sword', 'E', 1, 3);
  api.moveUnit(a, 1, 2);
  api.attack(a, b);
  eq(a.hp, a.max, '打帶跑不該受反擊');
});

suite('行動額度');

test('剛部署的單位不能行動（召喚失調）', () => {
  const api = newGame();
  const u = deploy(api, 'sword', 'P', 1, 1, { keepSick: true });
  eq(u.sick, true);
  eq(api.canAct(u), false);
});

test('攻擊後仍可移動，移動後仍可攻擊', () => {
  const api = newGame();
  const a = deploy(api, 'sword', 'P', 1, 1);
  const b = deploy(api, 'militia', 'E', 1, 2);
  api.attack(a, b);
  eq(api.canAttack(a), false, '攻擊已用掉');
  eq(api.canMove(a), true, '移動還在');
});

test('移動後行動額度正確消耗', () => {
  const api = newGame();
  const u = deploy(api, 'scout', 'P', 1, 1);     // 速度 2
  api.moveUnit(u, 1, 3);
  eq(api.canMove(u), false);
  eq(u.col, 3);
});

suite('移動');

test('速度決定可走格數', () => {
  const api = newGame();
  const m = deploy(api, 'militia', 'P', 1, 2);   // 速 1
  eq(api.reachable(m).filter(c => !c.off).length, 1, '速1 只能直行 1 格');
  const api2 = newGame();
  const s = deploy(api2, 'scout', 'P', 1, 2);    // 速 2
  eq(api2.reachable(s).filter(c => !c.off).length, 2, '速2 可直行 2 格');
});

test('換線與後退標記為 off（一般單位要放棄攻擊）', () => {
  const api = newGame();
  const u = deploy(api, 'militia', 'P', 1, 2);
  const off = api.reachable(u).filter(c => c.off);
  ok(off.length >= 3, '應有左右換線與後退共 3 格');
  api.moveUnit(u, off[0].lane, off[0].col);
  eq(api.canAttack(u), false, '一般單位換線/後退後不能攻擊');
});

test('機動單位換線後仍可攻擊', () => {
  const api = newGame();
  const u = deploy(api, 'lightcav', 'P', 1, 2);
  const side = api.reachable(u).find(c => c.lane !== 1);
  api.moveUnit(u, side.lane, side.col);
  eq(api.canAttack(u), true);
});

suite('射程');

test('跨路要多花 1 點射程（每差一路算 2 格）', () => {
  const api = newGame();
  const a = deploy(api, 'archer', 'P', 1, 2);
  const same = deploy(api, 'militia', 'E', 1, 4);   // 同路 2 格 → 距離 2
  const side = deploy(api, 'militia', 'E', 0, 2);   // 鄰路同格 → 距離 2
  const diag = deploy(api, 'militia', 'E', 2, 3);   // 鄰路斜前 → 距離 3
  eq(api.gridDist(a, same), 2);
  eq(api.gridDist(a, side), 2);
  eq(api.gridDist(a, diag), 3);
  const t = api.attackTargets(a);
  ok(t.includes(same) && t.includes(side), '距離 2 的都打得到');
  ok(!t.includes(diag), '距離 3 超出射程 2');
});

test('近戰（射程1）打不到鄰路', () => {
  const api = newGame();
  const m = deploy(api, 'militia', 'P', 1, 2);
  deploy(api, 'militia', 'E', 0, 2);
  eq(api.attackTargets(m).length, 0);
});

suite('城堡與攻城');

test('前方淨空且在射程內可直擊城堡', () => {
  const api = newGame();
  const u = deploy(api, 'sword', 'P', 1, api.COLS - 1);
  eq(api.canHitCastle(u), true);
  const before = api.G.E.hp;
  api.hitCastle(u);
  eq(api.G.E.hp, before - api.CARDS.sword.atk);
});

test('該路前方有敵人時不能攻城', () => {
  const api = newGame();
  const u = deploy(api, 'sword', 'P', 1, api.COLS - 2);
  deploy(api, 'militia', 'E', 1, api.COLS - 1);
  eq(api.canHitCastle(u), false);
});

test('攻城槌：打一般單位很弱，打建築與城堡很痛', () => {
  const api = newGame();
  const r = deploy(api, 'ram', 'P', 1, 1);
  const soldier = deploy(api, 'sword', 'E', 1, 2);
  const hp0 = soldier.hp;
  api.attack(r, soldier);
  eq(hp0 - soldier.hp, api.CARDS.ram.atk, '對一般單位只有基礎攻擊力');

  const api2 = newGame();
  const r2 = deploy(api2, 'ram', 'P', 1, 1);
  const wall = deploy(api2, 'barricade', 'E', 1, 2);
  const wallHp0 = wall.hp;
  api2.attack(r2, wall);
  eq(wallHp0 - wall.hp, api2.CARDS.ram.atk + api2.CARDS.ram.siege - (api2.CARDS.barricade.def || 0));

  const api3 = newGame();
  const r3 = deploy(api3, 'ram', 'P', 1, api3.COLS - 1);
  const before = api3.G.E.hp;
  api3.hitCastle(r3);
  eq(before - api3.G.E.hp, api3.CARDS.ram.atk + api3.CARDS.ram.siege);
});

suite('資源');

test('疲勞遞增，確保對局會結束', () => {
  const api = newGame();
  api.G.P.deck = [];
  const hp0 = api.G.P.hp;
  api.draw('P'); const d1 = hp0 - api.G.P.hp;
  const hp1 = api.G.P.hp;
  api.draw('P'); const d2 = hp1 - api.G.P.hp;
  eq(d1, 1); eq(d2, 2);
});

test('手牌超過上限會燒牌', () => {
  const api = newGame();
  api.G.P.hand = new Array(api.HAND_MAX).fill('militia');
  api.G.P.deck = ['sword'];
  api.draw('P');
  eq(api.G.P.hand.length, api.HAND_MAX);
});
