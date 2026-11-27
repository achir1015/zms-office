; 資料助秘文件office彙整 — Windows 安裝程式（Inno Setup 6）
; 建置：python tools\build_windows.py（會先打包程式、整理編輯器元件，再呼叫 ISCC）
#ifndef AppVer
  #define AppVer "0.9.0"
#endif
#define AppName "資料助秘文件office彙整"
#define AppExe "ZMSOffice.exe"

[Setup]
AppId={{1B243FC0-84D5-46F0-8A7E-432D71D040D5}
AppName={#AppName}
AppVersion={#AppVer}
AppVerName={#AppName} {#AppVer}
AppPublisher=吳玉柱
AppCopyright=系統開發：吳玉柱 先生 與 Claude AI Opus 5.5
VersionInfoVersion={#AppVer}
DefaultDirName={autopf}\ZMSOffice
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=commandline dialog
OutputBaseFilename=ZMSOffice-Setup-{#AppVer}
SetupIconFile=icon.ico
UninstallDisplayIcon={app}\{#AppExe}
UninstallDisplayName={#AppName}
Compression=lzma2/ultra64
SolidCompression=yes
LZMANumBlockThreads=4
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0.17763
CloseApplications=force
RestartApplications=no
ChangesAssociations=yes

[Languages]
Name: "cht"; MessagesFile: "ChineseTraditional.isl"

[Tasks]
Name: "desktopicon"; Description: "建立桌面捷徑"; GroupDescription: "捷徑："
Name: "openwith"; Description: "加入 Word、Excel、PowerPoint、PDF 檔案的「開啟檔案」清單（不會改變預設程式）"; GroupDescription: "檔案："

[Files]
Source: "..\dist\ZMSOffice\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "mariadb\*"; DestDir: "{app}\mariadb"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\build\vendor\*"; DestDir: "{app}\vendor"; Flags: ignoreversion recursesubdirs createallsubdirs

[InstallDelete]
; 更新時先清掉舊版編輯器元件，避免新舊檔案混在一起
Type: filesandordirs; Name: "{app}\vendor"

[Icons]
Name: "{group}\{#AppName}"; Filename: "{app}\{#AppExe}"; IconFilename: "{app}\{#AppExe}"
Name: "{group}\資料與設定資料夾"; Filename: "{localappdata}\ZMSOffice"
Name: "{group}\解除安裝 {#AppName}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\{#AppExe}"; IconFilename: "{app}\{#AppExe}"; Tasks: desktopicon

[Dirs]
Name: "{localappdata}\ZMSOffice"

[Registry]
; 「開啟檔案」清單（Open with）：只加入選項，不搶預設程式
Root: HKA; Subkey: "Software\Classes\ZMSOffice.Document"; ValueType: string; ValueName: ""; ValueData: "{#AppName} 文件"; Flags: uninsdeletekey; Tasks: openwith
Root: HKA; Subkey: "Software\Classes\ZMSOffice.Document\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#AppExe},0"; Tasks: openwith
Root: HKA; Subkey: "Software\Classes\ZMSOffice.Document\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#AppExe}"" ""%1"""; Tasks: openwith
Root: HKA; Subkey: "Software\Classes\Applications\{#AppExe}"; ValueType: string; ValueName: "FriendlyAppName"; ValueData: "{#AppName}"; Flags: uninsdeletekey; Tasks: openwith
Root: HKA; Subkey: "Software\Classes\Applications\{#AppExe}\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#AppExe}"" ""%1"""; Tasks: openwith
#define Ext(E) 'Root: HKA; Subkey: "Software\Classes\.' + E + '\OpenWithProgids"; ValueType: string; ValueName: "ZMSOffice.Document"; ValueData: ""; Flags: uninsdeletevalue; Tasks: openwith'
#emit Ext("docx")
#emit Ext("doc")
#emit Ext("docm")
#emit Ext("dotx")
#emit Ext("odt")
#emit Ext("rtf")
#emit Ext("xlsx")
#emit Ext("xls")
#emit Ext("xlsm")
#emit Ext("ods")
#emit Ext("csv")
#emit Ext("pptx")
#emit Ext("ppt")
#emit Ext("pptm")
#emit Ext("ppsx")
#emit Ext("odp")
#emit Ext("pdf")
#emit Ext("epub")
#emit Ext("drawio")
#emit Ext("vsdx")

[Run]
Filename: "{app}\{#AppExe}"; Description: "立即開啟 {#AppName}"; Flags: nowait postinstall skipifsilent
; 程式內「版本更新」以靜默模式安裝後，自動重新開啟
Filename: "{app}\{#AppExe}"; Flags: nowait; Check: WizardSilent

[Messages]
cht.FinishedLabel=安裝完成。%n%nDataWord、DataExcel、DataPowerPoint、DataPDF、DataDiagram 都在同一個程式裡。%n使用者與設定存放在：%LOCALAPPDATA%\ZMSOffice%n文件預設存放在「文件」裡的「資料助秘文件office彙整」%n（更新或解除安裝都不會刪除資料，請記得定期備份）

[Code]
procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  if CurUninstallStep = usPostUninstall then
    if not UninstallSilent then
      MsgBox('程式已移除。您的文件與設定仍保留在：' + #13#10 + ExpandConstant('{localappdata}\ZMSOffice') + #13#10 + '以及「文件」資料夾裡的「資料助秘文件office彙整」。如確定不再需要，可自行刪除。', mbInformation, MB_OK);
end;
