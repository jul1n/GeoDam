param([Parameter(Mandatory=$true)][string]$Path,[Parameter(Mandatory=$true)][string]$Output)
$ErrorActionPreference = 'Stop'
if (Test-Path -LiteralPath $Output) { throw 'Output already exists; choose a new path' }
Add-Type -AssemblyName System.Security
$decoded = [Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes([IO.Path]::GetFullPath($Path)), $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
[IO.File]::WriteAllBytes([IO.Path]::GetFullPath($Output), $decoded)
& python (Join-Path $PSScriptRoot 'verify_backup.py') $Output
if ($LASTEXITCODE -ne 0) { throw 'Decrypted backup failed validation' }
