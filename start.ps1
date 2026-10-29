param([ValidateSet('run','inspect','status','open','test')][string]$Mode = 'run', [int]$Rounds = 100)
$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
$nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
if (-not $nodeCommand) { throw '未找到 Node.js，请安装 Node.js 22 或更新版本，并重新打开终端。' }
$nodePath = $nodeCommand.Source
$nodeVersion = (& $nodePath --version).Trim()
$nodeMajor = [int]($nodeVersion.TrimStart('v').Split('.')[0])
if ($nodeMajor -lt 22) { throw '请安装 Node.js 22 或更新版本。' }
Push-Location -LiteralPath $projectRoot
try {
  if ($Mode -eq 'test') { & $nodePath --test tests/domain.test.mjs tests/solver.test.mjs; exit $LASTEXITCODE }
  if ($Mode -ne 'status') {
    $configuration = Get-Content -LiteralPath (Join-Path $projectRoot 'config.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    $localPath = Join-Path $projectRoot 'config.local.json'
    if (Test-Path -LiteralPath $localPath) {
      $localConfiguration = Get-Content -LiteralPath $localPath -Raw -Encoding UTF8 | ConvertFrom-Json
      foreach ($property in $localConfiguration.PSObject.Properties) { $configuration | Add-Member -MemberType NoteProperty -Name $property.Name -Value $property.Value -Force }
    }
    $browserReady = $false
    try { $null = Invoke-RestMethod -Uri ($configuration.cdpUrl.TrimEnd('/') + '/json/version') -TimeoutSec 2; $browserReady = $true } catch {}
    if (-not $browserReady) {
      $endpoint = [uri]$configuration.cdpUrl
      if ($endpoint.Host -notin @('127.0.0.1','localhost')) { throw '请先启动 config 中指定的浏览器连接服务。' }
      $edgePath = Join-Path ${env:ProgramFiles(x86)} 'Microsoft\Edge\Application\msedge.exe'
      if (-not (Test-Path -LiteralPath $edgePath)) { $edgePath = Join-Path $env:ProgramFiles 'Microsoft\Edge\Application\msedge.exe' }
      if (-not (Test-Path -LiteralPath $edgePath)) { $edgePath = Join-Path $env:LOCALAPPDATA 'Microsoft\Edge\Application\msedge.exe' }
      if (-not (Test-Path -LiteralPath $edgePath)) { throw '未找到 Microsoft Edge，请先安装。' }
      $profilePath = Join-Path $projectRoot 'browser-profile'
      # Visible because first-time login needs user interaction.
      Start-Process -FilePath $edgePath -ArgumentList @('--remote-debugging-address=127.0.0.1',"--remote-debugging-port=$($endpoint.Port)","--user-data-dir=`"$profilePath`"",'--no-first-run',$configuration.courseUrl) -WindowStyle Normal
      for ($attempt=0; $attempt -lt 30; $attempt++) {
        Start-Sleep -Seconds 1
        try { $null = Invoke-RestMethod -Uri ($configuration.cdpUrl.TrimEnd('/') + '/json/version') -TimeoutSec 1; $browserReady = $true; break } catch {}
      }
      if (-not $browserReady) { throw '无法连接专用 Edge，请检查端口占用。' }
    }
    Write-Host '请在项目专用 Edge 中登录智慧树并进入课程首页。已登录时会直接继续。'
    & $nodePath cli.mjs wait-login
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  }
  if ($Mode -eq 'run') { & $nodePath cli.mjs run "--rounds=$Rounds" } else { & $nodePath cli.mjs $Mode }
  exit $LASTEXITCODE
} finally { Pop-Location }
