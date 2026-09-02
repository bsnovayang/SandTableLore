/* 每個法術都要有一條測試 —— 新增法術時請一起補 */
'use strict';
const { suite, test, eq, ok } = require('./harness');
const { newGame, deploy } = require('./util');

suite('法術');

function cast(api, id, target, side) {
  const s = side || 'P';
  api.G[s].hand = [id];
  api.G[s].gold = 99;
  return api.playCard(s, 0, 0, 0, target);
}

test('徵召令：抽 2 張', () => {
  const api = newGame();
  api.G.P.hand = []; api.G.P.deck = ['militia', 'sword', 'archer'];
  cast(api, 'levy');
  eq(api.G.P.hand.length, 2);
});

test('治療祈禱：回復 3 血且不超過上限', () => {
  const api = newGame();
  const u = deploy(api, 'pike', 'P', 1, 1);
  u.hp = 1;
  cast(api, 'heal', u);
  eq(u.hp, 4);
  u.hp = u.max - 1;
  cast(api, 'heal', u);
  eq(u.hp, u.max, '不該超過上限');
});

test('戰號：本回合攻擊 +2，回合結束後消失', () => {
  const api = newGame();
  const u = deploy(api, 'sword', 'P', 1, 1);
  cast(api, 'warhorn', u);
  eq(api.buffAtk(u), u.atk + 2);
  api.endOfTurn('P');
  eq(api.buffAtk(u), u.atk);
});

test('箭雨：目標與同路相鄰各受 2 傷，其他不受影響', () => {
  const api = newGame();
  const a = deploy(api, 'pike', 'E', 1, 1);
  const b = deploy(api, 'pike', 'E', 1, 2);
  const c = deploy(api, 'pike', 'E', 1, 3);
  const far = deploy(api, 'pike', 'E', 1, 5);
  const side = deploy(api, 'pike', 'E', 0, 2);
  const def = api.CARDS.pike.def || 0;
  const expect = Math.max(1, 2 - def);
  cast(api, 'arrowstorm', b);
  eq(a.max - a.hp, expect, '相鄰');
  eq(b.max - b.hp, expect, '目標');
  eq(c.max - c.hp, expect, '相鄰');
  eq(far.hp, far.max, '同路但不相鄰不受影響');
  eq(side.hp, side.max, '鄰路不受影響');
});

test('火油箭：造成 4 傷害', () => {
  const api = newGame();
  const u = deploy(api, 'pike', 'E', 1, 2);
  const def = api.CARDS.pike.def || 0;
  cast(api, 'fireoil', u);
  eq(u.max - u.hp, Math.max(1, 4 - def));
});

test('破甲箭：目標有防禦力時傷害提高', () => {
  const api = newGame();
  const armored = deploy(api, 'pike', 'E', 1, 2);      // 有防禦力
  cast(api, 'bodkin', armored);
  const dmgArmored = armored.max - armored.hp;

  const api2 = newGame();
  const soft = deploy(api2, 'militia', 'E', 1, 2);     // 無防禦力
  cast(api2, 'bodkin', soft);
  const dmgSoft = soft.max - soft.hp;

  ok(dmgArmored >= dmgSoft, `對有甲目標不該比較弱（有甲 ${dmgArmored} / 無甲 ${dmgSoft}）`);
});

test('蒙古突襲：騎兵恢復完整行動額度', () => {
  const api = newGame('mongol');
  const u = deploy(api, 'lightcav', 'P', 1, 1);
  u.moved = true; u.attacked = true;
  cast(api, 'raid', u);
  eq(api.canMove(u), true);
  eq(api.canAttack(u), true);
});

test('佯退：只恢復移動額度，不恢復攻擊', () => {
  const api = newGame('mongol');
  const u = deploy(api, 'lightcav', 'P', 1, 1);
  u.moved = true; u.attacked = true;
  cast(api, 'feign', u);
  eq(api.canMove(u), true);
  eq(api.canAttack(u), false);
});

test('聖女祝福：回滿血並獲得聖盾', () => {
  const api = newGame('france');
  const u = deploy(api, 'knight', 'P', 1, 1);
  u.hp = 1; u.shield = false;
  cast(api, 'blessing', u);
  eq(u.hp, u.max);
  eq(u.shield, true);
});

test('修繕：只能指定建築', () => {
  const api = newGame('teuton');
  const b = deploy(api, 'tower', 'P', 1, 1);
  const s = deploy(api, 'spearline', 'P', 1, 2);
  b.hp = 1;
  eq(cast(api, 'repair', s), false, '不該能指定非建築');
  cast(api, 'repair', b);
  eq(b.hp, Math.min(b.max, 7));
});

suite('法術目標檢查');

test('所有法術的 target 型別都被 castSpell 認得', () => {
  const api = newGame();
  const spells = Object.keys(api.CARDS).filter(id => api.CARDS[id].type === 'spell');
  ok(spells.length > 0);
  spells.forEach(id => {
    const t = api.CARDS[id].target;
    ok([undefined, 'ally', 'enemy', 'allyCav', 'allyBuilding'].includes(t), `${id} 的 target '${t}' 無效`);
  });
});

test('指定錯陣營的目標會被拒絕', () => {
  const api = newGame();
  const enemy = deploy(api, 'militia', 'E', 1, 2);
  eq(cast(api, 'heal', enemy), false, '治療不該能指定敵人');
  const mine = deploy(api, 'militia', 'P', 1, 1);
  eq(cast(api, 'fireoil', mine), false, '火油箭不該能指定自己人');
});
