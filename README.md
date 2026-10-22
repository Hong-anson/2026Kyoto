# 2026Kyoto

# 楓旅 · 京都奈良賞楓行程初版

Node.js 22+，不需要第三方套件、API 金鑰或安裝依賴。

```sh
cd /workspace/2026Kyoto
npm start
```

預設埠 3000，可使用 PORT 調整。日期與三日行程為可調整的範例，並非已確認旅行日期。行程選擇與觀測資料儲存在目前瀏覽器。

## 已實作

- 京都兩日、奈良一日的範例行程，手機版與桌面版。
- 景點注意事項、開放時間說明、官方票務與預約連結。
- Google Maps 景點搜尋、站間大眾運輸與整日路線連結（以 Maps 實際支援的路線與交通模式為準）。
- 紅葉觀測匯入、時間與來源驗證，超過 24 小時自動視為過期。
- 青葉／落葉／未知／過期時的同區備案，優先推薦新鮮轉紅或見頃觀測；使用者一鍵替換並更新路線。

## 尚待串接的真實資料

本版**沒有即時紅葉資料供應商，也沒有即時人潮 API**，不會把示範資料或地圖連結描述為即時監測。更新按鈕只重新檢查已匯入觀測的時效。人潮連到 Maps，由使用者確認是否有熱門程度資料。未查證當年度營業時間、票價及預約規則，故提供官方入口與保守說明。

正式串接需要具合法使用權的資料來源、更新頻率、涵蓋景點、授權方式與伺服器排程；目前可從「下載觀測格式」取得 JSON 格式後匯入：

```json
[{"id":"tofukuji","status":"未知","observedAt":"2026-10-22T08:00:00Z","sourceUrl":"https://tofukuji.jp/"}]
```

狀態支援：青葉、轉黃、轉紅、見頃、落葉、未知。來源必須 HTTPS，時間不可超過現在五分鐘。匯入會取代目前觀測集合。景點 ID：tofukuji、sennyuji、kiyomizu、eikando、nanzenji、bishamondo、nara、kasuga、isuien、yoshikien。

Google Fonts 為選用，無網路時使用系統字型。

## GitHub Pages

在 GitHub Settings → Pages 選擇 Deploy from a branch，Branch 選 main，資料夾選 / (root) 並儲存。網站入口會轉往 public/index.html，不需要 Node.js 伺服器。
