/* 端對端：完整打一場，確認沒有任何例外、對局會結束 */
'use strict';
const { suite, test, eq, ok } = require('./harness');
const L = require('../tools/loadgame');
const { playOne } = require('../tools/sim');

suite('端對端');

test('AI 對戰 100 場全部分出勝負且無例外', () => {
  const api = L.headless();
  const civs = Object.keys(api.CIVS);
  let draws = 0, maxTurn = 0;
  for (let i = 0; i < 100; i++) {
    const r = playOne(api, civs[i % civs.length], civs[(i + 1) % civs.length]);
    if (!r) draws++; else maxTurn = Math.max(maxTurn, r.turns);
  }
  eq(draws, 0, '不該有未分勝負的對局');
  ok(maxTurn < 60, '對局長度應收斂，最長 ' + maxTurn + ' 回合');
});

test('每個文明的英雄技能都能被 AI 施放而不出錯', () => {
  const api = L.headless();
  Object.keys(api.CIVS).forEach(cv => {
    api.G = {
      turn: 5, side: 'P', over: false,
      P: api.mkSide(cv, api.aiDeck(cv), true),
      E: api.mkSide('brit', api.aiDeck('brit'), true),
      units: [], sel: null, mode: null, selUnit: null, log: [],
    };
    api.G.P.gold = 99; api.G.P.front = [api.COLS, api.COLS, api.COLS];
    api.G.P.hand = api.aiDeck(cv).slice(0, 5);
    api.aiTurn('P');       // 內含英雄技能判斷
    api.aiResolve('P');
    ok(true, cv);
  });
});
