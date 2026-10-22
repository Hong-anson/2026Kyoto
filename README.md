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
- Google Maps 景點搜尋、站間大眾運輸，以及包含中途站的整日步行總覽。多站大眾運輸未獲 Maps 可靠支援，請逐站導航。
- 紅葉觀測匯入、時間與來源驗證，超過 24 小時自動視為過期。
- 青葉／微黃／落葉／未知／過期時的地區備案，優先推薦新鮮轉紅或見頃觀測；使用者一鍵替換並更新路線。

## 尚待串接的真實資料

專案已預設接上你部署的公開 Google Sheets 橋接器，實際取得 `version:1`、13 筆 `not_configured`；**目前仍沒有真實景點觀測，也沒有即時人潮 API**。App 可自動讀取試算表與 Open-Meteo 氣象；更新按鈕會重新讀取來源並檢查資料時效，不會把未知楓況設成青葉。人潮連到 Maps，由使用者確認是否有熱門程度資料。未查證當年度營業時間、票價及預約規則，故提供官方入口與保守說明。

正式串接需要具合法使用權的資料來源、更新頻率、涵蓋景點、授權方式與伺服器排程；目前可從「下載觀測格式」取得 JSON 格式後匯入：

```json
[{"id":"tofukuji","status":"未知","observedAt":"2026-10-22T08:00:00Z","sourceUrl":"https://tofukuji.jp/"}]
```

狀態支援：青葉、轉黃、轉紅、見頃、落葉、未知。來源必須 HTTPS，時間不可超過現在五分鐘。匯入會取代目前觀測集合。景點 ID：tofukuji、sennyuji、kiyomizu、eikando、nanzenji、bishamondo、nara、kasuga、isuien、yoshikien、shogunzuka、gioji、jojakkoji。

Google Fonts 為選用，無網路時使用系統字型。

## GitHub Pages

在 GitHub Settings → Pages 選擇 Deploy from a branch，Branch 選 main，資料夾選 / (root) 並儲存。網站入口會轉往 public/index.html，不需要 Node.js 伺服器。

## 互動功能更新

- 每張景點卡提供手動楓況選擇，與匯入來源分開顯示。手動狀態優先，選「使用匯入資料／待確認」可解除覆寫。初始狀態不預設虛構楓況。
- 當日見頃統計只計算 24 小時內記錄，並區分手動與匯入筆數。
- 備案直接展開在卡片下方；新增將軍塚青龍殿、祇王寺與常寂光寺作為候選。排序先考慮新鮮轉紅／見頃記錄，再考慮區域與狀態偏好。這些偏好不是景點已見頃的證據，跨區移動需重新確認交通。
- 一鍵替換會更新前後站連結；每個行程位置保留最初景點，可重新整理後還原。
- 每站可編輯預約序號，僅以未加密 localStorage 儲存在此瀏覽器、不跨裝置同步。卡片不直接公開序號；清空後儲存可刪除。記錄不代表預約成功。
- 日間與夜間資訊分開，2026 年度尚未查證的時間與規則維持「待官方確認」。
- 提供 Weathernews、JR 東海京都入口、景點照片搜尋、YouTube 直播搜尋與京都官方快適度資訊連結。不是已驗證的景點專屬鏡頭，也不保證查詢結果為即時資料；請確認拍攝地點、日期、直播狀態及官方預測／實測標示。奈良不顯示京都專屬入口。

驗證：已以 Chromium 實際操作手動狀態與統計、備案替換與還原、前後站連結、跨重新整理保存、序號編輯刪除、過期／新鮮觀測匯入、奈良頁籤、手機寬度與 JavaScript 錯誤檢查。

## 已整理的來源參考頁

已核對 9 個京都景點的 JR 東海專頁，App 的「查看來源參考頁」與「JR 東海景點資料」會直接連到各景點。這些頁面是參考連結，不能當作有效觀測；實際紅葉清單 `https://souda-kyoto.jp/guide/season/koyo/modal.json` 目前對應景點均為「選択なし」，照片標示 2025 年，也未提供本季完整觀測時間。

