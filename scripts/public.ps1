param([ValidateSet('Start', 'Stop', 'Status')][string]$Action = 'Status')
$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$runtimeRoot = Join-Path $projectRoot '.roomtune'
$statePath = Join-Path $runtimeRoot 'processes.json'
$publicUrl = 'https://roomtune.dzoanh.me'

function Read-State {
    if (Test-Path -LiteralPath $statePath) {
        # Windows PowerShell 5.1 emits a JSON array as one pipeline object.
        # Enumerate explicitly so Status/Start/Stop always receive individual records.
        $decoded = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
        foreach ($record in $decoded) { $record }
    }
    return @()
}
function Get-OwnedProcess($record) {
    $candidate = Get-Process -Id $record.id -ErrorAction SilentlyContinue
    $expectedTicks = if ($record.startedTicks) { [long]$record.startedTicks } else {
        ([datetime]$record.started).ToUniversalTime().Ticks
    }
    if ($candidate -and $candidate.Path -eq $record.path -and
        $candidate.StartTime.ToUniversalTime().Ticks -eq $expectedTicks) {
        return $candidate
    }
}
function Stop-OwnedProcesses($records) {
    foreach ($record in $records) {
        $owned = Get-OwnedProcess $record
        if ($owned) {
            # Verify identity + creation time before stopping this specific process tree.
            & taskkill.exe /PID $owned.Id /T /F | Out-Null
            if ($LASTEXITCODE -ne 0) { throw "Cannot stop $($record.name)." }
        }
    }
    if (Test-Path -LiteralPath $statePath) { Remove-Item -LiteralPath $statePath }
}
function Process-Record($name, $process) {
    return [pscustomobject]@{
        name = $name; id = $process.Id; path = $process.Path
        startedTicks = $process.StartTime.ToUniversalTime().Ticks
    }
}

$records = @(Read-State)
if ($Action -eq 'Status') {
    if ($records.Count -eq 0) { Write-Output 'ROOMTUNE public: stopped.' }
    foreach ($record in $records) {
        $state = if (Get-OwnedProcess $record) { 'running' } else { 'stopped' }
        Write-Output "$($record.name): $state"
    }
    Write-Output $publicUrl
    exit 0
}
if ($Action -eq 'Stop') {
    Stop-OwnedProcesses $records
    Write-Output 'Stopped ROOMTUNE preview and its tunnel. Database and other apps are unchanged.'
    exit 0
}

if ($records.Count -eq 2 -and @($records | Where-Object { Get-OwnedProcess $_ }).Count -eq 2) {
    Write-Output "Already running: $publicUrl"
    exit 0
}
if ($records.Count) { Stop-OwnedProcesses $records }
if (!(Test-Path -LiteralPath (Join-Path $projectRoot 'dist/roomtune/wrangler.json'))) {
    throw 'Build first: npm.cmd run build'
}
$nodePath = (Get-Command node.exe -ErrorAction Stop).Source
$tunnelPath = (Get-Command cloudflared.exe -ErrorAction Stop).Source
$tunnelConfig = Join-Path $projectRoot 'cloudflared.roomtune.yml'
$null = New-Item -ItemType Directory -Path $runtimeRoot -Force
$created = @()
try {
    $preview = Start-Process -FilePath $nodePath -ArgumentList @('node_modules/vite/bin/vite.js', 'preview') `
        -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput (Join-Path $runtimeRoot 'preview.stdout.log') `
        -RedirectStandardError (Join-Path $runtimeRoot 'preview.stderr.log')
    $created += Process-Record 'preview' $preview
    ConvertTo-Json -InputObject $created | Set-Content -LiteralPath $statePath -Encoding UTF8
    $healthy = $false
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        $preview.Refresh()
        if ($preview.HasExited) { throw 'Preview exited. Read .roomtune/preview.stderr.log.' }
        try {
            $health = Invoke-RestMethod 'http://127.0.0.1:4173/api/v1/system/health' -TimeoutSec 2
            if ($health.status -eq 'configured' -and $health.youtubeConfigured) { $healthy = $true; break }
        } catch { }
        Start-Sleep -Milliseconds 500
    }
    if (!$healthy) { throw 'Preview health check failed. Read .roomtune/preview.stderr.log.' }
    $tunnel = Start-Process -FilePath $tunnelPath `
        -ArgumentList @('tunnel', '--config', ('"' + $tunnelConfig + '"'), 'run', 'roomtune') `
        -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput (Join-Path $runtimeRoot 'tunnel.stdout.log') `
        -RedirectStandardError (Join-Path $runtimeRoot 'tunnel.stderr.log')
    $created += Process-Record 'tunnel' $tunnel
    ConvertTo-Json -InputObject $created | Set-Content -LiteralPath $statePath -Encoding UTF8
    Start-Sleep -Seconds 2
    $tunnel.Refresh()
    if ($tunnel.HasExited) { throw 'Tunnel exited. Read .roomtune/tunnel.stderr.log.' }
    Write-Output "Started ROOMTUNE: $publicUrl"
    Write-Output 'Keep this computer awake and connected. Logs: .roomtune/'
} catch {
    Stop-OwnedProcesses $created
    throw
}
