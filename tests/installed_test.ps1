# 測試已安裝的程式（不動使用者資料）：用暫存資料夾啟動安裝版的網頁模式，再跑 app_e2e.py
#   powershell -File tests\installed_test.ps1
$ErrorActionPreference = "Stop"
$exe = Join-Path $env:LOCALAPPDATA "Programs\ZMSOffice\ZMSOffice.exe"
$tmp = Join-Path $env:TEMP "zo-installed-test"
Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory $tmp | Out-Null
$env:ZO_DATA_DIR = $tmp
$env:ZO_KEY = "dev"
$p = Start-Process $exe -ArgumentList "--web", "8731" -PassThru
try {
  for ($i = 0; $i -lt 90; $i++) {
    try { $s = Invoke-RestMethod "http://127.0.0.1:8731/api/state?k=dev"; if ($s.data.ready) { break } } catch {}
    Start-Sleep -Milliseconds 700
  }
  Invoke-RestMethod -Method Post "http://127.0.0.1:8731/api/setup?k=dev" -ContentType "application/json" -Body '{"uid":"admin","name":"Admin","pw":"admin123"}' | Out-Null
  $sess = (Invoke-RestMethod -Method Post "http://127.0.0.1:8731/api/login?k=dev" -ContentType "application/json" -Body '{"uid":"admin","pw":"admin123"}').data.session
  $lib = (Join-Path $tmp "library").Replace("\", "/")
  Invoke-RestMethod -Method Post "http://127.0.0.1:8731/api/company?k=dev" -Headers @{"X-Session" = $sess} -ContentType "application/json" -Body ('{"name":"Test","out_dir":"' + $lib + '"}') | Out-Null
  & "$PSScriptRoot\..\.venv\Scripts\python.exe" -X utf8 "$PSScriptRoot\app_e2e.py" "http://127.0.0.1:8731"
} finally {
  Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
  Start-Sleep 2
  Get-CimInstance Win32_Process -Filter "Name='mariadbd.exe'" | Where-Object { $_.CommandLine -like "*zo-installed-test*" } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
}
