# 沙盤傳說 SandTableLore

中世紀卡牌戰棋原型 —— **純 HTML / CSS / JS，無框架、無建置步驟**。

> Battleline 的三路推進盤面 ＋ 爐石的資源與構築循環 ＋ 世紀帝國的文明兵種相剋。

## 開始玩

用瀏覽器開 `index.html` 即可（以 `http://` 開啟才會保留存檔；`file://` 下 localStorage 可能被瀏覽器擋掉，遊戲仍可玩但進度不保留）。

操作提示：**Esc** 取消選取、**Ctrl+Z** 復原上一步、**F2** 開啟除錯選單。

網址加上 `?debug` 會顯示右下角的點擊探針與執行追蹤。

## 檔案結構

```
index.html          版面骨架（四個 .screen：主選單／組牌／商店／戰場）
style.css           樣式
data/rules.js       規則常數：盤面尺寸、城堡血量、相剋表、存檔版號、卡包售價
data/cards.js       卡牌資料 ＋ 中立清單 ＋ 起始收藏設定
data/civs.js        文明資料
game.js             引擎：戰鬥、AI、UI、存檔
tools/              開發工具（不影響遊戲執行）
tests/              測試套件
```

四個 JS 依 `rules → cards → civs → game` 的順序載入，共用同一個全域作用域。

## 開發

```bash
npm install          # 只為了測試用的 jsdom，遊戲本身不需要
npm run check        # 一鍵回歸：語法 → 資料驗證 → 51 項測試 → 平衡模擬
npm test             # 只跑測試
npm run sim          # 平衡模擬（每組配對 80 場，共 1280 場）
npm run sim -- 200 --trace   # 加大樣本並統計相剋觸發率
npm run decks        # 印出各文明的 AI 牌組
```

**改動任何規則或數值後請跑 `npm run check`。** 這個遊戲的規則彼此高度耦合
（相剋、反擊、射程、建築、疲勞），單一改動經常造成整體位移 ——
模擬器提供的是「改動前後的對照」，不是絕對強度的裁決。

設計說明與踩過的坑記錄在 [DESIGN.md](DESIGN.md)。
