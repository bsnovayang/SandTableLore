"use strict";
/* =========================================================
   錯誤可視化：任何例外都直接顯示在畫面上方，避免「點了沒反應」
   ========================================================= */
function showFatal(msg){
  const el=document.getElementById('fatal');
  if(!el){ console.error(msg); return; }
  if(!el.dataset.init){
    el.dataset.init='1';
    const x=document.createElement('span');
    x.className='x'; x.textContent='✕ 關閉';
    x.onclick=()=>el.classList.remove('on');
    el.appendChild(x);
    el.appendChild(document.createElement('span'));
  }
  el.classList.add('on');
  const body=el.lastChild;
  body.textContent += String.fromCharCode(10) + '⚠ ' + msg;
  console.error(msg);
}
/* 追蹤：把執行進度顯示在右下角探針框，讓「靜默失敗」看得見 */
let _tr=[];
function trace(step){
  _tr.push(step);
  const p=document.getElementById('probe');
  if(p) p.textContent='▶ '+_tr.join(' → ');
}
/* =========================================================
   開機自檢 + 點擊探針
   ========================================================= */
/* =========================================================
   資料驗證：新增卡片／文明時，打錯字會立刻在畫面上報出來
   ========================================================= */
function validateData(){
  const err=[];
  const kinds=Object.keys(KIND_NAME);
  const civIds=Object.keys(CIVS);
  Object.keys(CARDS).forEach(id=>{
    const c=CARDS[id], at=`卡牌 ${id}`;
    if(!c.n) err.push(`${at}：缺少名稱 n`);
    if(typeof c.cost!=='number') err.push(`${at}：缺少費用 cost`);
    if(!c.rarity) err.push(`${at}：缺少稀有度 rarity`);
    else if(!RARITY[c.rarity]) err.push(`${at}：rarity '${c.rarity}' 無效（可用：${Object.keys(RARITY).join('/')}）`);
    if(!c.civ) err.push(`${at}：缺少 civ`);
    else if(c.civ!=='N'&&!civIds.includes(c.civ)) err.push(`${at}：civ '${c.civ}' 不存在於 CIVS`);
    if(c.type==='spell'){
      const ok=[undefined,'ally','enemy','allyCav','allyBuilding'];
      if(!ok.includes(c.target)) err.push(`${at}：法術 target '${c.target}' 無效`);
    }else{
      if(!c.kind) err.push(`${at}：單位缺少兵種 kind`);
      else if(!kinds.includes(c.kind)) err.push(`${at}：kind '${c.kind}' 無效（可用：${kinds.join('/')}）`);
      ['atk','hp','rng','spd'].forEach(k=>{ if(typeof c[k]!=='number') err.push(`${at}：缺少數值 ${k}`); });
      if((c.kw||[]).includes('siege')&&!c.siege) err.push(`${at}：有 siege 關鍵字卻沒有 siege 數值`);
      if((c.kw||[]).includes('thorns')&&!c.thorns) err.push(`${at}：有 thorns 關鍵字卻沒有 thorns 數值`);
    }
  });
  NEUTRAL.concat(STARTER_N).forEach(id=>{ if(!CARDS[id]) err.push(`清單引用了不存在的卡牌：${id}`); });
  civIds.forEach(cv=>{
    const c=CIVS[cv];
    ['n','hero','icon','feat','sk','skT'].forEach(k=>{ if(!c[k]) err.push(`文明 ${cv}：缺少 ${k}`); });
    if(typeof c.skCost!=='number') err.push(`文明 ${cv}：缺少 skCost`);
    const own=Object.keys(CARDS).filter(id=>CARDS[id].civ===cv);
    if(!own.length) err.push(`文明 ${cv}：沒有任何專屬卡`);
    const st=STARTER_CIV[cv];
    if(!st) err.push(`文明 ${cv}：STARTER_CIV 沒有對應條目`);
    else st.forEach(id=>{
      if(!CARDS[id]) err.push(`文明 ${cv} 的起始卡 ${id} 不存在`);
      else if(CARDS[id].civ!==cv) err.push(`文明 ${cv} 的起始卡 ${id} 其實屬於 ${CARDS[id].civ}`);
    });
    // 起始收藏必須剛好能組出一副合法牌組
    const pool=STARTER_N.length*COPY_MAX + (st?st.length*COPY_MAX:0);
    if(pool<DECK_SIZE) err.push(`文明 ${cv}：起始收藏只有 ${pool} 張，湊不滿 ${DECK_SIZE} 張牌組`);
  });
  return err;
}

function boot(){
  // 1) CSS 是否真的套用了？（body 應為 overflow:hidden）
  const cssOK = getComputedStyle(document.body).overflow === 'hidden';
  // 2) JS 走到這裡就代表載入成功，移除警告條
  const bw=document.getElementById('boot'); if(bw) bw.remove();
  const dataErr=validateData();
  if(dataErr.length) showFatal('資料檢查發現 '+dataErr.length+' 個問題：'+String.fromCharCode(10)+dataErr.join(String.fromCharCode(10)));
  if(!cssOK) showFatal('style.css 沒有套用（可能是路徑錯誤或 404），版面與點擊行為都會不正常。');

  // 3) 視窗太窄時收合相剋表。1042px 是算出來的臨界值：
  //    面板右緣 236px + 20px 間距，兩側對稱再加上 264px 的盤面與 250px 的戰報欄。
  const CODEX_MIN_W=1042;
  const fitCodex=()=>{
    if(typeof innerWidth==='number' && innerWidth < CODEX_MIN_W && codexOpen){
      codexOpen=false; renderCodex();
    }
  };
  fitCodex();
  if(typeof addEventListener==='function') addEventListener('resize',fitCodex);

  // 除錯選單：F2 在任何畫面都能開
  document.addEventListener('keydown',e=>{
    if(e.key==='F2'){ toggleDebug(); e.preventDefault(); }
  });

  // 4) 鍵盤快捷鍵
  document.addEventListener('keydown',e=>{
    if(!G||G.over||!document.getElementById('battle').classList.contains('active')) return;
    if(e.key==='Escape'){                       // 取消選取／指定模式
      if(G.sel!==null||G.selUnit||G.mode){
        G.sel=null; G.selUnit=null; G.mode=null; hint.textContent=''; render();
        e.preventDefault();
      }
    }else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){
      undo(); e.preventDefault();
    }
  });

  // 5) 檢查程式碼依賴的「id 當全域變數」是否真的成立
  const need=['gemHud','civList','pool','deckList','deckCount','startBtn','packResult','turnInfo',
    'enemyInfo','hint','board','log','castleP','castleE','php','ehp','goldTxt','deckTxt',
    'villGold','villLand','heroBtn','endBtn','hand','banner','bTitle','bText','buffTxt','undoBtn','bOk','bCancel','mullBanner','mullCards','mullOk','fx','codex','debugPanel','dbgState','packBanner','packStage','packHint','packCards','packFoot'];
  const bad=need.filter(id=>{
    const el=document.getElementById(id);
    if(!el) return true;                 // HTML 裡根本沒這個元素
    return window[id]!==el;              // 有元素，但 window.<id> 不是它（被遮蔽）
  });
  if(bad.length) showFatal('以下 id 無法用全域變數存取，程式會在用到它們時中斷：'+bad.join(', '));

  // 6) 點擊探針：用 elementFromPoint 找出滑鼠位置最上層的元素
  const probe=document.getElementById('probe');
  if(probe){
    if(!location.search.includes('debug')) probe.classList.add('hide');  // 需要除錯時網址加 ?debug
    probe.onclick=()=>probe.classList.add('hide');
    document.addEventListener('mousedown',e=>{
      const top=document.elementFromPoint(e.clientX,e.clientY);
      const btn=e.target.closest && e.target.closest('button');
      const desc=n=>!n?'(無)':n.tagName.toLowerCase()
        +(n.id?'#'+n.id:'')+(n.className&&typeof n.className==='string'?'.'+n.className.trim().split(/\s+/).join('.'):'')
        +(n.tagName==='BUTTON'?' 「'+n.textContent.trim().slice(0,8)+'」':'');
      const blocked = btn && top!==btn && !btn.contains(top);
      probe.textContent='🐞 最上層：'+desc(top)
        + (btn? '  ｜ 目標按鈕：'+desc(btn)+(btn.disabled?' [disabled 停用中]':'') : '')
        + (blocked? '  ⚠ 按鈕被上面那個元素蓋住了！' : '');
      probe.style.borderColor = blocked||(btn&&btn.disabled) ? '#c4553f' : '#3d5a72';
    },true);
  }
}
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot);
else boot();

window.addEventListener('error',e=>{
  showFatal((e.message||'錯誤')+'  @ '+String(e.filename||'').split('/').pop()+':'+e.lineno);
});
window.addEventListener('unhandledrejection',e=>showFatal('未處理的 Promise：'+e.reason));

/* localStorage 在 file:// 或無痕模式可能直接丟出 SecurityError，包起來保護 */
let storageWarned=false;
const store={
  get(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } },
  set(k,v){ try{ localStorage.setItem(k,v); }catch(e){
    if(!storageWarned){ storageWarned=true;
      showFatal('存檔無法寫入（可能是以 file:// 開啟或無痕模式）。遊戲仍可正常進行，但進度不會保留。'); }
  }}
};

/* =========================================================
   存檔
   ========================================================= */
const SAVE=SAVE_KEY;
let save = load();
/* 起始收藏：基本中立 ×2 + 每個文明兩張招牌卡 ×2 = 剛好 20 張，其餘靠卡包解鎖 */
function starterCollection(){
  const col={};
  STARTER_N.forEach(c=>col[c]=COPY_MAX);
  Object.values(STARTER_CIV).forEach(list=>list.forEach(c=>col[c]=COPY_MAX));
  return col;
}
function defaultSave(){ return {gems:120, collection:starterCollection(), civ:'brit', decks:{}}; }
function load(){
  try{ const s=JSON.parse(store.get(SAVE)); if(s&&s.collection) return s; }catch(e){}
  return defaultSave();
}
function persist(){ store.set(SAVE,JSON.stringify(save)); paintGems(); }
function paintGems(){ ['gemHud','gemDeck','gemShop'].forEach(id=>{
  const el=document.getElementById(id); if(el) el.textContent='💎 '+save.gems; }); }
paintGems();

/* =========================================================
   畫面切換
   ========================================================= */