13 站網址清單見 [來源參考表](integrations/google-apps-script/source-references.tsv)。春日大社與依水園官方入口已回傳 HTTP 200；奈良公園仍遭網路代理阻擋，奈良縣／吉城園入口的上游 TLS 憑證驗證失敗。這些入口均不宣稱是可自動解析的當季楓況頁。你提供的 Apps Script 只有唯讀 API，本工作階段沒有 Google Sheets 寫入工具；可在自己的 Apps Script 執行一次 [fillSourceUrls](integrations/google-apps-script/fill-source-urls.gs)，只補空白來源網址，保留既有狀態、時間與已填來源。這項手動執行不需要更新唯讀網頁部署。

## 自動天氣與楓況同步

氣象與楓況分開更新：氣溫不會推導、覆寫或證明景點已變色。沒有可驗證的觀測時顯示「待確認」。目前真實日本網站解析器數量仍為 **0**。你部署的 Google Sheets 橋接器已確認可匿名讀取，並設為專案預設來源；目前 13 筆景點皆為 `not_configured`，沒有可驗證楓況。橋接接通與合成資料測試通過，不代表真實楓況來源已接通；天氣 API 的實際驗證另列於下方。

### 天氣

- `public/weather-feed.js` 記錄 13 個既有景點的區域座標，以一次批次請求讀取 Open-Meteo 的目前氣溫、天氣代碼，以及過去 **7 個完整日本日期**的每日最低溫，不含讀取當日。
- 畫面顯示模式時間、讀取時間與 Open-Meteo 出處。這是景點附近的**氣象模式網格資料**，不是景點現場測站實測，也不是樹葉觀測；歷史低溫同樣是模式資料。
- Node.js 的 `GET /data/weather.json` 使用 `lib/weather-service.js`，15 分鐘記憶體快取並合併併發請求。頁面開啟時、每 15 分鐘及按更新時讀取；若服務回傳 404（例如 GitHub Pages），瀏覽器才直接呼叫 Open-Meteo 公開 API。
- 首次失敗顯示無資料；已有資料時保留原始時間並顯示更新失敗。模式超過 3 小時或讀取超過 1 小時會標記過期。記憶體快取不跨伺服器重啟保留，瀏覽器另以 localStorage 保存最後有效資料。
- 「自動同步設定」可關閉天氣自動讀取，設定只存於目前瀏覽器。

