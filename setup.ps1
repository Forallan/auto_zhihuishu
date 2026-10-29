$ErrorActionPreference = 'Stop'
if (-not (Get-Command node.exe -ErrorAction SilentlyContinue)) { throw '请先安装 Node.js 22 或更新版本，重新打开终端后再运行 setup.cmd。' }
$npmCommand = Get-Command npm.cmd -ErrorAction SilentlyContinue
if (-not $npmCommand) { throw '未找到 npm，请使用包含 npm 的 Node.js 安装包。' }
Push-Location -LiteralPath $PSScriptRoot
try {
  & $npmCommand.Source ci
  if ($LASTEXITCODE -ne 0) { throw '依赖安装失败，请检查终端中的网络或版本错误。' }
  & $npmCommand.Source test
  if ($LASTEXITCODE -ne 0) { throw '离线检查失败，请保存已脱敏的错误信息。' }
  Write-Host '安装完成。双击 start.cmd 启动，在项目专用 Edge 中使用自己的账号登录。'
} finally { Pop-Location }