function go(id){
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  gemHud.style.display = id==='menu' ? 'block':'none';
  if(id==='deckbuild') openDeckbuild();
  if(id==='shop') renderShopHint();
}
const RULES_HTML = `<b>盤面</b>：3 路 × 6 格，敵方城堡在上、我方在下。走到底就直擊城堡（15 血）。<br>
<b>部署</b>：只能放在自己「領土」內的空格。當回合部署的單位不能行動（💤），下回合才能動。<br>
<b>村民抉擇</b>（每回合強制二選一）：🪙 金幣上限 +1（最高 10）／🚩 指定一路領土 +1。<br>
<b>操作</b>：點自己的單位 → 點<span style="color:#78dc96">綠框</span>前進、<span style="color:#f0d68f">黃框 ⇄</span> 換線或後退、<span style="color:#ff6a4d">紅框</span>攻擊。<br>
<b>行動額度</b>：每個單位每回合可<b>移動一次 + 攻擊一次</b>，順序不限。棋子左上角標示還剩什麼：
<b>移</b>=只剩移動、<b>攻</b>=只剩攻擊、<b>✓</b>=已用完、<b>💤</b>=召喚失調。<br>
<b>換線／後退</b>：本回合放棄攻擊（蒙古的「機動」單位不受此限）。<br>
<b>射程</b>：以格數計算，<b>跨到鄰路要多花 1 點射程</b>。所以射程 2 的弓兵打得到鄰路正側面。<br>
<b>反擊</b>：近戰互相扣血；<b>遠程攻擊不受反擊</b>。<br>
<b>傷害</b> = 攻擊 − 防禦（最低 1）。手牌上限 5，牌庫抽完後疲勞傷害逐次遞增。<br><br>
<b style="color:#f0d68f">兵種相剋（+2 傷害）</b><br>
　🏹遠程 剋 🗡步兵 剋 🐎騎兵 剋 🏹遠程<br>
　🗡一般單位 剋 🔨攻城 剋 🏰建築 剋 🗡一般單位<br><br>
<b style="color:#f0d68f">關鍵字</b><br>
　<b>聖盾</b> 免疫第一次受到的傷害　<b>陣型</b> 同路前後相連時防禦加倍<br>
　<b>機動</b> 換線／後退後仍可攻擊，且移動後攻擊不受反擊<br>
　<b>荊棘</b> 每回合對周圍敵人造成傷害　<b>攻城</b> 對建築與城堡額外傷害<br><br>
<span style="color:#9a8d76">操作提示：Esc 取消選取　Ctrl+Z 復原上一步</span>`;

function showRules(){
  dialog('規則說明', RULES_HTML);
}
let pendingAfterBanner=null;
/* 通用對話框。confirm 為 true 時多出「取消」，只有按確定才執行 onYes。 */
function dialog(title,html,opts){
  const o=opts||{};
  bTitle.textContent=title;
  bText.innerHTML=html;
  bCancel.style.display = o.confirm ? 'inline-block' : 'none';
  bOk.textContent = o.okText || '確定';
  pendingAfterBanner = o.onYes || null;
  banner.classList.add('on');
}
function closeBanner(confirmed){
  banner.classList.remove('on');
  const f=pendingAfterBanner; pendingAfterBanner=null;
  if(f && confirmed!==false) f();
}

/* =========================================================
   組牌
   ========================================================= */
let deck = [];
function renderDeckbuild(){
  civList.innerHTML='';
  Object.keys(CIVS).forEach(k=>{
    const c=CIVS[k];
    const d=document.createElement('div');
    d.className='civ'+(save.civ===k?' on':'');
    d.innerHTML=`<div class="t">${c.icon} ${c.n}</div>
      <div class="d">英雄：${c.hero}<br>${c.feat}<br><span style="color:var(--gold2)">【${c.sk}】</span>${c.skT}（${c.skCost} 金）</div>`;
    d.onclick=()=>{ save.civ=k; deck=(save.decks[k]||[]).slice(); persist(); renderDeckbuild(); };
    d.title=c.feat;
    civList.appendChild(d);
  });
  deck = deck.filter(id=>CARDS[id] && (CARDS[id].civ==='N'||CARDS[id].civ===save.civ));

  pool.innerHTML='';
  Object.keys(CARDS).filter(id=>CARDS[id].civ==='N'||CARDS[id].civ===save.civ).forEach(id=>{
    const own=save.collection[id]||0;
    const used=deck.filter(x=>x===id).length;
    const el=cardEl(id);
    el.insertAdjacentHTML('beforeend',
      `<div class="own">已放 <b>${used}</b>/${Math.min(COPY_MAX,own)}　擁有 ${own}</div>`);
    if(own===0||used>=Math.min(COPY_MAX,own)) el.classList.add('dim');
    el.onclick=()=>{ if(deck.length>=DECK_SIZE) return; if(used<Math.min(COPY_MAX,own)){deck.push(id);renderDeckbuild();} };
    pool.appendChild(el);
  });
  const counts={}; deck.forEach(id=>counts[id]=(counts[id]||0)+1);
  deckList.innerHTML='';
  Object.keys(counts).sort((a,b)=>CARDS[a].cost-CARDS[b].cost).forEach(id=>{
    const r=document.createElement('div'); r.className='drow';
    r.innerHTML=`<span><span class="c">${CARDS[id].cost}</span> ${CARDS[id].n}</span><span>×${counts[id]}</span>`;
    r.onclick=()=>{ deck.splice(deck.indexOf(id),1); renderDeckbuild(); };
    deckList.appendChild(r);
  });
  deckCount.textContent=deck.length+' / '+DECK_SIZE;
  startBtn.disabled = deck.length!==DECK_SIZE;
  save.decks[save.civ]=deck.slice(); persist();
}
function autoFill(){
  const pool2=Object.keys(CARDS).filter(id=>CARDS[id].civ==='N'||CARDS[id].civ===save.civ);
  let guard=200;
  while(deck.length<DECK_SIZE && guard-->0){
    let added=false;
    for(const id of pool2){
      if(deck.length>=DECK_SIZE) break;
      const own=Math.min(COPY_MAX,save.collection[id]||0);
      if(deck.filter(x=>x===id).length<own){ deck.push(id); added=true; }
    }
    if(!added) break;
  }
  renderDeckbuild();
}
/* 依目前的收藏與文明過濾牌組 —— 收藏被改小（或換文明）時，
   已存的牌組可能含有不再合法的卡，不清掉就會帶著違規牌組進場 */
function sanitizeDeck(list){
  const used={};
  return list.filter(id=>{
    const c=CARDS[id];
    if(!c) return false;
    if(c.civ!=='N' && c.civ!==save.civ) return false;
    const own=Math.min(COPY_MAX, save.collection[id]||0);
    used[id]=(used[id]||0)+1;
    return used[id]<=own;
  });
}
function openDeckbuild(){ deck=sanitizeDeck((save.decks[save.civ]||[]).slice()); renderDeckbuild(); }
function clearDeck(){ deck=[]; renderDeckbuild(); }

function cardEl(id,extraCls){
  const c=CARDS[id];
  const d=document.createElement('div');
  d.className='card '+(c.type==='spell'?'spell':(c.kw&&c.kw.includes('building')?'bld':''))
    +' rar'+(c.rarity||'C')+' '+(extraCls||'');
  let body=`<div class="cost">${c.cost}</div>`
    + (c.kind?`<div class="kind">${KIND_NAME[c.kind]}</div>`:'')
    + `<div class="nm">${c.n}</div>`;
  if(c.t) body+=`<div class="tx">${c.t}</div>`;
  if(c.type!=='spell'){
    body+=`<div class="atk">${c.atk}</div><div class="hp">${c.hp}</div>`;
    // 兵種已顯示在右上角，meta 只補充「額外」資訊：次要標籤與防禦力
    const kindTag={I:'步兵',C:'騎兵',R:'遠程',S:'攻城',B:'建築'}[c.kind];
    const extra=(c.tags||[]).filter(t=>t!==kindTag);
    body+=`<div class="meta">${extra.join('·')}${c.def?(extra.length?' ':'')+'防'+c.def:''}</div>`;
  }else body+=`<div class="meta">法術</div>`;
  d.innerHTML=body;
  return d;
}

/* =========================================================
   商店
   ========================================================= */
/* 依稀有度權重抽一張卡 */
function rollCard(minRarity){
  const min = minRarity ? RARITY_ORDER.indexOf(minRarity) : 0;
  const pool = Object.keys(CARDS).filter(id => RARITY_ORDER.indexOf(CARDS[id].rarity) >= min);
  const total = pool.reduce((s,id)=>s+RARITY[CARDS[id].rarity].weight, 0);
  let r = Math.random()*total;
  for(const id of pool){
    r -= RARITY[CARDS[id].rarity].weight;
    if(r<=0) return id;
  }
  return pool[pool.length-1];
}

/* 開一包。回傳每張卡的結果，供開包動畫逐張揭曉。
   超過同名上限的卡直接轉成寶石 —— 否則多抽的卡完全沒有用途。 */
function openPack(){
  const out=[];
  for(let i=0;i<PACK_SIZE;i++){
    // 保底：最後一張若整包都還沒出精良以上，就強制抽精良以上
    const needPity = (i===PACK_SIZE-1) &&
      !out.some(o=>RARITY_ORDER.indexOf(CARDS[o.id].rarity) >= RARITY_ORDER.indexOf(PACK_PITY));
    const id = rollCard(needPity ? PACK_PITY : null);
    const own = save.collection[id]||0;
    if(own >= COPY_MAX){
      const dust = RARITY[CARDS[id].rarity].dust;
      save.gems += dust;
      out.push({id, dup:true, dust});
    }else{
      save.collection[id] = own + 1;
      out.push({id, dup:false, dust:0});
    }
  }
  persist();
  return out;
}

/* =========================================================
   開包儀式
   ---------------------------------------------------------
   三幕：火漆封印 → 打破後羊皮紙展開 → 卡片逐張翻面。
   全程可跳過 —— 開包會重複幾十次，不能跳的動畫到第十包就是折磨。
   偏好記在存檔裡，勾過「以後直接看結果」之後就不再播動畫。
   音效用 Web Audio 合成，不需要任何音檔。
   ========================================================= */
let packState=null;

