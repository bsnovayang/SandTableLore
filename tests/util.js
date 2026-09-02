/* 測試共用工具：開一局、擺單位。
   刻意走遊戲自己的 playCard()，而不是自己拼單位物件 ——
   這樣單位欄位一改，測試會跟著改，不會悄悄失準。 */
'use strict';
const L = require('../tools/loadgame');

function newGame(pCiv, eCiv) {
  const api = L.headless();
  api.G = {
    turn: 1, side: 'P', over: false,
    P: api.mkSide(pCiv || 'brit', api.aiDeck(pCiv || 'brit'), false),
    E: api.mkSide(eCiv || 'france', api.aiDeck(eCiv || 'france'), true),
    units: [], sel: null, mode: null, selUnit: null, log: [],
  };
  return api;
}

/* 在指定位置部署一張卡；預設解除召喚失調，方便測當回合行為 */
function deploy(api, cardId, owner, lane, col, opts) {
  const o = opts || {};
  const G = api.G, S = G[owner];
  const front = S.front.slice();
  S.front = [api.COLS, api.COLS, api.COLS];   // 暫時放寬領土限制
  S.hand = [cardId];
  const gold = S.gold; S.gold = 99;
  const okPlay = api.playCard(owner, 0, lane, col);
  S.front = front; S.gold = gold;
  if (!okPlay) throw new Error(`部署失敗：${cardId} @ ${lane},${col}`);
  const u = api.unitAt(lane, col);
  if (!o.keepSick) u.sick = false;
  return u;
}

/* 兩個單位對砍一次，回傳雙方剩餘血量 */
function clash(api, aCard, bCard, opts) {
  const o = opts || {};
  const a = deploy(api, aCard, 'P', o.lane === undefined ? 1 : o.lane, o.aCol === undefined ? 1 : o.aCol);
  const b = deploy(api, bCard, 'E', o.lane === undefined ? 1 : o.lane, o.bCol === undefined ? 2 : o.bCol);
  api.attack(a, b);
  return { a, b, aHp: a.hp, bHp: b.hp };
}

module.exports = { newGame, deploy, clash };
