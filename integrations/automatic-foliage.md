# 真實楓況擷取與網站定時發布

工作流程為 `.github/workflows/refresh-foliage.yml`，GitHub Actions 顯示名稱為 **Refresh foliage and publish site**。它在 `main` 更新、手動執行，以及每小時第 17 分鐘啟動。排程由 GitHub 執行，可能延遲；這不是來源觀測頻率，也不是即時保證。

資料流程：日本來源 → `scripts/sync-foliage.js` → `public/data/foliage.json` → GitHub Pages → 網頁自動讀取。網站讀取部署好的 JSON，不要求每個瀏覽器直接擷取日本來源，也不依賴 Google 試算表代抓網站。

## 執行與保存

`prepare` 工作使用 Node.js 24；專案沒有第三方執行依賴，不需要安裝套件。它依序執行：

1. 從最新 `main` 取回程式和上次已保存的觀測快照。
2. `npm test` 驗證資料契約與解析器。
3. `node scripts/sync-foliage.js` 取得來源明示的狀態及日期。
4. 只在內容改變時提交 `public/data/foliage.json`，不改應用程式或其他使用者檔案。
5. 將網站檔案打包，交由 `deploy` 工作發布。

來源讀取失敗時，腳本保留先前有效記錄及原始觀測時間，並附上更新失敗提示。工作流程不會忽略腳本的非零退出碼：若既沒有新有效觀測，也沒有可保留的舊有效觀測，這次擷取失敗，不發布一份冒充成功的空資料。

快照提交使用 GitHub 提供的 `GITHUB_TOKEN`；由這個 token 推送的提交不會再次觸發一般工作流程，因此目前同一次執行會直接發布網站，不依賴「推送資料後再等另一輪 Pages 建置」。若其他人同時更新 `main`，普通 `git push` 會拒絕非 fast-forward 更新；不會強制覆寫。確認並存好該次使用者變更後，可手動重新執行，或等下一次每小時排程。

網站成品僅包含根目錄 `index.html`、`.nojekyll`、`public/` 及公開的 `integrations/google-apps-script/`。後端、測試、Git metadata 與 runner 憑證不放入網站 artifact。Apps Script `/exec` 網址是刻意公開的唯讀設定，不是密鑰。

## 首次啟用

儲存庫的 GitHub Pages 發布來源必須選 **GitHub Actions**（API 的 `build_type: workflow`）；由原本的 branch 發布方式切換後，執行：

```sh
gh workflow run refresh-foliage.yml --repo Hong-anson/2026Kyoto --ref main
```

這是由有權限的儲存庫使用者或目前已授權的發布工具執行；不需要在聊天中提供 token。儲存庫需允許工作流程使用 `contents: write` 儲存快照，並允許 `github-pages` 環境發布。若平台拒絕新增工作流程檔案，應補齊該整合的 workflow 權限，不要停用驗證或改用公開寫入 API。

手動查看最近執行與正式網站：

```sh
gh run list --repo Hong-anson/2026Kyoto --workflow refresh-foliage.yml --limit 5
gh run watch RUN_ID --repo Hong-anson/2026Kyoto --exit-status
```

完成標準是擷取及發布工作成功，且正式網站的 JSON／程式確實是此次版本；只完成提交或 artifact 上傳不表示已上線。

## 觀測時間與過期資料

擷取時間不會取代來源觀測時間。來源只標日期時，資料保留日期精度，不捏造時、分、秒。若來源目前仍顯示例如 9 月 3 日的舊狀態，新的每小時擷取仍只是「本次讀到的舊記錄」，不能描述為今天確認的楓況；網頁應顯示原始日期及過期提示。

所有外部 actions 均固定為從官方 repository tag 核對的完整 commit SHA。工作流程保留 HTTPS 與下載驗證，不設定停用 TLS 或允許任意重新導向。