function showPackOpening(cards){
  packState={cards, flipped:new Set(), phase:'seal'};
  packBanner.classList.add('on');
  packStage.className='packStage phase-seal';
  packHint.textContent='點擊火漆封印';
  packCards.innerHTML='';
  packFoot.innerHTML='';
  if(save.fastPack) packSkip();
}

/* 打破封印：蠟片裂開飛散 → 羊皮紙展開 → 進入翻牌 */
function packBreak(){
  if(!packState||packState.phase!=='seal') return;
  packState.phase='breaking';
  packStage.className='packStage phase-breaking';
  packHint.textContent='';
  sfxCrack();
  setTimeout(()=>{ if(packState&&packState.phase==='breaking') packDeal(); }, 760);
}

/* 發牌：背面朝上排開，逐張點擊翻面 */
function packDeal(){
  if(!packState) return;
  packState.phase='cards';
  packStage.className='packStage phase-cards';
  packCards.innerHTML='';
  packState.cards.forEach((c,i)=>{
    const wrap=document.createElement('div');
    wrap.className='flipCard';
    wrap.style.animationDelay=(i*90)+'ms';
    const inner=document.createElement('div');
    inner.className='flipInner';
    const back=document.createElement('div');
    back.className='flipFace flipBack';
    back.innerHTML='<span>&#9876;</span>';
    const front=document.createElement('div');
    front.className='flipFace flipFront rar-'+CARDS[c.id].rarity;
    front.appendChild(cardEl(c.id));
    if(c.dup){
      const tag=document.createElement('div');
      tag.className='dupTag';
      tag.textContent='重複 → 💎'+c.dust;
      front.appendChild(tag);
    }
    inner.appendChild(back); inner.appendChild(front);
    wrap.appendChild(inner);
    wrap.onclick=()=>packFlip(i,wrap);
    packCards.appendChild(wrap);
  });
  packFoot.innerHTML='<span class="packTip">點卡片翻面</span>';
}

function packFlip(i,wrap){
  if(!packState||packState.flipped.has(i)) return;
  packState.flipped.add(i);
  wrap.classList.add('flipped');
  const rar=CARDS[packState.cards[i].id].rarity;
  if(rar==='H'){
    wrap.classList.add('shine');
    packStage.classList.add('quake');
    sfxRare();
    setTimeout(()=>packStage.classList.remove('quake'),420);
  }else sfxFlip();
  if(packState.flipped.size===packState.cards.length) packDone();
}

/* 跳過：直接進到全部翻開的結果 */
function packSkip(){
  if(!packState) return;
  packDeal();
  packState.cards.forEach((c,i)=>{
    packState.flipped.add(i);
    const w=packCards.children[i];
    if(w){
      w.classList.add('flipped','instant');
      if(CARDS[c.id].rarity==='H') w.classList.add('shine');
    }
  });
  packDone();
}

function packDone(){
  const dust=packState.cards.reduce((s,c)=>s+c.dust,0);
  const best=packState.cards.map(c=>CARDS[c.id].rarity)
    .sort((a,b)=>RARITY_ORDER.indexOf(b)-RARITY_ORDER.indexOf(a))[0];
  packFoot.innerHTML=
    '<div class="packSum">本包最佳：<b style="color:'+RARITY[best].color+'">'+RARITY[best].n+'</b>'
    + (dust?'　重複轉換：💎'+dust:'') + '</div>'
    + '<label class="packPref"><input type="checkbox" id="packFast"'
    + (save.fastPack?' checked':'')
    + ' onchange="save.fastPack=this.checked;persist()"> 以後直接看結果</label>'
    + '<button class="primary" onclick="closePack()">收下</button>';
}

function closePack(){
  packBanner.classList.remove('on');
  packState=null;
  renderShopHint();
}

/* 商店頁的機率說明 */
function renderShopHint(){
  const el=document.getElementById('packResult');
  if(!el||typeof el.appendChild!=='function') return;
  el.innerHTML='<div class="shopNote">'
    + RARITY_ORDER.map(r=>'<span class="rarLegend" style="--c:'+RARITY[r].color+'">'
        + RARITY[r].n+' '+RARITY[r].weight+'%</span>').join('')
    + '<div class="shopSub">每包 '+PACK_SIZE+' 張，至少 1 張'+RARITY[PACK_PITY].n+'以上。'
    + '超過同名上限 '+COPY_MAX+' 張的卡自動轉成寶石（'
    + RARITY_ORDER.map(r=>RARITY[r].n+' 💎'+RARITY[r].dust).join('／')
    + '）。</div></div>';
}

/* ---------- 音效：Web Audio 合成，不需要音檔 ---------- */
function sfx(build){
  try{
    const AC=window.AudioContext||window.webkitAudioContext;
    if(!AC) return;
    if(!sfx.ctx) sfx.ctx=new AC();
    build(sfx.ctx);
  }catch(e){}
}
function sfxCrack(){        // 白噪音爆點經低通濾波，像蠟裂
  sfx(ctx=>{
    const n=Math.floor(ctx.sampleRate*0.25);
    const buf=ctx.createBuffer(1,n,ctx.sampleRate), d=buf.getChannelData(0);
    for(let i=0;i<n;i++) d[i]=(Math.random()*2-1)*Math.pow(1-i/n,3);
    const src=ctx.createBufferSource(); src.buffer=buf;
    const f=ctx.createBiquadFilter(); f.type='lowpass'; f.frequency.value=1800;
    const g=ctx.createGain(); g.gain.value=0.35;
    src.connect(f); f.connect(g); g.connect(ctx.destination); src.start();
  });
}
function sfxFlip(){
  sfx(ctx=>{
    const o=ctx.createOscillator(), g=ctx.createGain();
    o.type='triangle';
    o.frequency.setValueAtTime(520,ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(900,ctx.currentTime+0.06);
    g.gain.setValueAtTime(0.08,ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+0.12);
    o.connect(g); g.connect(ctx.destination); o.start(); o.stop(ctx.currentTime+0.13);
  });
}
function sfxRare(){         // 英雄級：上行三音號角
  sfx(ctx=>{
    [660,880,1320].forEach((f,i)=>{
      const o=ctx.createOscillator(), g=ctx.createGain();
      const t=ctx.currentTime+i*0.09;
      o.type='sine'; o.frequency.setValueAtTime(f,t);
      g.gain.setValueAtTime(0.001,t);
      g.gain.exponentialRampToValueAtTime(0.14,t+0.02);
      g.gain.exponentialRampToValueAtTime(0.001,t+0.42);
      o.connect(g); g.connect(ctx.destination); o.start(t); o.stop(t+0.45);
    });
  });
}

function buyPack(){
  if(save.gems<PACK_COST){
    dialog('寶石不足','需要 💎'+PACK_COST+'，去打幾場吧！');
    return;
  }
  save.gems-=PACK_COST;
  const cards=openPack();
  showPackOpening(cards);
}

/* =========================================================
   戰鬥狀態
   ========================================================= */
let G=null, uid=1;
function mkSide(civ,deckIds,isAI){
  const d=deckIds.slice(); shuffle(d);
  return {civ,deck:d,hand:[],hp:CASTLE_HP,gold:3,max:3,front:[1,1,1],
          heroUsed:false,villDone:false,ai:isAI,rangedBuff:0,fatigue:0,coin:0};
}
function shuffle(a){ for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} }

function aiDeck(civ){
  // 文明專屬卡全放（同名 2 張），剩下的名額用便宜中立卡補滿 —— 這樣牌組才展現得出文明特色
  const d=[];
  const add=(id,n)=>{ for(let i=0;i<n && d.length<20 && d.filter(x=>x===id).length<2;i++) d.push(id); };
  Object.keys(CARDS).filter(id=>CARDS[id].civ===civ).forEach(id=>add(id,2));
  Object.keys(CARDS).filter(id=>CARDS[id].civ==='N'&&CARDS[id].type!=='spell')
    .sort((a,b)=>CARDS[a].cost-CARDS[b].cost).forEach(id=>add(id,2));
  Object.keys(CARDS).filter(id=>CARDS[id].civ==='N').forEach(id=>add(id,2));
  return d.slice(0,20);
}

function startBattle(){
  _tr=[];
  try{ _startBattle(); }
  catch(err){ const NL=String.fromCharCode(10);
    showFatal('開始對戰失敗：'+err.message+NL+String(err.stack||'').split(NL)[1]); }
}
function _startBattle(){
  if(deck.length!==DECK_SIZE){ showFatal('牌組必須剛好 '+DECK_SIZE+' 張（目前 '+deck.length+' 張）'); return; }
  trace('進入');
  const foes=Object.keys(CIVS).filter(c=>c!==save.civ);
  const foe=foes[Math.floor(Math.random()*foes.length)];
  G={ turn:1, side:'P', over:false,
      P:mkSide(save.civ,deck,false),
      E:mkSide(foe,aiDeck(foe),true),
      units:[], sel:null, mode:null, log:[] };
  trace('建立對局');
  for(let i=0;i<3;i++) draw('P');
  for(let i=0;i<4;i++) draw('E');
  G.E.coin=2;   // 後手補償：第一回合多 2 金（實測 1 金不足以抵銷先手優勢）
  trace('抽起手牌');
  const fc=CIVS[foe];
  enemyInfo.textContent=fc.icon+' '+fc.n+'（'+fc.hero+'）';
  enemyInfo.title=`${fc.feat}${String.fromCharCode(10)}英雄技能【${fc.sk}】${fc.skT}（${fc.skCost} 金）`;
  enemyInfo.style.cursor='help';
  trace('寫入敵方資訊');
  log.innerHTML='';
  trace('清空戰報');
  go('battle');
  trace('切到戰場畫面');
  render();
  startMulligan();
  trace('完成 ✔');
}
function quitBattle(){
  if(!G||G.over){ go('menu'); return; }
  dialog('確定要投降嗎？','離開後這場對戰不會計入寶石獎勵，進度也不會保留。',
    {confirm:true, okText:'投降離開', onYes:()=>{ G.over=true; go('menu'); }});
}

function say(h){ const d=document.createElement('div'); d.innerHTML=h; log.prepend(d); }

function draw(s){
  const S=G[s];
  if(!S.deck.length){                       // 疲勞遞增，確保對局一定會結束
    S.fatigue=(S.fatigue||0)+1; S.hp-=S.fatigue;
    say(`${nm(s)} 牌庫耗盡，<b>疲勞 -${S.fatigue}</b>`); return; }
  const c=S.deck.pop();
  if(S.hand.length>=HAND_MAX){ say(`${nm(s)} 手牌已滿，燒掉了 ${CARDS[c].n}`); return; }
  S.hand.push(c);
}
function nm(s){ return s==='P'?'你':'敵方'; }

