param([ValidateSet('Start', 'Stop', 'Status')][string]$Action = 'Status')
$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$runtimeRoot = Join-Path $projectRoot '.roomtune\game-trial'
$statePath = Join-Path $runtimeRoot 'process.json'
$trialUrl = 'http://127.0.0.1:5180'
$record = if (Test-Path -LiteralPath $statePath) { Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json } else { $null }
function Get-OwnedProcess($item) {
    if (!$item) { return $null }
    $candidate = Get-Process -Id $item.id -ErrorAction SilentlyContinue
    if (!$candidate -or $candidate.Path -ne $item.path -or $candidate.StartTime.ToUniversalTime().Ticks -ne [long]$item.startedTicks) { return $null }
    $details = Get-CimInstance Win32_Process -Filter "ProcessId = $($item.id)"
    if ($details.CommandLine -notmatch 'node_modules[\\/]wrangler[\\/]bin[\\/]wrangler\.js.*dev.*\.roomtune[\\/]game-trial[\\/]wrangler\.json') {
        throw 'Process command line differs; nothing stopped.'
    }
    return $candidate
}
$owned = Get-OwnedProcess $record
if ($Action -eq 'Status') {
    if ($owned) { Write-Output "Private game trial running: $trialUrl (PID $($owned.Id))" }
    else { Write-Output 'Private game trial stopped.' }
    exit 0
}
if ($Action -eq 'Stop') {
    if ($owned) {
        & taskkill.exe /PID $owned.Id /T /F | Out-Null
        if ($LASTEXITCODE -ne 0) { throw 'Could not stop private trial.' }
    }
    if (Test-Path -LiteralPath $statePath) { Remove-Item -LiteralPath $statePath }
    Write-Output 'Private game trial stopped. Public preview/tunnel and saved games unchanged.'
    exit 0
}
if ($owned) { Write-Output "Already running: $trialUrl"; exit 0 }
$nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
$nodePath = if ($nodeCommand) { $nodeCommand.Source } else { 'C:\nvm4w\nodejs\node.exe' }
if (!(Test-Path -LiteralPath $nodePath)) { throw 'Node.js is required.' }
# Fail on port conflicts rather than choosing another port or stopping another service.
$probe = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 5180)
try { $probe.Start() } finally { $probe.Stop() }
$created = $null
Push-Location $projectRoot
try {
    & $nodePath scripts/prepare-game-trial.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Build first with npm.cmd run build:game, then retry.' }
    $env:X_LOCAL_EXPLORER = 'false'
    $env:WRANGLER_LOG_PATH = Join-Path $runtimeRoot 'wrangler.log'
    $process = Start-Process -FilePath $nodePath -ArgumentList @(
        'node_modules/wrangler/bin/wrangler.js', 'dev', '--config', '.roomtune/game-trial/wrangler.json',
        '--local', '--ip', '127.0.0.1', '--port', '5180', '--inspector-port', '0',
        '--persist-to', '.roomtune/game-trial/state', '--log-level', 'warn'
    ) -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru `
      -RedirectStandardOutput (Join-Path $runtimeRoot 'stdout.log') `
      -RedirectStandardError (Join-Path $runtimeRoot 'stderr.log')
    $fresh = Get-Process -Id $process.Id -ErrorAction Stop
    $created = [pscustomobject]@{ id = $fresh.Id; path = $fresh.Path; startedTicks = $fresh.StartTime.ToUniversalTime().Ticks }
    $created | ConvertTo-Json | Set-Content -LiteralPath $statePath -Encoding UTF8
    $healthy = $false
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        $process.Refresh()
        if ($process.HasExited) { throw 'Private trial exited; inspect .roomtune/game-trial/stderr.log.' }
        try {
            $health = Invoke-RestMethod "$trialUrl/api/v1/system/health" -TimeoutSec 1
            if ($health.status -eq 'configured') { $healthy = $true; break }
        } catch { }
        Start-Sleep -Milliseconds 500
    }
    if (!$healthy) { throw 'Private trial health check failed; inspect its logs.' }
    Write-Output "Private game trial started: $trialUrl"
    Write-Output 'Only this computer can connect. Public preview/tunnel unchanged.'
} catch {
    # A failed start may leave a child running. Stop only the exact trial process we just created.
    $failed = Get-OwnedProcess $created
    if ($failed) {
        & taskkill.exe /PID $failed.Id /T /F | Out-Null
        if ($LASTEXITCODE -eq 0 -and (Test-Path -LiteralPath $statePath)) { Remove-Item -LiteralPath $statePath }
    }
    throw
} finally { Pop-Location }
