param([switch]$Remote, [string]$Destination)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
Set-Location -LiteralPath $projectRoot
if (-not $Destination) { $Destination = Join-Path $env:LOCALAPPDATA 'GeoDam\Backups' }
$backupDirectory = [IO.Path]::GetFullPath($Destination)
New-Item -ItemType Directory -Path $backupDirectory -Force | Out-Null
$backupFile = Join-Path $backupDirectory ("geodam-" + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.sql')
$targetFlag = if ($Remote) { '--remote' } else { '--local' }
& npx wrangler d1 export geodam $targetFlag "--output=$backupFile"
if ($LASTEXITCODE -ne 0) { throw 'Database export failed' }
& python scripts/sanitize_backup.py $backupFile
if ($LASTEXITCODE -ne 0) { throw 'Backup sanitization failed' }
& python scripts/verify_backup.py $backupFile
if ($LASTEXITCODE -ne 0) { throw 'Restore verification failed' }
Add-Type -AssemblyName System.Security
$backupBytes = [IO.File]::ReadAllBytes($backupFile)
$encryptedBytes = [Security.Cryptography.ProtectedData]::Protect($backupBytes, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
$encryptedFile = $backupFile + '.dpapi'
[IO.File]::WriteAllBytes($encryptedFile, $encryptedBytes)
# Verify encryption round trip before removing the plaintext export.
$decodedBytes = [Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($encryptedFile), $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
if ([Convert]::ToBase64String($decodedBytes) -ne [Convert]::ToBase64String($backupBytes)) { throw 'Encryption verification failed' }
$resolvedBackup = [IO.Path]::GetFullPath($backupFile)
if (-not $resolvedBackup.StartsWith($backupDirectory + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unexpected backup path' }
Remove-Item -LiteralPath $resolvedBackup
Write-Output "Verified encrypted local backup: $encryptedFile"


$cutoff = (Get-Date).AddDays(-30)
Get-ChildItem -LiteralPath $backupDirectory -Filter 'geodam-*.sql.dpapi' -File | Where-Object LastWriteTime -LT $cutoff | ForEach-Object {
    $expiredPath = [IO.Path]::GetFullPath($_.FullName)
    if (-not $expiredPath.StartsWith($backupDirectory + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unexpected expired backup path' }
    Remove-Item -LiteralPath $expiredPath
}