/* =========================================================
   起手換牌
   ---------------------------------------------------------
   起手 3 張全是高費就等於先輸一半，這是牌組遊戲的標準補救。
   順序很重要：**先補抽、再把換掉的牌洗回牌庫**。
   反過來做的話會抽到自己剛丟掉的那張，換牌就白換了。
   ========================================================= */
let mullPicked=new Set();
function startMulligan(){
  mullPicked=new Set();
  // NPC 也換：把 5 費以上的牌換掉
  const drop=[];
  G.E.hand.forEach((id,i)=>{ if(CARDS[id].cost>=5) drop.push(i); });
  mulliganFor('E',drop);
  renderMulligan();
  mullBanner.classList.add('on');
}
function mulliganFor(side,indices){
  if(!indices.length) return;
  const S=G[side];
  const back=indices.map(i=>S.hand[i]);
  indices.slice().sort((a,b)=>b-a).forEach(i=>S.hand.splice(i,1));
  for(let i=0;i<back.length;i++) draw(side);   // 先補抽
  back.forEach(id=>S.deck.push(id));           // 再把換掉的洗回去
  shuffle(S.deck);
}
function renderMulligan(){
  mullCards.innerHTML='';
  G.P.hand.forEach((id,i)=>{
    const el=cardEl(id, mullPicked.has(i)?'mull-drop':'');
    el.onclick=()=>{ if(mullPicked.has(i)) mullPicked.delete(i); else mullPicked.add(i); renderMulligan(); };
    mullCards.appendChild(el);
  });
  mullOk.textContent = mullPicked.size ? `換掉 ${mullPicked.size} 張並開始` : '不換，直接開始';
}
function finishMulligan(){
  mulliganFor('P',[...mullPicked]);
  mullBanner.classList.remove('on');
  say(`<b>戰鬥開始</b>：對手為 ${CIVS[G.E.civ].n}`);
  beginTurn('P');
}

/* ---------- 回合 ---------- */
function beginTurn(s){
  const S=G[s];
  S.gold=S.max; S.heroUsed=false; S.villDone=false; S.rangedBuff=0;
  if(S.coin>0){ S.gold+=S.coin; say(`${nm(s)} 使用後手補償金幣 +${S.coin}`); S.coin=0; }
  G.selUnit=null;
  if(s==='P') undoStack=[];
  G.units.filter(u=>u.owner===s).forEach(u=>{ u.sick=false; u.moved=false; u.attacked=false; u.buff=0; });
  // 金幣已滿且三路都無法拓荒時，直接視為已完成抉擇，避免卡住
  if(S.max>=GOLD_MAX && !canPush(s)) S.villDone=true;
  draw(s);
  G.side=s;
  say(`—— 第 ${G.turn} 回合 · ${nm(s)}的回合 ——`);
  render();
  if(s==='E') setTimeout(()=>aiTurn('E'),600);
}
function villager(kind){
  if(G.side!=='P'||G.P.villDone) return;
  if(kind==='gold'){
    if(G.P.max>=GOLD_MAX){ hint.textContent='金幣上限已達 '+GOLD_MAX; return; }
    pushUndo();
    G.P.max++; G.P.gold++; G.P.villDone=true; say('你選擇 <b>開發</b>：金幣上限 → '+G.P.max);
    render();
  }else{
    G.mode={type:'push'}; hint.textContent='選擇要拓荒的路線（點綠框格子）'; render();
  }
}
function canPush(side){
  const S=G[side],O=G[other(side)];
  for(let l=0;l<LANES;l++) if(S.front[l]+O.front[l]<COLS) return true;
  return false;
}
function doPush(side,lane){
  const S=G[side], O=G[other(side)];
  if(S.front[lane]+O.front[lane]>=COLS) return false;
  S.front[lane]++; S.villDone=true;
  say(`${nm(side)} <b>拓荒</b>：第 ${lane+1} 路領土推進到 ${S.front[lane]} 格`);
  return true;
}
function other(s){ return s==='P'?'E':'P'; }

function endTurn(){
  if(G.side!=='P'||G.over) return;
  if(!G.P.villDone){ hint.textContent='請先完成村民抉擇（開發 或 拓荒）'; return; }
  G.sel=null; G.mode=null; G.selUnit=null;
  endOfTurn('P');
  if(G.over) return;
  beginTurn('E');
}

/* ---------- 部署與出牌 ---------- */
function ownsCell(side,lane,col){
  const f=G[side].front[lane];
  return side==='P' ? col<f : col>=COLS-f;
}
function unitAt(lane,col){ return G.units.find(u=>u.lane===lane&&u.col===col&&u.hp>0); }

function playCard(side,idx,lane,col,targetUnit){
  const S=G[side], id=S.hand[idx], c=CARDS[id];
  if(c.cost>S.gold) return false;
  if(c.type==='spell'){
    if(!castSpell(side,id,targetUnit)) return false;
  }else{
    if(unitAt(lane,col)||!ownsCell(side,lane,col)) return false;
    G.units.push({id:uid++,card:id,owner:side,lane,col,
      hp:c.hp,max:c.hp,atk:c.atk,def:c.def||0,rng:c.rng,spd:c.spd,
      kw:(c.kw||[]).slice(),tags:(c.tags||[]).slice(),
      shield:(c.kw||[]).includes('shield'),thorns:c.thorns||0,siege:c.siege||0,kind:c.kind||null,
      moved:false,attacked:false,sick:true,buff:0});   // 召喚失調：當回合不能行動
    say(`${nm(side)} 部署 <b>${c.n}</b> 於第 ${lane+1} 路 ${col+1} 格`);
  }
  S.gold-=c.cost; S.hand.splice(idx,1);
  return true;
}
function castSpell(side,id,t){
  if(id==='levy'){ draw(side);draw(side); say(`${nm(side)} 使用 <b>徵召令</b>`); return true; }
  if(id==='heal'){ if(!t||t.owner!==side) return false; t.hp=Math.min(t.max,t.hp+3); say(`${nm(side)} 治療 ${CARDS[t.card].n}`); flash(t); return true; }
  if(id==='fireoil'){ if(!t||t.owner===side) return false; damage(t,4,null,9); say(`${nm(side)} <b>火油箭</b> 對 ${CARDS[t.card].n} 造成 4 傷害`); return true; }
  if(id==='warhorn'){ if(!t||t.owner!==side) return false;
    t.buff=(t.buff||0)+2; say(`${nm(side)} <b>戰號</b>：${CARDS[t.card].n} 本回合攻擊 +2`); return true; }
  if(id==='arrowstorm'){ if(!t||t.owner===side) return false;
    say(`${nm(side)} <b>箭雨</b>！`);
    const hit=G.units.filter(o=>o.hp>0&&o.owner!==side&&o.lane===t.lane&&Math.abs(o.col-t.col)<=1);
    hit.forEach(o=>damage(o,2,null,9));
    return true; }
  if(id==='bodkin'){ if(!t||t.owner===side) return false;
    const dmg=effDef(t)>0?5:3;
    say(`${nm(side)} <b>破甲箭</b> 對 ${CARDS[t.card].n} 造成 ${dmg} 傷害`);
    damage(t,dmg,null,9); return true; }
  if(id==='feign'){ if(!t||t.owner!==side) return false;
    t.moved=false; say(`${nm(side)} <b>佯退</b>：${CARDS[t.card].n} 恢復移動額度`); return true; }
  if(id==='blessing'){ if(!t||t.owner!==side) return false;
    t.hp=t.max; t.shield=true;
    say(`${nm(side)} <b>聖女祝福</b>：${CARDS[t.card].n} 回滿血並獲得聖盾`); flash(t); return true; }
  if(id==='repair'){ if(!t||t.owner!==side||!t.kw.includes('building')) return false;
    t.hp=Math.min(t.max,t.hp+6); say(`${nm(side)} <b>修繕</b>：${CARDS[t.card].n} 回復 6 血`); flash(t); return true; }
  if(id==='raid'){ if(!t||t.owner!==side||!t.tags.includes('騎兵')) return false;
    t.moved=false; t.attacked=false; t.sick=false;
    say(`${nm(side)} <b>蒙古突襲</b>：${CARDS[t.card].n} 可以再行動一次`); return true; }
  return false;
}

/* ---------- 戰鬥結算 ---------- */
function dir(s){ return s==='P'?1:-1; }
function distCastle(u){ return u.owner==='P' ? COLS-u.col : u.col+1; }
function effDef(u){
  let d=u.def;
  if(u.kw.includes('formation')){
    const mate=G.units.some(o=>o.hp>0&&o.owner===u.owner&&o.lane===u.lane&&Math.abs(o.col-u.col)===1&&o.kw.includes('formation'));
    if(mate) d=Math.min(d*2,d+2);   // 陣型：防禦加倍，但最多 +2
  }
  return d;
}
function enemyAhead(u){
  const d=dir(u.owner);
  return G.units.some(o=>o.hp>0&&o.owner!==u.owner&&o.lane===u.lane&&(o.col-u.col)*d>0);
}
function damage(t,amt,src,srcRng){
  if(t.shield){ t.shield=false; say(`　${CARDS[t.card].n} 的 <b>聖盾</b> 擋下了傷害`); fxDamage(t,'🛡'); return 0; }
  const dmg=Math.max(1,amt-effDef(t));
  t.hp-=dmg;
  fxDamage(t,'-'+dmg);
  if(t.hp<=0) fxDie(t);
  say(`　${CARDS[t.card].n} 受到 <b>${dmg}</b> 傷害（${Math.max(0,t.hp)}/${t.max}）`);
  return dmg;
}
/* ---------- 兵種相剋（全域規則，不是卡片效果） ----------
   兵種三角：🏹遠程 剋 🗡步兵 剋 🐎騎兵 剋 🏹遠程
   攻城三角：🗡一般 剋 🔨攻城 剋 🏰建築 剋 🗡一般
   量測顯示：綁在卡片上的關鍵字只有 2.9% 的攻擊會觸發，全域規則則是 18%。 */
