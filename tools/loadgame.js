/* =========================================================
   共用載入器
   ---------------------------------------------------------
   遊戲是「無建置步驟的純瀏覽器程式」，四個 JS 共用同一個全域作用域。
   要在 Node 裡測試它，就得重現那個環境 —— 這支檔案負責這件事。

     source()   把四個檔依 index.html 的順序串成一份原始碼
     html()     把 css/js 全部內嵌進 index.html，供 jsdom 使用
     headless() 用假的 DOM 執行遊戲，回傳所有頂層函式與變數（給模擬器用）

   新增 data/*.js 時，把檔名加進 FILES 即可。
   ========================================================= */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const FILES = ['data/rules.js', 'data/cards.js', 'data/civs.js', 'game.js'];

function read(f) {
  return fs.readFileSync(path.join(ROOT, f), 'utf8').split('\r\n').join('\n');
}

function source() {
  return FILES.map(read).join('\n');
}

/* jsdom 用：外部檔全部內嵌，避免 jsdom 去解析相對路徑 */
function html() {
  let h = read('index.html')
    .replace(/<link rel="stylesheet"[^>]*>/, '<style>' + read('style.css') + '</style>');
  FILES.forEach(f => {
    h = h.replace(new RegExp('<script defer src="' + f.replace(/[.\/]/g, '\\$&') + '[^>]*><\\/script>'), '');
  });
  return h.replace('</body>', '<script>' + source() + '</script></body>');
}

/* 從原始碼掃出所有頂層宣告，讓 headless() 不必手動維護匯出清單 */
function topLevelNames(src) {
  const names = new Set();
  src.split('\n').forEach(line => {
    const m = line.match(/^(?:function|const|let|var)\s+([A-Za-z_$][\w$]*)/);
    if (m) names.add(m[1]);
  });
  return [...names];
}

/* 夠用的假 DOM：只實作遊戲會碰到的介面 */
function stubElement() {
  return {
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    style: { setProperty() {}, getPropertyValue() { return ''; }, removeProperty() {} },
    dataset: {}, lastChild: { textContent: '' },
    appendChild() {}, prepend() {}, insertAdjacentHTML() {}, remove() {},
    querySelector() { return null; }, querySelectorAll() { return []; },
    set innerHTML(v) {}, get innerHTML() { return ''; },
    set textContent(v) {}, get textContent() { return ''; },
    set title(v) {}, set disabled(v) {}, onclick: null,
  };
}

/* 遊戲用「id 當全域變數」存取 DOM，這裡把 index.html 裡的 id 全部掃出來補上 */
function elementIds() {
  const ids = [];
  const re = /id="([^"]+)"/g;
  let m;
  const h = read('index.html');
  while ((m = re.exec(h))) ids.push(m[1]);
  return ids;
}

function headless(extraGlobals) {
  const src = source();
  const store = {};
  const byId = n => (store[n] || (store[n] = stubElement()));
  const g = {
    document: {
      createElement: stubElement, getElementById: byId,
      querySelectorAll: () => [], querySelector: () => null,
      addEventListener() {}, readyState: 'complete', body: stubElement(),
    },
    getComputedStyle: () => ({ overflow: 'hidden' }),
    location: { search: '' },
    localStorage: { getItem: () => null, setItem() {} },
    setTimeout: () => {},          // 模擬器自己推進回合，不要非同步
    addEventListener() {},
    console,
  };
  elementIds().forEach(id => { g[id] = byId(id); });
  Object.assign(g, extraGlobals || {});
  g.window = g;

  const names = topLevelNames(src);
  const exportExpr =
    'return (function(){ const out={};' +
    names.map(n => `try{ out[${JSON.stringify(n)}]=${n}; }catch(e){}`).join('') +
    'Object.defineProperty(out,"G",{get:()=>G,set:v=>{G=v}});' +
    'return out; })();';

  const keys = Object.keys(g);
  return new Function(...keys, src + '\n' + exportExpr)(...keys.map(k => g[k]));
}

function hasJsdom() {
  try { require.resolve('jsdom'); return true; } catch (e) { return false; }
}

module.exports = { ROOT, FILES, source, html, headless, hasJsdom, stubElement };
