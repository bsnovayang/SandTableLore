/* =========================================================
   規則常數 —— 調整遊戲尺度只需要動這裡
   ========================================================= */
const LANES = 3;          // 路數
const COLS  = 6;          // 每路格數
const CASTLE_HP = 15;     // 城堡血量
const HAND_MAX  = 5;      // 手牌上限
const GOLD_MAX  = 10;     // 金幣上限
const DECK_SIZE = 20;     // 牌組張數
const COPY_MAX  = 2;      // 同名卡上限
const COUNTER_BONUS = 2;  // 兵種相剋加成

/* 兵種代號 → 顯示名稱
   I 步兵/槍　C 騎兵　R 遠程　S 攻城　B 建築 */
const KIND_NAME = {I:'🗡步兵', C:'🐎騎兵', R:'🏹遠程', S:'🔨攻城', B:'🏰建築'};

/* 相剋關係：key 剋 value 裡的每一種
   兵種三角：遠程 剋 步兵 剋 騎兵 剋 遠程
   攻城三角：一般單位 剋 攻城 剋 建築 剋 一般單位 */
const COUNTER_TABLE = {
  R:['I','S'],
  I:['C','S'],
  C:['R','S'],
  S:['B'],
  B:['I','C','R'],
};

const SAVE_KEY = 'stl_save_v3';   // 卡池或存檔結構有變時提高版號，舊存檔自動失效重發
const PACK_COST = 100;            // 卡包售價
const PACK_SIZE = 3;              // 每包張數
const WIN_GEMS = 40, LOSE_GEMS = 15;

/* 稀有度
   weight 是卡包的抽取權重；dust 是超過同名上限時自動轉換的寶石數。
   PACK_PITY 保底：每包至少有一張達到該稀有度以上（爐石的做法），
   否則連開幾包都是普通卡，開包就沒有期待感。 */
const RARITY = {
  C: {n:'普通', color:'#9fb0c0', weight:70, dust:10},
  R: {n:'精良', color:'#5b9fd8', weight:25, dust:25},
  H: {n:'英雄', color:'#d8952a', weight: 5, dust:60},
};
const RARITY_ORDER = ['C','R','H'];
const PACK_PITY = 'R';