function counters(a,b){ return !!(COUNTER_TABLE[a]&&COUNTER_TABLE[a].includes(b)); }
function counterBonus(u,t){
  const a=u.kind,b=t.kind;
  if(!a||!b||!counters(a,b)) return 0;
  return (a==='S'&&b==='B') ? u.siege : COUNTER_BONUS;   // 攻城打建築用卡片自己的攻城值
}
/* 滑鼠停留時的完整說明 —— 關鍵字不必背 */
const KW_TEXT={
  shield:'聖盾：免疫第一次受到的傷害',
  formation:'陣型：同路前後有另一個陣型單位時，防禦力加倍',
  mobile:'機動：換線／後退後仍可攻擊；移動後的攻擊不受反擊',
  building:'建築：無法移動，剋一般單位，被攻城武器剋制',
  thorns:'荊棘：每回合對周圍敵人造成傷害',
  siege:'攻城：對建築與城堡造成額外傷害',
};
function unitTip(u){
  const c=CARDS[u.card], L=[];
  L.push(`${c.n}　${KIND_NAME[u.kind]||''}`);
  L.push(`攻擊 ${buffAtk(u)}　血量 ${u.hp}/${u.max}` + (effDef(u)?`　防禦 ${effDef(u)}`:''));
  L.push(`射程 ${u.rng}　速度 ${u.spd}` + (u.spd===0?'（不能移動）':''));
  (u.kw||[]).forEach(k=>{ if(KW_TEXT[k]) L.push('· '+KW_TEXT[k]); });
  if(u.shield) L.push('· 目前持有聖盾');
  if(u.sick) L.push('· 本回合剛部署，不能行動');
  else{
    if(!canMove(u)&&u.spd>0) L.push('· 本回合已移動');
    if(!canAttack(u)) L.push('· 本回合已攻擊');
  }
  return L.join(String.fromCharCode(10));
}

/* 顯示用：不含「對特定目標的剋制加成」，但包含本回合的增益（例如齊射命令） */
function buffAtk(u){
  return u.atk + (u.buff||0)
    + ((G[u.owner]&&G[u.owner].rangedBuff&&u.rng>=2) ? G[u.owner].rangedBuff : 0);
}
function atkPower(u,t){
  let a=u.atk+(u.buff||0);
  if(t) a+=counterBonus(u,t);
  if(G[u.owner].rangedBuff&&u.rng>=2) a+=G[u.owner].rangedBuff;
  return a;
}
/* 近戰（射程 1）攻擊會被反擊；遠程單位攻擊不受反擊 */
function attack(u,t){
  fxImpact=fxAttack(u,t);
  const cb=counterBonus(u,t);
  say(`${CARDS[u.card].n} 攻擊 ${CARDS[t.card].n}`
      + (cb>0?`　<b>剋制 +${cb}</b>（${KIND_NAME[u.kind]} 剋 ${KIND_NAME[t.kind]}）`:''));
  const power=atkPower(u,t);
  const hitRun = u.kw.includes('mobile') && u.moved;   // 打帶跑：機動單位移動後攻擊不受反擊
  const back = (u.rng===1 && !hitRun) ? atkPower(t,u) : 0;  // 反擊先算好，等同同時結算
  damage(t,power,u);
  if(hitRun&&u.rng===1) say(`　<b>打帶跑</b>：${CARDS[u.card].n} 不受反擊`);
  if(back>0){ say(`　<b>反擊！</b>`); fxImpact+=90; damage(u,back,t); }
  u.attacked=true;
}
function hitCastle(u){
  const a=atkPower(u,null)+(u.kw.includes('siege')?u.siege:0);   // 攻城：對城堡額外傷害
  const foe=other(u.owner);
  G[foe].hp-=a;
  u.attacked=true;
  fxCastle(u,foe,a);
  say(`<b>${CARDS[u.card].n} 直擊${nm(foe)}城堡 -${a}！</b>`);
  const el=foe==='P'?castleP:castleE; el.classList.add('hit'); setTimeout(()=>el.classList.remove('hit'),350);
}

/* ---------- 行動額度：每回合可「移動一次 + 攻擊一次」 ---------- */
function canMove(u){ return u.hp>0 && !u.sick && !u.moved && u.spd>0; }
function canAttack(u){ return u.hp>0 && !u.sick && !u.attacked; }
function canAct(u){ return canMove(u)||canAttack(u); }

/* 可移動到的格子。每格附帶 off 旗標：抵達它是否用到了「非直線前進」的步伐（換線或後退）。
   一般兵種只要換線或後退，本回合就無法攻擊；蒙古的「機動」單位不受此限。 */
function reachable(u){
  if(!canMove(u)) return [];
  const d=dir(u.owner), seen=new Set([u.lane+','+u.col]), out=[];
  let frontier=[{lane:u.lane,col:u.col,off:false}];
  for(let step=0;step<u.spd;step++){
    const next=[];
    const add=(lane,col,off)=>{
      if(lane<0||lane>=LANES||col<0||col>=COLS) return;
      const k=lane+','+col;
      if(seen.has(k)||unitAt(lane,col)) return;
      seen.add(k); const c={lane,col,off}; out.push(c); next.push(c);
    };
    // 先展開「直行前進」，確保純直線走得到的格子不會被誤標成需要付代價
    for(const p of frontier) add(p.lane,p.col+d,p.off);
    // 再展開「換線」與「後退」
    for(const p of frontier){
      add(p.lane-1,p.col,true); add(p.lane+1,p.col,true);
      add(p.lane,p.col-d,true);
    }
    frontier=next;
  }
  return out;
}
/* 這個單位「換線／後退」是否要付出『本回合不能攻擊』的代價 */
function offAxisCost(u){ return !u.kw.includes('mobile'); }
/* 攻擊距離：同一路每格算 1，**跨到鄰路要多花 1 點射程**（每差一路算 2）。
   這樣射程 2 的弓兵打得到鄰路的敵人（正側面），但近戰（射程 1）依然只能打同一路 ——
   三路各自為政的結構、以及「擋路」的意義才不會被全向攻擊瓦解。 */
function gridDist(a,b){ return Math.abs(a.col-b.col) + 2*Math.abs(a.lane-b.lane); }
/* 射程內的敵人：任何方向，含鄰路與後方。
   射程以格數計算，前後左右各算 1 格。 */
function attackTargets(u){
  if(!canAttack(u)) return [];
  return G.units.filter(o=>o.hp>0&&o.owner!==u.owner&&gridDist(u,o)<=u.rng);
}
/* 該路前方沒有敵人，且與城堡距離在射程內 → 可直擊城堡 */
function canHitCastle(u){
  return canAttack(u) && u.spd>0 && !enemyAhead(u) && distCastle(u)<=u.rng;
}
function moveUnit(u,lane,col){
  const cell=reachable(u).find(c=>c.lane===lane&&c.col===col);
  if(!cell) return false;
  const from=`${u.lane+1}路${u.col+1}格`;
  u.anim={lane:u.lane,col:u.col};        // 供畫面播放位移動畫
  const back = (col-u.col)*dir(u.owner) < 0;
  const off = cell.off;
  u.lane=lane; u.col=col; u.moved=true;
  say(`${CARDS[u.card].n} ${back?'後退':'移動'} ${from} → ${lane+1}路${col+1}格`);
  if(off && offAxisCost(u)){
    u.attacked=true;                      // 換線／後退後本回合放棄攻擊
    say(`　<b>${back?'後退':'換線'}</b>：${CARDS[u.card].n} 本回合無法攻擊`);
  }else if(off){
    say(`　<b>機動</b>：${CARDS[u.card].n} ${back?'後退':'換線'}後仍可攻擊`);
  }
  return true;
}

/* ---------- NPC 用：自動走一個單位（規則與玩家完全相同） ---------- */
function aiAct(u){
  if(u.hp<=0||u.sick) return;
  // 先看射程內有無敵人
  let t=attackTargets(u).sort((a,b)=>a.hp-b.hp)[0];
  if(t){ attack(u,t); return; }
  if(canHitCastle(u)){ hitCastle(u); return; }
  // 沒目標就往前推進，走完再嘗試攻擊
  const cells=reachable(u);
  if(cells.length){
    const d=dir(u.owner);
    const pen=c=>(c.off&&offAxisCost(u))?1:0;                   // 換線／後退要放棄攻擊，優先度降低
    cells.sort((a,b)=>pen(a)-pen(b)
      || ((b.col-u.col)*d)-((a.col-u.col)*d)                     // 盡量往前
      || laneThreat(a.lane,u.owner)-laneThreat(b.lane,u.owner)); // 同樣遠就挑敵人少的路
    moveUnit(u,cells[0].lane,cells[0].col);
  }
  t=attackTargets(u).sort((a,b)=>a.hp-b.hp)[0];
  if(t){ attack(u,t); return; }
  if(canHitCastle(u)) hitCastle(u);
}
function laneThreat(lane,side){
  return G.units.filter(o=>o.hp>0&&o.lane===lane&&o.owner!==side).length;
}
/* NPC 的全軍行動：由最前線往後依序執行 */
function aiResolve(side){
  G.units.filter(u=>u.owner===side&&u.hp>0)
    .sort((a,b)=> side==='P' ? b.col-a.col : a.col-b.col)
    .forEach(u=>{ if(u.hp>0) aiAct(u); });
  cleanup();
}
/* 回合結束：結算建築荊棘、清場、換手 */
function endOfTurn(side){
  G.units.filter(u=>u.owner===side&&u.hp>0&&u.thorns>0).forEach(b=>{
    G.units.filter(o=>o.hp>0&&o.owner!==side&&
      ((o.lane===b.lane&&Math.abs(o.col-b.col)===1)||(o.col===b.col&&Math.abs(o.lane-b.lane)===1)))
      .forEach(o=>{ say(`${CARDS[b.card].n} 的 <b>荊棘</b> 反擊 ${CARDS[o.card].n}`); damage(o,b.thorns,b); });
  });
  G[side].rangedBuff=0;
  G.units.filter(u=>u.owner===side).forEach(u=>u.buff=0);
  cleanup();
  if(side==='E') G.turn++;
  render();
  checkEnd();
}
function cleanup(){
  G.units.filter(u=>u.hp<=0).forEach(u=>say(`${CARDS[u.card].n} 陣亡`));
  G.units=G.units.filter(u=>u.hp>0);
}
function checkEnd(){
  if(G.over) return;
  if(G.P.hp<=0||G.E.hp<=0){
    G.over=true;
    const win=G.E.hp<=0 && G.P.hp>0;
    const gem = win?WIN_GEMS:LOSE_GEMS;
    save.gems+=gem; persist();
    bTitle.textContent = win?'⚔ 勝利！':'💀 敗北';
    bText.innerHTML = `${win?'敵方城堡陷落。':'你的城堡被攻破了。'}<br>獲得 💎${gem} 寶石（目前 💎${save.gems}）<br><br>去卡包商店擴充你的牌組吧。`;
    banner.classList.add('on');
    pendingAfterBanner=()=>go('menu');
  }
}
/* =========================================================
   攻擊特效
   ---------------------------------------------------------
   戰鬥邏輯是同步的（AI 與測試都依賴這點），所以動畫不能卡在中間。
   做法是：邏輯執行時只把「要播什麼」排進佇列，render() 之後才一次播放。
   這同時修掉一個舊問題 —— 先前的 flash() 在 render() 重建盤面後就失效了。
   ========================================================= */
