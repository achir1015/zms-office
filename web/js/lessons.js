/* 語音動態教學的課程內容（tools/make_voice.py 也會讀這個檔，用臺灣真人神經語音預先產生每一句的 MP3）。
 * do：開始講這一句之前先做的動作（home:首頁區塊、app:工具） */
window.ZO_LESSONS = [
  { id: 'start', title: '認識開始畫面', desc: '五個工具、新增、開啟、文件清單', steps: [
    { sel: '#home-main h1', do: 'home:home', say: '歡迎使用資料助秘文件office彙整！這是開始畫面，就像 Office 的首頁一樣。所有功能都免費，檔案也可以直接拿給 Microsoft Word、Excel、PowerPoint 使用。' },
    { sel: '#rail', do: 'home:home', say: '左邊這一排是工具：DataWord 寫文件、DataExcel 做試算表、DataPowerPoint 做簡報、DataPDF 看和註解 PDF、DataDiagram 畫流程圖。點一下就只看那個工具的文件。' },
    { sel: '#new-strip', do: 'home:home', say: '要做新的檔案，按上面的空白文件、空白活頁簿或空白簡報，輸入檔名後就會在新分頁打開。' },
    { sel: '#list-bar', do: 'home:home', say: '下面是文件清單，可以切換最近、我的文件、與我共用、已加星號、公司範本和資源回收筒。在文件上按兩下就能打開，按右邊的三個點有更多功能。' },
    { sel: '#tabs', do: 'home:home', say: '打開的文件會排在最上面的分頁，可以同時開好幾份，像瀏覽器一樣切換。' },
  ] },
  { id: 'open', title: '開啟電腦上的檔案', desc: 'Word、Excel、PowerPoint、PDF 檔', steps: [
    { sel: '#btn-open-pc', do: 'home:open', say: '要編輯電腦上原本就有的檔案，請按「開啟電腦上的檔案」。存檔時會直接寫回原來的位置，之後用 Microsoft Office 打開也完全正常。' },
    { sel: '#home-main .hint', do: 'home:open', say: '支援的格式很多：Word 的 DOCX、DOC，Excel 的 XLSX、CSV，PowerPoint 的 PPTX，還有 PDF、OpenDocument、RTF、網頁和電子書。也可以直接把檔案拖進這個視窗。' },
  ] },
  { id: 'edit', title: '編輯與儲存', desc: '功能區、儲存、自動儲存、版本記錄', steps: [
    { sel: '#tabs', do: 'home:home', say: '文件打開後，上方的功能區和 Office 很像：常用、插入、版面配置、參考資料、檢視，都在熟悉的位置。' },
    { sel: '#tabs', do: 'home:home', say: '按 Ctrl 加 S 或上方的「儲存」就會存檔。開啟「自動儲存」後，每次修改二十秒後會自動存好。每次存檔，前一版都會保留在「版本記錄」，隨時可以還原。' },
  ] },
  { id: 'ai', title: 'AI 助理', desc: '摘要、改寫、翻譯、公式、簡報大綱', steps: [
    { sel: '#rail [data-sec=ai]', do: 'home:home', say: '文件上方有「AI 助理」按鈕，可以幫您摘要、改寫、翻譯、校對、產生 Excel 公式和簡報大綱。可以選免費的服務，也可以填入自己的付費金鑰，例如 Claude、ChatGPT 或 Gemini。AI 服務在左邊「AI 助理設定」裡設定。' },
  ] },
  { id: 'dev', title: '擴充功能：巨集與 Apps Script', desc: '和 Google Apps Script 相通', steps: [
    { sel: '#rail [data-sec=dev]', do: 'home:home', say: '開發人員可以在「擴充功能」寫巨集。這裡用的是 Google Apps Script 的寫法，例如 SpreadsheetApp 和 DocumentApp，同一段程式也可以貼回 Google 試算表或 Google 文件使用。' },
  ] },
  { id: 'share', title: '共用、權限與備份', desc: '公司多人使用', steps: [
    { sel: '#btn-user', do: 'home:home', say: '右上角的帳號選單裡有變更密碼、系統管理、檢查更新和建立桌面捷徑。系統管理員可以設定每個人能使用哪些工具，以及只能看還是可以修改。' },
    { sel: '#list-bar', do: 'home:home', say: '文件或資料夾可以設成「共用」，公司裡有權限的同事就會在「與我共用」看到。資料庫可以定期備份，文件庫資料夾也建議一起備份。' },
  ] },
];
