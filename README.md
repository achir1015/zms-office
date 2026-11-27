# 資料助秘文件office彙整
<img width="800" height="600" alt="image" src="https://github.com/user-attachments/assets/b8c602fe-3dde-41c7-aae6-9c3455ed999f" />

<img width="800" height="600" alt="image" src="https://github.com/user-attachments/assets/aa6bce38-e0af-456a-8bfd-d9fec20df279" />
說明


https://github.com/user-attachments/assets/8c87f269-3076-4f11-92a7-58d5b29bd03f


免費的辦公室套件，一個程式裡有五個工具，介面和 Microsoft Office 相似，存出來的檔案可以直接用 Microsoft Word／Excel／PowerPoint 開啟：

| 工具 | 對應 | 主要格式 |
|---|---|---|
| **DataWord** | Word | DOCX、DOC、DOCM、DOTX、ODT、OTT、RTF、TXT、HTML、EPUB、FB2 |
| **DataExcel** | Excel | XLSX、XLS、XLSM、XLTX、ODS、OTS、CSV |
| **DataPowerPoint** | PowerPoint | PPTX、PPT、PPTM、PPSX、POTX、ODP、OTP |
| **DataPDF** | Acrobat | PDF 檢視、註解、填表、簽名（XPS、DJVU 檢視） |
| **DataDiagram** | Visio | 流程圖、組織圖、心智圖、UML（.drawio，可匯入 .vsdx，匯出 PNG／SVG／PDF） |

## 特色

- **文件庫＋使用者權限**：MariaDB 記錄文件、資料夾、共用、版本（每次儲存保留前一版，最多 30 版）；每個工具分開設定「檢視／編輯」權限；操作紀錄、備份還原。單一公司多人使用時，文件庫資料夾可設成網路磁碟。
- **直接編輯電腦上的檔案**：「開啟電腦上的檔案」存檔就寫回原位置；安裝時可加入檔案總管的「開啟檔案」清單（不改變預設程式）。
- **AI 助理**（免費與付費都可以）：Pollinations（免費、免金鑰）、Google Gemini、Groq、OpenRouter、Ollama（本機）、Anthropic Claude、OpenAI、DeepSeek、Mistral、自訂 OpenAI 相容服務。摘要、改寫、翻譯、校對、Excel 公式、資料分析、簡報大綱、AI 畫流程圖。
- **擴充功能（開發人員）**：錄製巨集、巨集管理，以及 **Google Apps Script 相容層**——`SpreadsheetApp`、`DocumentApp`、`SlidesApp`、`Logger`、`Ui.createMenu()`、`onOpen()` 寫法的程式可以直接在 DataExcel／DataWord／DataPowerPoint 執行，同一份程式碼也能貼回 Google 使用。
- **從 NotebookLM 產生簡報**：沿用「資料助秘 NotebookLM MCP 簡報」的指令格式與柔和插畫版型（含 3D 小圖示、講者備註）。
- **MCP 伺服器**（`ZMSOfficeMCP.exe`）：讓 Claude Desktop 等 AI 工具建立／讀取／修改 Word、Excel、PowerPoint 與流程圖。
- **匯出到資料助秘電子書翻頁**：Word／PowerPoint／PDF 轉成 PDF 後交給翻頁工具。
- **多語系**：繁體中文（預設）、简体中文、English、日本語、한국어、Tiếng Việt、Bahasa Indonesia、ไทย、Français、Deutsch、Español。
- **語音動態教學**（臺灣真人神經語音）、程式內更新、桌面捷徑。

## 下載與平台

| 平台 | 下載 |
|---|---|
| Windows 10／11 | [ZMSOffice-Setup-0.9.0.exe](https://github.com/achir1015/zms-office/releases/latest) |
| macOS 12 以上（Intel／Apple 晶片，已公證） | [ZMSOffice-0.9.0-mac.dmg](https://github.com/achir1015/zms-office/releases/latest) |
| 線上版（瀏覽器，不用安裝） | https://achir1015.github.io/zms-office/ |
| iPhone／iPad | 用 Safari 開 https://achir1015.github.io/zms-office/ios/ 線上安裝 |
| Android | [ZMSOffice-0.9.0-android.apk](https://github.com/achir1015/zms-office/releases/latest) |

電腦版有完整的帳號權限（MariaDB）、MCP 伺服器、直接編輯電腦上的檔案；線上版與手機版的文件存在該裝置的瀏覽器空間（IndexedDB），一位使用者、離線可用，匯出的檔案用分享選單存到「檔案」或傳出去。

## 開發

```powershell
python -m venv .venv
.\.venv\Scripts\pip install pywebview==6.2.1 pythonnet pymysql certifi python-docx openpyxl python-pptx anthropic pillow edge-tts opencc brotli playwright pyinstaller
.\.venv\Scripts\python tools\fetch_vendor.py      # 編輯器元件（約 600 MB，不進 git）
.\.venv\Scripts\python main.py --web 8730          # 瀏覽器開 http://127.0.0.1:8730/?k=dev
.\.venv\Scripts\python tools\build_windows.py      # 安裝檔 dist-installer\ZMSOffice-Setup-<版本>.exe
```

需要 `packaging/mariadb`（MariaDB 10.11 精簡版，同其他資料助秘系統）與 Inno Setup 6。

## 授權

本程式以 **GNU AGPL v3** 授權（因為內含 ONLYOFFICE 編輯器）。

- ONLYOFFICE Docs（sdkjs、web-apps，© Ascensio System SIA）— AGPL v3；離線建置與 x2t WebAssembly 取自 [ranuts/document](https://github.com/ranuts/document)（AGPL v3）
- draw.io（© JGraph）— Apache 2.0
- SheetJS — Apache 2.0；PptxGenJS、JSZip — MIT
- 資料助秘 NotebookLM MCP 簡報引擎 — MIT
- MariaDB — GPL v2；字型 Liberation、Noto、AR PL UKai 等各自的開源授權

Microsoft Office、Word、Excel、PowerPoint、Visio 是 Microsoft 的商標；Google Apps Script、NotebookLM 是 Google 的商標。本程式與它們沒有關係。

開發：吳玉柱 先生 與 Claude AI Opus 5.5