let fxQueue=[], fxTime=0, fxImpact=0;
const FX_STEP=140;        // 同一批多次攻擊之間的間隔
const FX_FLIGHT=170;      // 箭矢飛行時間
const FX_SLASH=70;        // 刀光命中時間

function fxAttack(u,t){
  const ranged = u.rng>=2;
  fxQueue.push({k:ranged?'arrow':'slash', from:{lane:u.lane,col:u.col},
                to:{lane:t.lane,col:t.col}, t:fxTime});
  const impact = fxTime + (ranged?FX_FLIGHT:FX_SLASH);
  fxTime += FX_STEP;
  return impact;
}
function fxDamage(t,text){ fxQueue.push({k:'dmg', lane:t.lane, col:t.col, text, t:fxImpact}); }
function fxCastle(u,foe,dmg){
  const ranged=u.rng>=2;
  fxQueue.push({k:ranged?'arrow':'slash', from:{lane:u.lane,col:u.col}, castle:foe, t:fxTime});
  fxQueue.push({k:'dmg', castle:foe, text:'-'+dmg, t:fxTime+(ranged?FX_FLIGHT:FX_SLASH)});
  fxTime+=FX_STEP;
}
function fxDie(t){ fxQueue.push({k:'die', lane:t.lane, col:t.col, card:t.card, owner:t.owner, t:fxImpact+120}); }

/* 取得棋盤格子在畫面上的位置；取不到（例如無介面測試）就回傳 null */
function cellRect(lane,col){
  if(!board||!board.children||!board.children[lane]) return null;
  const cell=board.children[lane].children[col+1];   // 第 0 個是路線標籤
  if(!cell||typeof cell.getBoundingClientRect!=='function') return null;
  const r=cell.getBoundingClientRect();
  return {x:r.left+r.width/2, y:r.top+r.height/2};
}
function playFx(){
  const q=fxQueue; fxQueue=[]; fxTime=0;
  if(!q.length) return;
  const layer=document.getElementById('fx');
  if(!layer||typeof layer.appendChild!=='function'||!cellRect(0,0)) return;
  const castleRect=side=>{
    const el=document.getElementById(side==='P'?'castleP':'castleE');
    if(!el||typeof el.getBoundingClientRect!=='function') return null;
    const r=el.getBoundingClientRect();
    return {x:r.left+r.width/2, y:r.top+r.height/2};
  };
  q.forEach(e=>{
    const isShot = e.k==='arrow'||e.k==='slash';
    const to = e.castle ? castleRect(e.castle)
             : (isShot ? cellRect(e.to.lane,e.to.col) : cellRect(e.lane,e.col));
    if(!to) return;
    const el=document.createElement('div');
    el.style.animationDelay=e.t+'ms';
    if(e.k==='arrow'){
      const from=cellRect(e.from.lane,e.from.col); if(!from) return;
      const dx=to.x-from.x, dy=to.y-from.y;
      el.className='fx-arrow';
      el.style.left=from.x+'px'; el.style.top=from.y+'px';
      el.style.setProperty('--dx',dx+'px');
      el.style.setProperty('--dy',dy+'px');
      el.style.setProperty('--rot',(Math.atan2(dy,dx)*180/Math.PI)+'deg');
    }else if(e.k==='slash'){
      // 刀身是獨立子元素：從右上的一個點往左下「延伸」成線，而不是整條一起出現
      el.className='fx-slash';
      el.style.left=(to.x-32)+'px'; el.style.top=(to.y-32)+'px';
      const blade=document.createElement('i');
      blade.className='fx-blade';
      blade.style.animationDelay=e.t+'ms';
      el.appendChild(blade);          // animationend 會從子元素冒泡上來，仍會被移除
    }else if(e.k==='dmg'){
      el.className='fx-dmg'; el.textContent=e.text;
      el.style.left=to.x+'px'; el.style.top=(to.y-10)+'px';
    }else if(e.k==='die'){
      el.className='fx-die unit '+e.owner;
      el.textContent=CARDS[e.card].n;
      el.style.left=(to.x-38)+'px'; el.style.top=(to.y-29)+'px';
    }
    layer.appendChild(el);
    el.addEventListener('animationend',()=>el.remove());
  });
}

function flash(u){
  const el=document.querySelector('[data-u="'+u.id+'"]');
  if(el){ el.classList.add('hit'); setTimeout(()=>el.classList.remove('hit'),350); }
}

/* ---------- 英雄技能 ---------- */
function useHero(){
  if(G.side!=='P'||G.P.heroUsed) return;
  const c=CIVS[G.P.civ];
  if(G.P.gold<c.skCost){ hint.textContent='金幣不足'; return; }
  if(G.P.civ==='brit'){ pushUndo(); G.P.gold-=c.skCost; G.P.heroUsed=true; G.P.rangedBuff=1;
    say('<b>齊射命令</b>：本回合遠程單位攻擊 +1'); render(); return; }
  if(G.P.civ==='teuton'){ G.mode={type:'hero',need:'buildingOrCastle'}; hint.textContent='選擇一個建築或你的城堡回血 3'; render(); return; }
  if(G.P.civ==='france'){
    const list=G.units.filter(u=>u.owner==='P').sort((a,b)=>b.col-a.col);
    if(!list.length){ hint.textContent='場上沒有單位'; return; }
    pushUndo(); G.P.gold-=c.skCost; G.P.heroUsed=true; list[0].shield=true;
    say('<b>神聖庇護</b>：'+CARDS[list[0].card].n+' 獲得聖盾'); render(); return;
  }
  if(G.P.civ==='mongol'){ G.mode={type:'hero',need:'cav'}; hint.textContent='選擇一個友方騎兵立刻行動'; render(); return; }
}

/* =========================================================
   復原（Undo）
   ---------------------------------------------------------
   以整份 G 的深拷貝當快照。只允許復原到「本回合開始」為止 ——
   跨回合復原等於讓玩家看過 AI 的行動再反悔，那是作弊。
   ========================================================= */
let undoStack=[];
function cloneState(s){
  if(typeof structuredClone==='function') return structuredClone(s);
  // 後備方案：JSON 會切斷 selUnit 與 units 的參照關係，還原後用 id 重新接回
  const c=JSON.parse(JSON.stringify(s));
  c.selUnit = c.selUnit ? c.units.find(u=>u.id===c.selUnit.id)||null : null;
  return c;
}
function pushUndo(){
  if(G.side!=='P'||G.over) return;
  undoStack.push({state:cloneState(G), log:log.innerHTML});
  if(undoStack.length>60) undoStack.shift();
}
function undo(){
  if(G.side!=='P'||G.over||!undoStack.length) return;
  const snap=undoStack.pop();
  G=snap.state;
  log.innerHTML=snap.log;
  hint.textContent='已復原上一步';
  render();
}

/* ---------- 點擊互動 ---------- */
function clickCell(lane,col){
  if(G.side!=='P'||G.over) return;
  if(G.mode&&G.mode.type==='push'){
    if(G.P.front[lane]+G.E.front[lane]<COLS && col===G.P.front[lane]){
      pushUndo();
      doPush('P',lane); G.mode=null; hint.textContent=''; render();
    }
    return;
  }
  if(G.sel!==null){                       // 手上選了牌 → 部署
    pushUndo();
    if(playCard('P',G.sel,lane,col)) { G.sel=null; hint.textContent=''; render(); }
    else undoStack.pop();                 // 沒打成就把快照收回
    return;
  }
  if(G.selUnit){                          // 選了單位 → 移動
    const u=G.selUnit;
    if(reachable(u).some(c=>c.lane===lane&&c.col===col)){
      pushUndo();
      moveUnit(u,lane,col);
      if(!canAct(u)) G.selUnit=null;      // 行動額度用完就取消選取
      render();
    }
  }
}
function clickUnit(u){
  if(G.side!=='P'||G.over) return;
  if(G.mode&&G.mode.type==='push'){ clickCell(u.lane,u.col); return; }
  if(G.mode&&G.mode.type==='hero'){
    if(G.mode.need==='cav'&&u.owner==='P'&&u.tags.includes('騎兵')){
      pushUndo(); G.P.gold-=CIVS.mongol.skCost; G.P.heroUsed=true; G.mode=null; hint.textContent='';
      u.moved=false; u.attacked=false; u.sick=false; G.selUnit=u;
      say('<b>疾風突襲</b>：'+CARDS[u.card].n+' 可以再行動一次'); render(); return;
    }
    if(G.mode.need==='buildingOrCastle'&&u.owner==='P'&&u.kw.includes('building')){
      pushUndo(); G.P.gold-=CIVS.teuton.skCost; G.P.heroUsed=true; G.mode=null; hint.textContent='';
      u.hp=Math.min(u.max,u.hp+5); say('<b>加固城防</b>：'+CARDS[u.card].n+' 回復 5'); render(); return;
    }
    return;
  }
  if(G.sel!==null){                       // 法術指定目標
    const id=G.P.hand[G.sel];
    if(CARDS[id].type==='spell'){
      pushUndo();
      if(playCard('P',G.sel,0,0,u)){ G.sel=null; hint.textContent=''; render(); }
      else undoStack.pop();
    }
    return;
  }
  if(u.owner==='P'){                      // 選取／取消選取自己的單位
    if(!canAct(u)){ hint.textContent=u.sick?'該單位本回合剛部署，還不能行動':'該單位本回合已行動完畢'; render(); return; }
    G.selUnit = (G.selUnit===u ? null : u);
    hint.textContent = G.selUnit ? '綠框=前進　黃框=換線/後退（本回合放棄攻擊）　紅框=攻擊' : '';
    render(); return;
  }
  // 點敵方單位 → 用已選取的單位攻擊
  if(!G.selUnit){ hint.textContent='請先點選一個自己的單位'; render(); return; }
  const me=G.selUnit;
  if(attackTargets(me).includes(u)){
    pushUndo();
    attack(me,u);
    cleanup();
    if(me.hp<=0||!canAct(me)) G.selUnit=null;
    render(); checkEnd(); return;
  }
  // 打不到 → 告訴玩家為什麼
  const nmA=CARDS[me.card].n, nmB=CARDS[u.card].n;
  if(!canAttack(me))       hint.textContent=`${nmA} 本回合已經攻擊過了`;
  else hint.textContent=`${nmB} 距離 ${gridDist(me,u)} 格，超出 ${nmA} 的射程 ${me.rng}`;
  render();
}
function clickCastle(side){
  if(!G||G.side!=='P'||G.over) return;
  if(G.mode&&G.mode.type==='hero'&&G.mode.need==='buildingOrCastle'&&side==='P'){
    pushUndo(); G.P.gold-=CIVS.teuton.skCost; G.P.heroUsed=true; G.mode=null; hint.textContent='';
    G.P.hp=Math.min(CASTLE_HP,G.P.hp+2); say('<b>加固城防</b>：城堡回復 2'); render(); return;
  }
  if(side==='E'&&G.selUnit&&canHitCastle(G.selUnit)){
    pushUndo();
    hitCastle(G.selUnit);
    if(!canAct(G.selUnit)) G.selUnit=null;
    render(); checkEnd();
  }
}

