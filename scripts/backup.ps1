param([string]$Destination = (Join-Path $PSScriptRoot '..\backups'))
$ErrorActionPreference = 'Stop'
if (-not $env:PGHOST -or -not $env:PGUSER -or -not $env:PGDATABASE -or -not $env:PGPASSWORD) { throw 'Cần PGHOST, PGPORT, PGUSER, PGDATABASE, PGPASSWORD và PGSSLMODE=require trong môi trường.' }
New-Item -ItemType Directory -Force -Path $Destination | Out-Null
$BackupFile = Join-Path $Destination ("roomtune-" + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.dump')
& pg_dump --format=custom --no-owner --file=$BackupFile
if ($LASTEXITCODE -ne 0) { throw 'Backup thất bại.' }
& pg_restore --list $BackupFile | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Không đọc được archive backup.' }
Write-Output "Đã tạo archive: $BackupFile. Cần restore thử trên database riêng để xác minh đầy đủ."
