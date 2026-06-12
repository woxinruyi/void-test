# 按《开发环境操作手册》§2.1 / §2.2 的"正确方式"启动 Void Dev
# 关键点：使用 & 操作符（而非 Start-Process），让 $env: 变量正确继承到子进程
#         否则 Void 会以"生产模式"启动，不加载 out/ 目录的 JS，源码改动无效

$ErrorActionPreference = 'Continue'
Set-Location -Path 'i:\自动化执行\void-main'

$env:NODE_ENV = 'development'
$env:VSCODE_DEV = '1'
$env:VSCODE_CLI = '1'
$env:ELECTRON_ENABLE_LOGGING = '1'

# 确保日志目录存在
if (-not (Test-Path '.\.tmp')) { New-Item -ItemType Directory -Path '.\.tmp' | Out-Null }

Write-Host "[launch] starting Void Dev with VSCODE_DEV=1 ..."

& '.\.build\electron\Void.exe' `
  '.' `
  '--remote-debugging-port=9222' `
  '--user-data-dir' '.\.tmp\user-data-dev' `
  '--extensions-dir' '.\.tmp\extensions' `
  2>&1 | Tee-Object -FilePath '.\.tmp\void-runtime.log'