/* =========================================================
   兵種相剋表
   ---------------------------------------------------------
   內容由 COUNTER_TABLE 推導，不另外寫死 —— 改相剋規則時這裡會自動跟上。
   選取單位後會高亮「它剋誰」與「誰剋它」，讓它從靜態說明變成當下的決策輔助。
   ========================================================= */
const NORMAL_KINDS=['I','C','R'];
function counterRows(){
  const tri=[], siegeSet=new Set();
  Object.keys(COUNTER_TABLE).forEach(a=>{
    COUNTER_TABLE[a].forEach(b=>{
      const an=NORMAL_KINDS.includes(a), bn=NORMAL_KINDS.includes(b);
      if(an&&bn) tri.push([a,b]);
      else siegeSet.add((an?'*':a)+'>'+(bn?'*':b));   // 一般單位合併成一列
    });
  });
  const siege=[...siegeSet].map(s=>s.split('>'));
  return {tri, siege};
}
let codexOpen = true;
function toggleCodex(){ codexOpen=!codexOpen; renderCodex(); }
function kindLabel(k){ return k==='*' ? '🗡🐎🏹 一般單位' : KIND_NAME[k]; }
function renderCodex(){
  const el=document.getElementById('codex');
  if(!el||typeof el.appendChild!=='function') return;
  const sel=G&&G.selUnit&&G.selUnit.hp>0?G.selUnit:null;
  const k=sel?sel.kind:null;
  const {tri,siege}=counterRows();
  const row=([a,b])=>{
    const match=k&&(a===k||(a==='*'&&NORMAL_KINDS.includes(k)));
    const beaten=k&&(b===k||(b==='*'&&NORMAL_KINDS.includes(k)));
    return `<div class="row${match?' on':''}${beaten?' weak':''}">`
      + `<span>${kindLabel(a)}</span><span class="arrow">剋</span><span>${kindLabel(b)}</span></div>`;
  };
  el.className='codex'+(codexOpen?'':' mini');
  el.innerHTML =
    `<div class="head"><b>兵種相剋 +${COUNTER_BONUS}</b>`
    + `<span class="tgl" title="收合／展開">${codexOpen?'▾':'▸'}</span></div>`
    + (codexOpen ? `<div class="body">
        <div class="sec">兵種三角</div>${tri.map(row).join('')}
        <div class="sec">攻城三角</div>${siege.map(row).join('')}
        <div class="note">${sel?'高亮 = 目前選取單位的相剋關係':'選取單位後會標出相關的相剋'}</div>
      </div>` : '');
  el.onclick=toggleCodex;
}

/* =========================================================
   渲染
   ========================================================= */
function render(){
  if(!G) return;
  const S=G.P;
  goldTxt.textContent=`🪙 ${S.gold} / ${S.max}`;
  deckTxt.textContent=`牌庫 ${S.deck.length}`;
  php.textContent=G.P.hp; ehp.textContent=G.E.hp;
  turnInfo.textContent=`回合 ${G.turn} · ${G.side==='P'?'你的回合':'敵方回合'}`;
  villGold.disabled = G.side!=='P'||S.villDone||S.max>=GOLD_MAX;
  villLand.disabled = G.side!=='P'||S.villDone||!canPush('P');
  const hc=CIVS[S.civ];
  heroBtn.textContent=`✦ ${hc.sk}（${hc.skCost}金）`;
  heroBtn.title=hc.skT;
  heroBtn.disabled = G.side!=='P'||S.heroUsed||S.gold<hc.skCost;
  // 增益狀態用獨立欄位顯示，不要蓋掉 hint 的操作說明
  buffTxt.style.display = S.rangedBuff>0 ? 'block' : 'none';
  if(S.rangedBuff>0) buffTxt.textContent=`✦ 齊射命令生效中：遠程 +${S.rangedBuff}`;
  endBtn.disabled = G.side!=='P';
  undoBtn.disabled = G.side!=='P'||G.over||!undoStack.length;
  undoBtn.textContent = undoStack.length ? `↶ 復原 (${undoStack.length})` : '↶ 復原';
  castleP.classList.toggle('tg', !!(G.mode&&G.mode.need==='buildingOrCastle'));

  // 盤面
  const sel=G.selUnit&&G.selUnit.hp>0?G.selUnit:null;
  if(G.selUnit&&!sel) G.selUnit=null;
  const moves = sel? reachable(sel) : [];
  const targets = sel? attackTargets(sel) : [];
  castleE.classList.toggle('tg', !!(sel&&canHitCastle(sel)));
  const spellSel = (G.sel!==null&&G.side==='P') ? CARDS[G.P.hand[G.sel]] : null;

  board.innerHTML='';
  for(let l=0;l<LANES;l++){
    const row=document.createElement('div'); row.className='lane';
    const lb=document.createElement('div'); lb.className='lbl'; lb.textContent=(l+1); row.appendChild(lb);
    for(let c=0;c<COLS;c++){
      const cell=document.createElement('div'); cell.className='cell';
      if(ownsCell('P',l,c)) cell.classList.add('pT');
      if(ownsCell('E',l,c)) cell.classList.add('eT');
      if(G.mode&&G.mode.type==='push'&&c===G.P.front[l]&&G.P.front[l]+G.E.front[l]<COLS)
        cell.classList.add('push');
      const u=unitAt(l,c);
      if(u){
        const ue=document.createElement('div');
        ue.className='unit '+u.owner; ue.dataset.u=u.id;
        const cd=CARDS[u.card];
        if(u===sel) ue.classList.add('sel');
        if(u.owner==='P'&&G.side==='P'){
          if(u.sick) ue.classList.add('sick');
          else if(!canAct(u)) ue.classList.add('done');
          else ue.classList.add('ready');   // 不論是否已選取其他單位，都持續標示「還能行動」
        }
        // 標示「還剩什麼行動」：移=只能移動（攻擊已用掉）　攻=只能攻擊（已移動過）　✓=全部用完
        let badge='';
        if(u.sick) badge='💤';
        else if(u.owner==='P'&&G.side==='P'){
          if(!canAct(u)) badge='✓';
          else if(!canAttack(u)) badge='移';
          else if(!canMove(u)) badge='攻';
        }
        const cbTag = (sel&&targets.includes(u)&&counterBonus(sel,u)>0)
          ? `<div class="ctr">剋 +${counterBonus(sel,u)}</div>` : '';
        ue.innerHTML=`<div>${u.kind?KIND_NAME[u.kind][0]:''}${cd.n}</div>
          <div class="kw">${u.rng>1?'射'+u.rng:''} ${u.spd>1?'速'+u.spd:''} ${effDef(u)?'防'+effDef(u):''}</div>
          ${cbTag}
          ${u.shield?'<div class="shieldy">🛡</div>':''}
          ${badge?`<div class="badge">${badge}</div>`:''}
          <div class="s"><span class="a${buffAtk(u)>u.atk?' buff':''}">${buffAtk(u)}</span><span class="h">${u.hp}</span></div>`;
        if(targets.includes(u)) ue.classList.add('tg');
        if(G.mode&&G.mode.type==='hero'){
          if((G.mode.need==='cav'&&u.owner==='P'&&u.tags.includes('騎兵'))||
             (G.mode.need==='buildingOrCastle'&&u.owner==='P'&&u.kw.includes('building')))
            ue.classList.add('tg');
        }
        if(spellSel&&spellSel.type==='spell'){
          const sp=spellSel.target;
          if((sp==='ally'&&u.owner==='P')||(sp==='enemy'&&u.owner==='E')||
             (sp==='allyCav'&&u.owner==='P'&&u.tags.includes('騎兵'))||
             (sp==='allyBuilding'&&u.owner==='P'&&u.kw.includes('building'))) ue.classList.add('tg');
        }
        if(u.anim){                          // 從舊位置滑到新位置
          const CW=90, CH=72;                // 格寬/高 + 間距，需與 style.css 一致
          ue.style.setProperty('--dx', (-(u.lane-u.anim.lane)*CW)+'px');
          ue.style.setProperty('--dy', ((u.col-u.anim.col)*CH)+'px');
          ue.classList.add('slide');
          u.anim=null;
        }
        ue.title = unitTip(u);
        ue.onclick=(e)=>{e.stopPropagation();clickUnit(u);};
        cell.appendChild(ue);
      }else{
        const mv=moves.find(m=>m.lane===l&&m.col===c);
        if(mv){ cell.classList.add('move');
          if(mv.off&&offAxisCost(sel)) cell.classList.add('lat');  // 換線／後退格：本回合會放棄攻擊
        }
        else if(spellSel&&spellSel.type!=='spell'&&ownsCell('P',l,c)&&spellSel.cost<=S.gold)
          cell.classList.add('drop');
      }
      cell.onclick=()=>clickCell(l,c);
      row.appendChild(cell);
    }
    board.appendChild(row);
  }
  renderCodex();
  if(debugOpen) renderDebug();
  playFx();

  // 手牌
  hand.innerHTML='';
  S.hand.forEach((id,i)=>{
    const el=cardEl(id, (CARDS[id].cost<=S.gold&&G.side==='P')?'playable':'dim');
    if(G.sel===i) el.classList.add('sel');
    el.onclick=()=>{
      if(G.side!=='P'||CARDS[id].cost>S.gold) return;
      G.mode=null;
      if(CARDS[id].type==='spell'&&!CARDS[id].target){ pushUndo(); playCard('P',i,0,0); render(); return; }
      G.sel = (G.sel===i?null:i);
      hint.textContent = G.sel===null?'':(CARDS[id].type==='spell'?'選擇法術目標':'點藍色領土的空格部署');
      render();
    };
    hand.appendChild(el);
  });
}

