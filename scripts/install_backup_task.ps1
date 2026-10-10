param([switch]$Remote)
$ErrorActionPreference = 'Stop'
$backupScript = Join-Path $PSScriptRoot 'backup.ps1'
$taskArgs = '-NoProfile -WindowStyle Hidden -File "' + $backupScript + '"'
if ($Remote) { $taskArgs += ' -Remote' }
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $taskArgs
$trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday -At '03:43'
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 30)
$principal = New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -Principal $principal -TaskName 'GeoDam Verified Backup' -Action $action -Trigger $trigger -Settings $settings -Description 'Local encrypted GeoDam database export with restoration verification' -Force
