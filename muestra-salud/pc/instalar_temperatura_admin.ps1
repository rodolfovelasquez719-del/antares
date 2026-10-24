# Antares · activar la TEMPERATURA de la compu (una sola vez, COMO ADMINISTRADOR).
# Clic derecho en este archivo > «Ejecutar con PowerShell» no basta: abra PowerShell como administrador y ejecute:
#   powershell -ExecutionPolicy Bypass -File D:\Antares\salud\instalar_temperatura_admin.ps1
# Qué hace: crea la tarea «Antares temperatura» que abre LibreHardwareMonitor (oficial, portátil, en D:\Antares\salud)
# al iniciar sesión, con permisos altos (los sensores de la CPU lo exigen) y minimizado en la bandeja.
# Su servidor web queda SOLO en 127.0.0.1:8085 (no se abre a la red); el portero lo lee y lo publica con la clave.
$exe = "D:\Antares\salud\LibreHardwareMonitor\LibreHardwareMonitor.exe"
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Write-Host "Hay que ejecutarlo como administrador." -ForegroundColor Red; exit 1 }
$a = New-ScheduledTaskAction -Execute $exe -WorkingDirectory (Split-Path $exe)
$t = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
$p = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Highest
$s = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit 0 -StartWhenAvailable
Register-ScheduledTask -TaskName "Antares temperatura" -Action $a -Trigger $t -Principal $p -Settings $s -Force | Out-Null
Start-ScheduledTask -TaskName "Antares temperatura"
Start-Sleep 8
try { Invoke-RestMethod http://127.0.0.1:8085/data.json -TimeoutSec 5 | Out-Null; Write-Host "Listo: temperatura activa (127.0.0.1:8085)." -ForegroundColor Green }
catch { Write-Host "La tarea quedó creada, pero el servidor de LibreHardwareMonitor aún no responde. Revise la bandeja." -ForegroundColor Yellow }
