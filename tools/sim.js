/* =========================================================
   AI 對戰平衡模擬器
   ---------------------------------------------------------
   用法：
     node tools/sim.js              每組配對 80 場（共 1280 場）
     node tools/sim.js 200          每組配對 200 場
     node tools/sim.js 80 --trace   額外統計相剋觸發率
     node tools/sim.js 80 --decks   印出各文明的 AI 牌組

   為什麼需要它：這個遊戲的規則彼此高度耦合（相剋、反擊、射程、
   建築、疲勞），任何一條規則改動都可能整體位移。靠感覺調數值
   會在錯誤的方向上越走越遠 —— 這支程式提供的是「改動前後的對照」。

   注意：AI 用固定牌組、不會針對對手換牌，所以量到的文明勝率差距
   會**高估**真人對戰的失衡程度。它適合看「改動造成多少位移」，
   不適合當成絕對強度的裁決。
   ========================================================= */
'use strict';
const L = require('./loadgame');

const args = process.argv.slice(2);
const GAMES = Number(args.find(a => /^\d+$/.test(a))) || 80;
const TRACE = args.includes('--trace');
const DECKS = args.includes('--decks');

function instrument(src) {
  // 在 counterBonus 外面包一層計數，量測相剋實際觸發頻率
  const marker = 'function counterBonus(u,t){';
  if (!src.includes(marker)) throw new Error('找不到 counterBonus，插樁失敗');
  return src.replace(marker,
    'function counterBonus(u,t){ if(t) STAT.calls++; const _b=_counterRaw(u,t);' +
    ' if(_b>0){ if(u.kind==="S"||u.kind==="B"||t.kind==="S"||t.kind==="B") STAT.siege++; else STAT.tri++; }' +
    ' return _b; }\nfunction _counterRaw(u,t){');
}

function makeApi() {
  const STAT = { calls: 0, tri: 0, siege: 0 };
  if (!TRACE) return { api: L.headless(), STAT };
  // 走 headless 的同一套環境，但換成插樁過的原始碼
  const orig = L.source;
  L.source = () => instrument(orig());
  const api = L.headless({ STAT });
  L.source = orig;
  return { api, STAT };
}

function playOne(api, a, b) {
  api.G = {
    turn: 1, side: 'P', over: false,
    P: api.mkSide(a, api.aiDeck(a), true),
    E: api.mkSide(b, api.aiDeck(b), true),
    units: [], sel: null, mode: null, selUnit: null, log: [],
  };
  for (let i = 0; i < 3; i++) api.draw('P');
  for (let i = 0; i < 4; i++) api.draw('E');
  api.G.E.coin = 2;                       // 後手補償
  let side = 'P', guard = 0;
  while (!api.G.over && guard++ < 300) {
    api.G.side = side;
    api.aiTurn(side);
    api.aiResolve(side);
    if (api.G.over) break;
    api.endOfTurn(side);
    if (api.G.over) break;
    side = api.other(side);
    api.beginTurn(side);
  }
  if (!api.G.over) return null;           // 未分勝負
  return { firstWon: api.G.E.hp <= 0 && api.G.P.hp > 0, turns: api.G.turn };
}

function main() {
  const { api, STAT } = makeApi();
  const civs = Object.keys(api.CIVS);

  if (DECKS) {
    console.log('各文明的 AI 牌組：\n');
    civs.forEach(c => {
      const d = api.aiDeck(c);
      const own = d.filter(id => api.CARDS[id].civ !== 'N').length;
      const names = {};
      d.forEach(id => { names[api.CARDS[id].n] = (names[api.CARDS[id].n] || 0) + 1; });
      console.log(`  ${api.CIVS[c].n}  專屬卡 ${own}/${d.length}`);
      console.log('    ' + Object.entries(names).map(([k, v]) => k + '×' + v).join('  ') + '\n');
    });
    return 0;
  }

  const stat = {}; civs.forEach(c => (stat[c] = { w: 0, l: 0 }));
  const lens = []; let draws = 0, firstWins = 0, total = 0;

  for (const a of civs) for (const b of civs) for (let k = 0; k < GAMES; k++) {
    total++;
    const r = playOne(api, a, b);
    if (!r) { draws++; continue; }
    lens.push(r.turns);
    if (r.firstWon) { stat[a].w++; stat[b].l++; firstWins++; }
    else { stat[b].w++; stat[a].l++; }
  }

  const decided = total - draws;
  const rates = civs.map(c => (stat[c].w / (stat[c].w + stat[c].l)) * 100);
  const avg = lens.reduce((x, y) => x + y, 0) / lens.length;

  console.log(`總場次 ${total}　未分勝負 ${draws}　先手勝率 ${(firstWins / decided * 100).toFixed(1)}%`);
  console.log(`平均長度 ${avg.toFixed(1)} 回合　最長 ${Math.max(...lens)}\n`);
  civs.forEach((c, i) => {
    const bar = '█'.repeat(Math.round(rates[i] / 2));
    console.log('  ' + api.CIVS[c].n.padEnd(9) + rates[i].toFixed(1).padStart(5) + '%  ' + bar);
  });
  const spread = Math.max(...rates) - Math.min(...rates);
  console.log(`\n  勝率極差 ${spread.toFixed(1)}pp（約 ${(100 / Math.sqrt(decided / civs.length)).toFixed(1)}pp 以內屬統計雜訊）`);

  if (TRACE) {
    const pct = n => (STAT.calls ? (n / STAT.calls * 100).toFixed(1) + '%' : '-');
    console.log(`\n  相剋判定 ${STAT.calls} 次　兵種三角觸發 ${pct(STAT.tri)}　攻城三角觸發 ${pct(STAT.siege)}`);
  }
  return draws > total * 0.02 ? 1 : 0;     // 和局超過 2% 視為異常
}

if (require.main === module) process.exit(main());
module.exports = { playOne };