使用 Open-Meteo 免費端點不需 API 金鑰；免費服務有頻率、用量與非商業用途限制，資料依 **CC BY 4.0** 標示來源。商業部署或增加用量前，請確認最新[服務條款](https://open-meteo.com/en/terms)、[授權與訂閱方案](https://open-meteo.com/en/pricing)及[API 文件](https://open-meteo.com/en/docs)。前端已保留 Open-Meteo 出處。

### Google Sheets 楓況橋接

已部署的公開網址保存在 [public/source-config.js](public/source-config.js)，供 Node.js 與靜態網頁共用；這是公開讀取設定，不含憑證。沒有填入可靠觀測的景點維持 `not_configured`。要改接另一份試算表，一次性設定、欄位與排程說明見 [Google Apps Script 串接說明](integrations/google-apps-script/README.md)，橋接程式為 [Code.gs](integrations/google-apps-script/Code.gs)。

可使用以下任一讀取方式：

- 預設不需再貼網址：Node.js 網站從同源 `/data/foliage.json` 取得資料；GitHub Pages 等靜態網站讀取共用預設橋接。若要個人覆寫，在 App 的「自動同步設定」貼上另一個公開可讀取的 `https://script.google.com/macros/s/部署ID/exec` 網址，再按「儲存並測試連線」。網址不可含帳密、查詢參數或片段；設定與最後有效資料只存在目前瀏覽器。留空並儲存即恢復網站內建來源。
- Node.js 的 `FOLIAGE_FEED_URL` 可覆寫共用預設網址；未設定時使用 `public/source-config.js`，明確設為空字串則停用後端預設橋接。後端讀取橋接器並提供同源 `GET /data/foliage.json`，避免依賴瀏覽器跨來源讀取。程式只接受指定 Apps Script 路徑及受限的 Google 重新導向，不需要額外秘密。

Google Sheets 不會自行生成真實楓況。人工查證填入時必須標記 `recordingMethod: manual`；只有已驗證且合法使用的上游 JSON 才適合啟用 Apps Script 的每 30 分鐘同步排程。來源未註明記錄方式則維持 `unspecified`，不宣稱自動擷取。這個專案尚未提供可直接抓取日本網站的解析器或現成上游網址，也未建立自動抓取來源的排程。

`public/foliage-feed.js` 驗證景點、原始狀態、含時區的觀測／讀取時間及可信 HTTPS 來源。目前接受 `weathernews.jp`、`souda-kyoto.jp`。後端 `lib/foliage-service.js` 使用 30 分鐘快取；前端每 15 分鐘讀取。這些都是**讀取頻率，不是來源觀測頻率**。失敗保留舊觀測與原始時間，超過 24 小時明示過期。個人手動覆寫優先；解除後，自動與匯入資料取觀測時間較新的記錄。

Apps Script 部署不保證所有瀏覽器環境均可跨來源讀取。若出現 CORS 或部署權限錯誤，改用上述 Node.js 後端，或排程產生並部署靜態快照；不要假設試算表可繞過來源網站的存取限制。

### 執行、驗證與靜態快照

一般 Node.js 22+ 可使用前述 `npm start`。目前雲端環境為 Node.js 24，外連需走已注入的 HTTPS 代理，請啟用此執行階段支援的設定：

```sh
cd /workspace/2026Kyoto
NODE_USE_ENV_PROXY=1 npm start
```

現有橋接網址已設為專案預設；若需覆寫，可於啟動前設定 `FOLIAGE_FEED_URL`。網址為公開設定，請勿放入憑證。`NODE_USE_ENV_PROXY` 依賴 Node.js 版本支援，不能假設所有符合最低版本的 Node.js 都支援。不要停用 TLS 驗證。

```sh
npm test
npm run sync:foliage
```

- `npm test` 使用明確的合成 fixture，涵蓋楓況驗證、橋接、氣象、快取、失敗保留與時間邊界。這些測試驗證程式契約，**不代表任何真實景點楓況或氣象已取得**。
- `npm run sync:foliage` 使用共用預設橋接或 `FOLIAGE_FEED_URL` 覆寫值，取得有效觀測時才產生 `public/data/foliage.json`。來源失敗或全無有效觀測時 exit 1（目前橋接全為 `not_configured`，因此屬此情況）；明確停用橋接且未配置其他來源時 exit 2。兩者都不覆寫既有快照。
- GitHub Pages 不執行 Node.js；楓況可讀部署好的快照或可跨來源讀取的橋接器，天氣則在端點 404 時直接讀取公開 API。快照更新與部署排程尚未配置，不能將舊快照描述為即時資料。

### 目前實際連線與尚待完成的部分

本次最初請求曾遭代理回傳 CONNECT 403；更新環境網路草稿並以 `NODE_USE_ENV_PROXY=1` 啟動後，已實際取得 Open-Meteo **13 個景點的有效天氣結果**，`/data/weather.json` 亦回傳 13 筆 `ok`。Weathernews 紅葉入口與 JR 東海網站也已實際回傳 HTTP 200。氣象測試 fixture 與這次真實 API 驗證是不同證據，不可將天氣接通解讀為真實楓況已接通。

環境網路草稿保存了 `api.open-meteo.com`、`weathernews.jp`、`souda-kyoto.jp`、`script.google.com` 與 `script.googleusercontent.com`。目前執行個體的連線已如上述驗證；保存草稿本身不等於發布，後續仍需在環境設定檢視、儲存並發布，以供新任務重用。

實際檢查 [Weathernews 東福寺頁面](https://weathernews.jp/koyo/spot/26111/)時，其狀態為「まだ」、標示「9月3日時点」，沒有完整觀測時間；見頃日期則是預測。這些資訊不能當成今日真實青葉。[利用規約](https://weathernews.jp/ip/kiyaku/)也限制將內容轉用到其他網站，尚未建立本 App 的再利用授權，因此沒有加入預設擷取器。真實自動楓況仍需取得可使用且提供可驗證觀測時間的來源。Google Apps Script 橋接器現已完成公開部署且回傳 13 筆合法的未配置景點資料；實際來源觀測與自動擷取排程仍未完成，不能聲稱已全自動同步真實楓況。

來源查核新增的網路草稿網域：`www3.pref.nara.jp`、`www.kasugataisha.or.jp`、`isuien.or.jp`、`www.pref.nara.jp`、`jr-central.co.jp`。春日大社、依水園與 JR 條款可讀；其餘查核限制如上。環境設定仍需檢視、儲存並發布。