/* =========================================================
   除錯選單（F2）
   ---------------------------------------------------------
   原型階段的測試輔助。正式版把 index.html 的 #debugPanel、
   style.css 的 #debugPanel 區塊，以及這一段整個刪掉即可。
   ========================================================= */
let debugOpen=false;
function toggleDebug(){
  debugOpen=!debugOpen;
  const el=document.getElementById('debugPanel');
  if(!el||!el.classList) return;
  el.classList.toggle('on',debugOpen);
  renderDebug();
}
function inBattle(){
  const b=document.getElementById('battle');
  return !!(G && !G.over && b && b.classList && b.classList.contains('active'));
}
function renderDebug(){
  const st=document.getElementById('dbgState');
  if(st){
    const kinds=Object.keys(save.collection).filter(k=>save.collection[k]>0).length;
    const total=Object.values(save.collection).reduce((a,b)=>a+b,0);
    st.textContent=`💎 ${save.gems}　收藏 ${kinds} 種 / ${total} 張`
      + (inBattle()?`　｜ 對戰中：城堡 ${G.P.hp}–${G.E.hp}`:'　｜ 未在對戰');
  }
  const on=inBattle();
  const list=document.querySelectorAll('#debugPanel .dbgBattle');
  if(list&&list.forEach) list.forEach(b=>{ b.disabled=!on; });
}
function dbgAfterSave(){
  persist();
  if(document.getElementById('deckbuild').classList.contains('active')) openDeckbuild();
  renderDebug();
}
function dbgGems(n){ save.gems=n; dbgAfterSave(); }
function dbgCollection(mode){
  if(mode==='starter'){
    save.collection=starterCollection();
    save.decks={};                       // 舊牌組多半已不合法，直接清掉
  }else{
    const col={};
    Object.keys(CARDS).forEach(id=>col[id]=COPY_MAX);
    save.collection=col;
  }
  dbgAfterSave();
}
function dbgResetSave(){
  dialog('清空存檔？','寶石、收藏與所有牌組都會回到初始狀態，這個動作無法復原。',
    {confirm:true, okText:'清空', onYes:()=>{
      save=defaultSave(); persist();
      if(G) G.over=true;
      go('menu'); renderDebug();
    }});
}
function dbgCastle(side){
  if(!inBattle()) return;
  if(side==='P') G.P.hp=CASTLE_HP; else G.E.hp=1;
  say(`<b>[除錯]</b> ${side==='P'?'我方城堡回滿':'敵方城堡設為 1'}`);
  render(); renderDebug();
}
function dbgGold(){ if(!inBattle()) return; G.P.max=GOLD_MAX; G.P.gold=GOLD_MAX; say('<b>[除錯]</b> 金幣拉滿'); render(); }
function dbgDraw(){ if(!inBattle()) return; for(let i=0;i<3;i++) draw('P'); say('<b>[除錯]</b> 抽 3 張'); render(); }
function dbgLand(){
  if(!inBattle()) return;
  for(let l=0;l<LANES;l++) if(G.P.front[l]+G.E.front[l]<COLS) G.P.front[l]++;
  say('<b>[除錯]</b> 三路領土 +1'); render();
}
function dbgClearBoard(){ if(!inBattle()) return; G.units=[]; G.selUnit=null; say('<b>[除錯]</b> 清空盤面'); render(); }

/* =========================================================
   NPC
   ========================================================= */
function forwardOrder(side){
  const a=[]; for(let c=0;c<COLS;c++) a.push(c);
  return side==='P' ? a.reverse() : a;   // 各自從最前線往後找
}
function aiTurn(side){
  side = side||'E';
  if(!G||G.over) return;
  const S=G[side], foe=other(side);
  // ---- 村民抉擇 ----
  const pressure = G.units.filter(u=>u.owner===foe).length;
  if(S.max<7 && (G.turn<=3 || pressure<=2) && S.max<GOLD_MAX){
    S.max++; S.gold++; say(`${nm(side)}選擇 <b>開發</b>：金幣上限 → ${S.max}`);
  }else{
    let best=-1,bs=-99;
    for(let l=0;l<LANES;l++){
      if(S.front[l]+G[foe].front[l]>=COLS) continue;
      const sc = -laneThreat(l,side) + (3-S.front[l]);
      if(sc>bs){bs=sc;best=l;}
    }
    if(best>=0) doPush(side,best);
    else if(S.max<GOLD_MAX){ S.max++; S.gold++; say(`${nm(side)}選擇 <b>開發</b>：金幣上限 → ${S.max}`); }
  }
  S.villDone=true;
  // ---- 英雄技能 ----
  const hc=CIVS[S.civ];
  if(!S.heroUsed&&S.gold>=hc.skCost){
    if(S.civ==='brit'&&G.units.some(u=>u.owner===side&&u.rng>=2)){
      S.gold-=hc.skCost;S.heroUsed=true;S.rangedBuff=1;say(`${nm(side)}使用 <b>齊射命令</b>`);
    }else if(S.civ==='france'){
      const l=G.units.filter(u=>u.owner===side&&!u.shield)
        .sort((a,b)=> side==='P'? b.col-a.col : a.col-b.col);
      if(l.length){S.gold-=hc.skCost;S.heroUsed=true;l[0].shield=true;say(`${nm(side)}使用 <b>神聖庇護</b>`);}
    }else if(S.civ==='teuton'){
      const bld=G.units.filter(u=>u.owner===side&&u.kw.includes('building')&&u.hp<u.max)
        .sort((a,b)=>(a.hp/a.max)-(b.hp/b.max))[0];
      if(bld){ S.gold-=hc.skCost;S.heroUsed=true;bld.hp=Math.min(bld.max,bld.hp+5);
        say(`${nm(side)}使用 <b>加固城防</b>：${CARDS[bld.card].n} 回復 5`); }
      else if(S.hp<CASTLE_HP-1){ S.gold-=hc.skCost;S.heroUsed=true;S.hp=Math.min(CASTLE_HP,S.hp+2);
        say(`${nm(side)}使用 <b>加固城防</b>：城堡回復 2`); }
    }else if(S.civ==='mongol'){
      const cav=G.units.filter(u=>u.owner===side&&u.tags.includes('騎兵'))
        .sort((a,b)=> side==='P'? b.col-a.col : a.col-b.col)[0];
      if(cav){S.gold-=hc.skCost;S.heroUsed=true;say(`${nm(side)}使用 <b>疾風突襲</b>`);
        cav.moved=false;cav.attacked=false;cav.sick=false;aiAct(cav);cleanup();
        if(G[other(side)].hp<=0){checkEnd();if(G.over)return;}}
    }
  }
  // ---- 出牌 ----
  let guard=12;
  while(guard-->0){
    const playable=S.hand.map((id,i)=>({id,i})).filter(o=>CARDS[o.id].cost<=S.gold);
    if(!playable.length) break;
    playable.sort((a,b)=>CARDS[b.id].cost-CARDS[a.id].cost);
    let done=false;
    for(const o of playable){
      const c=CARDS[o.id];
      if(c.type==='spell'){
        let t=null;
        if(o.id==='heal') t=G.units.filter(u=>u.owner===side&&u.hp<u.max).sort((a,b)=>a.hp-b.hp)[0];
        else if(o.id==='repair') t=G.units.filter(u=>u.owner===side&&u.kw.includes('building')&&u.hp<u.max).sort((a,b)=>a.hp-b.hp)[0];
        else if(o.id==='blessing') t=G.units.filter(u=>u.owner===side&&(u.hp<u.max||!u.shield)).sort((a,b)=>b.max-a.max)[0];
        else if(o.id==='warhorn') t=G.units.filter(u=>u.owner===side&&canAttack(u)&&attackTargets(u).length).sort((a,b)=>b.atk-a.atk)[0];
        else if(o.id==='feign') t=G.units.filter(u=>u.owner===side&&u.moved&&!u.sick)[0];
        else if(o.id==='arrowstorm'||o.id==='bodkin') t=G.units.filter(u=>u.owner===foe).sort((a,b)=>b.atk-a.atk)[0];
        else if(o.id==='fireoil') t=G.units.filter(u=>u.owner===foe).sort((a,b)=>b.atk-a.atk)[0];
        else if(o.id==='raid') t=G.units.filter(u=>u.owner===side&&u.tags.includes('騎兵'))[0];
        if(o.id!=='levy'&&!t) continue;
        if(playCard(side,o.i,0,0,t)){done=true;break;}
      }else{
        let bl=-1,bc=-1,bs=-999;
        // 遠程單位放在後排（保住射程），近戰放在最前線
        const order = c.rng>=2 ? forwardOrder(side).slice().reverse() : forwardOrder(side);
        for(let l=0;l<LANES;l++){
          for(const col of order){
            if(!ownsCell(side,l,col)||unitAt(l,col)) continue;
            const sc = laneThreat(l,side)*3
                     - G.units.filter(u=>u.owner===side&&u.lane===l).length*2
                     + (side==='P'?col:COLS-1-col)*0.5;
            if(sc>bs){bs=sc;bl=l;bc=col;}
            break; // 只考慮該路最前面的空格
          }
        }
        if(bl<0) continue;
        if(playCard(side,o.i,bl,bc)){done=true;break;}
      }
    }
    if(!done) break;
  }
  render();
  setTimeout(()=>{
    if(G.over) return;
    aiResolve(side);
    render();
    if(G.over){ checkEnd(); return; }
    endOfTurn(side);
    if(G.over) return;
    beginTurn(other(side));
  },500);
}
