/* =========================================================
   卡牌資料
   ---------------------------------------------------------
   欄位說明：
     kind  兵種（I步兵 / C騎兵 / R遠程 / S攻城 / B建築），法術不需要
     n     顯示名稱      cost 費用
     atk   攻擊力        hp   血量        def  防禦力（傷害 = 攻擊 − 防禦，最低 1）
     rng   射程（格）    spd  速度（格，0 = 不能移動）
     tags  標籤，供法術／英雄技能指定目標（例：蒙古突襲指定「騎兵」）
     kw    關鍵字：shield 聖盾 / formation 陣型 / mobile 機動 /
                   building 建築 / thorns 荊棘 / siege 攻城
     siege 攻城加成值（配合 kw:['siege']）
     thorns 荊棘傷害值（配合 kw:['thorns']）
     type  'spell' 表示法術；target 指定目標型別
           ally / enemy / allyCav / allyBuilding，省略則無目標
     civ   'N' 中立，或文明代號
     t     卡面說明文字
   ========================================================= */

/* =========================================================
   卡表
   ========================================================= */
const CARDS = {
  // ================= 中立（14）=================
  militia:{kind:'I',n:'民兵',cost:1,atk:2,hp:2,rng:1,spd:1,tags:['步兵'],civ:'N'},
  palisade:{kind:'B',n:'木柵欄',cost:1,atk:0,hp:6,def:1,rng:0,spd:0,tags:['建築'],kw:['building'],civ:'N',t:'建築 · 便宜的擋路工事'},
  levy:   {n:'徵召令',cost:1,type:'spell',civ:'N',t:'抽 2 張牌'},
  spear:  {kind:'I',n:'長矛兵',cost:2,atk:2,hp:5,def:1,rng:1,spd:1,tags:['步兵'],civ:'N',t:'高血量的防守型步兵'},
  archer: {kind:'R',n:'弓箭手',cost:2,atk:2,hp:2,rng:2,spd:1,tags:['遠程'],civ:'N',t:'射程 2'},
  scout:  {kind:'C',n:'斥候',cost:2,atk:1,hp:3,rng:1,spd:2,tags:['騎兵'],civ:'N',t:'速度 2'},
  heal:   {n:'治療祈禱',cost:2,type:'spell',target:'ally',civ:'N',t:'友方單位回復 3 血'},
  warhorn:{n:'戰號',cost:2,type:'spell',target:'ally',civ:'N',t:'一個友方單位本回合攻擊 +2'},
  sword:  {kind:'I',n:'劍士',cost:3,atk:4,hp:4,rng:1,spd:1,tags:['步兵'],civ:'N'},
  crossbow:{kind:'R',n:'弩兵',cost:3,atk:3,hp:3,rng:2,spd:1,tags:['遠程'],civ:'N',t:'射程 2'},
  horseman:{kind:'C',n:'遊俠騎手',cost:3,atk:3,hp:4,rng:1,spd:2,tags:['騎兵'],civ:'N',t:'速度 2'},
  arrowstorm:{n:'箭雨',cost:3,type:'spell',target:'enemy',civ:'N',t:'對目標與同路相鄰的敵人各造成 2 傷害'},
  pike:   {kind:'I',n:'重裝長矛兵',cost:4,atk:3,hp:7,def:1,rng:1,spd:1,tags:['步兵'],civ:'N',t:'厚實的前線'},
  ram:    {kind:'S',n:'攻城槌',cost:4,atk:1,hp:8,rng:1,spd:1,tags:['攻城'],kw:['siege'],siege:4,civ:'N',t:'攻城 +4：專拆建築與城堡，打一般單位幾乎沒有殺傷力'},

  // ================= 不列顛（7）=================
  longbow:{kind:'R',n:'長弓手',cost:3,atk:3,hp:5,rng:2,spd:1,tags:['遠程'],civ:'brit',t:'射程 2'},
  manatarms:{kind:'I',n:'重裝士兵',cost:3,atk:4,hp:5,rng:1,spd:1,tags:['步兵'],civ:'brit',t:'補強長弓陣的近戰護衛'},
  pavise: {kind:'R',n:'大盾弩手',cost:4,atk:4,hp:6,def:1,rng:2,spd:1,tags:['遠程'],civ:'brit',t:'射程 2 · 帶盾的遠程'},
  royalguard:{kind:'I',n:'皇家衛隊',cost:5,atk:5,hp:6,def:1,rng:1,spd:1,tags:['步兵'],civ:'brit'},
  elite:  {kind:'R',n:'精銳長弓手',cost:5,atk:4,hp:5,rng:3,spd:1,tags:['遠程'],civ:'brit',t:'射程 3'},
  fireoil:{n:'火油箭',cost:2,type:'spell',target:'enemy',civ:'brit',t:'對一個敵方單位造成 4 點傷害'},
  bodkin: {n:'破甲箭',cost:2,type:'spell',target:'enemy',civ:'brit',t:'造成 3 傷害；目標有防禦力時改為 5'},

  // ================= 蒙古（7）=================
  lightcav:{kind:'C',n:'輕騎兵',cost:2,atk:4,hp:6,rng:1,spd:2,tags:['騎兵'],kw:['mobile'],civ:'mongol',t:'速度2 · 機動 · 移動後攻擊不受反擊'},
  horsearcher:{kind:'R',n:'蒙古弓騎',cost:3,atk:3,hp:5,rng:2,spd:2,tags:['騎兵','遠程'],kw:['mobile'],civ:'mongol',t:'速度2 射程2 · 機動'},
  steppelancer:{kind:'C',n:'草原槍騎',cost:4,atk:5,hp:6,rng:1,spd:2,tags:['騎兵'],kw:['mobile'],civ:'mongol',t:'速度2 · 機動 · 高攻低血'},
  mangudai:{kind:'R',n:'遊騎射手',cost:4,atk:5,hp:6,rng:2,spd:2,tags:['騎兵','遠程'],kw:['mobile'],civ:'mongol',t:'速度2 射程2 · 機動'},
  khanguard:{kind:'C',n:'怯薛軍',cost:6,atk:6,hp:8,def:1,rng:1,spd:2,tags:['騎兵'],kw:['mobile'],civ:'mongol',t:'速度2 · 機動 · 大汗親衛'},
  raid:   {n:'蒙古突襲',cost:2,type:'spell',target:'allyCav',civ:'mongol',t:'指定友方騎兵立刻行動一次'},
  feign:  {n:'佯退',cost:2,type:'spell',target:'ally',civ:'mongol',t:'一個友方單位立刻恢復移動額度'},

  // ================= 法蘭西（7）=================
  paladin:{kind:'C',n:'聖騎士',cost:3,atk:3,hp:4,def:1,rng:1,spd:1,tags:['騎兵'],kw:['formation'],civ:'france',t:'陣型（前後相連時防禦加倍）'},
  frspear:{kind:'I',n:'法蘭西長槍兵',cost:3,atk:3,hp:5,def:1,rng:1,spd:1,tags:['步兵'],kw:['formation'],civ:'france',t:'陣型 · 專剋騎兵的步兵'},
  knight: {kind:'C',n:'重裝騎士',cost:4,atk:4,hp:5,def:1,rng:1,spd:1,tags:['騎兵'],kw:['formation'],civ:'france',t:'陣型（前後相連時防禦加倍）'},
  templar:{kind:'C',n:'聖殿騎士',cost:4,atk:3,hp:5,def:1,rng:1,spd:1,tags:['騎兵'],kw:['shield'],civ:'france',t:'聖盾（免疫第一次傷害）'},
  crusade:{kind:'C',n:'十字軍',cost:5,atk:4,hp:5,def:1,rng:1,spd:1,tags:['騎兵'],kw:['shield','formation'],civ:'france',t:'聖盾 · 陣型'},
  royalknight:{kind:'C',n:'王家騎士',cost:6,atk:5,hp:7,def:1,rng:1,spd:1,tags:['騎兵'],kw:['shield','formation'],civ:'france',t:'聖盾 · 陣型'},
  blessing:{n:'聖女祝福',cost:4,type:'spell',target:'ally',civ:'france',t:'一個友方單位回復滿血並獲得聖盾'},

  // ================= 條頓（7）=================
  barricade:{kind:'B',n:'路障',cost:2,atk:0,hp:10,def:1,rng:0,spd:0,tags:['建築'],kw:['building','thorns'],thorns:2,civ:'teuton',t:'建築 · 荊棘2（每回合傷害周圍敵人）'},
  tower:  {kind:'B',n:'箭塔',cost:4,atk:2,hp:7,def:1,rng:2,spd:0,tags:['建築'],kw:['building'],civ:'teuton',t:'建築 · 射程2 的防禦砲台'},
  spearline:{kind:'I',n:'條頓長槍陣',cost:3,atk:3,hp:6,def:1,rng:1,spd:1,tags:['步兵'],civ:'teuton',t:'堅實的守備步兵'},
  teutonic:{kind:'I',n:'條頓騎士',cost:4,atk:5,hp:6,def:1,rng:1,spd:1,tags:['步兵'],civ:'teuton'},
  stonewall:{kind:'B',n:'石牆',cost:5,atk:0,hp:10,def:1,rng:0,spd:0,tags:['建築'],kw:['building','thorns'],thorns:2,civ:'teuton',t:'建築 · 荊棘2 · 高血量的封路手段'},
  ballista:{kind:'B',n:'弩砲',cost:6,atk:3,hp:6,def:1,rng:3,spd:0,tags:['建築'],kw:['building'],civ:'teuton',t:'建築 · 射程3'},
  repair: {n:'修繕',cost:3,type:'spell',target:'allyBuilding',civ:'teuton',t:'一個友方建築回復 6 點血量'},
};
const NEUTRAL = ['militia','palisade','levy','spear','archer','scout','heal','warhorn',
                 'sword','crossbow','horseman','arrowstorm','pike','ram'];
// 起始收藏：剛好能組出一副 20 張的牌組，其餘卡片要靠卡包解鎖
const STARTER_N = ['militia','spear','archer','scout','sword','ram','levy','heal'];
const STARTER_CIV = {brit:['longbow','manatarms'],mongol:['lightcav','mangudai'],
                     france:['paladin','frspear'],teuton:['tower','spearline']};
