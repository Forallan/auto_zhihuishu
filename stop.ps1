$ErrorActionPreference = 'Stop'
$dataPath = Join-Path $PSScriptRoot 'data'
New-Item -ItemType Directory -Path $dataPath -Force | Out-Null
Set-Content -LiteralPath (Join-Path $dataPath 'STOP') -Value ([DateTime]::UtcNow.ToString('o'))
Write-Host '已发出停止请求；当前浏览器和进度会保留。'
