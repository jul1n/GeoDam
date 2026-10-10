param([switch]$Remote, [string]$Destination)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
Set-Location -LiteralPath $projectRoot
if (-not $Destination) { $Destination = Join-Path $projectRoot 'backups' }
$backupDirectory = [IO.Path]::GetFullPath($Destination)
New-Item -ItemType Directory -Path $backupDirectory -Force | Out-Null
$backupFile = Join-Path $backupDirectory ("geodam-" + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.sql')
$targetFlag = if ($Remote) { '--remote' } else { '--local' }
& npx wrangler d1 export geodam $targetFlag "--output=$backupFile"
if ($LASTEXITCODE -ne 0) { throw 'Database export failed' }
& python scripts/verify_backup.py $backupFile
if ($LASTEXITCODE -ne 0) { throw 'Restore verification failed' }
Write-Output "Verified local backup: $backupFile"
