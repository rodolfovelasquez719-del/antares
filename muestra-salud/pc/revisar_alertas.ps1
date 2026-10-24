# Antares · revisar la salud de la compu. Imprime una línea en español y las alertas activas.
# Uso:  powershell -ExecutionPolicy Bypass -File D:\Antares\salud\revisar_alertas.ps1   (código de salida 0 = sin alertas, 1 = hay alertas, 2 = no responde)
# Lee la clave de D:\Antares\cerebro\token.txt y consulta el portero LOCAL (127.0.0.1:11435), sin salir a internet.
$ErrorActionPreference = "Stop"
try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch {}
try {
  $tok = (Get-Content D:\Antares\cerebro\token.txt -Raw).Trim()
  $r = Invoke-WebRequest -UseBasicParsing http://127.0.0.1:11435/salud -Headers @{ Authorization = "Bearer $tok" } -TimeoutSec 10
  $j = [Text.Encoding]::UTF8.GetString($r.RawContentStream.ToArray()) | ConvertFrom-Json
} catch { Write-Output ("{0:HH:mm} ALERTA: el portero de Antares no responde ({1})" -f (Get-Date), $_.Exception.Message); exit 2 }
$a = $j.ahora
$f = { param($v) ([double]$v).ToString("0.#", [Globalization.CultureInfo]"es-CR") }
$temp = if ($null -ne $a.tempCPU) { "CPU {0} °C" -f (& $f $a.tempCPU) } else { "temp. n/d" }
$disc = ($a.discos | % { "{0}: {1} GB libres" -f $_.letra, [math]::Round($_.libreGB) }) -join " · "
$w = $a.wifi
$wifi = if ($w.conectado) { "Wi-Fi " + $(if ($w.ssid) { $w.ssid + " " } else { "" }) + "conectado {0} Mbps" -f [math]::Round($w.velocidadMbps) + $(if ($w.senalPct -ge 0) { ", señal $($w.senalPct) %" } else { "" }) } else { "Wi-Fi DESCONECTADO" }
$ping = if ($a.ping1111 -ge 0) { "ping {0} ms" -f [math]::Round($a.ping1111) } else { "SIN INTERNET" }
$ok = { param($b) if ($null -eq $b) { "?" } elseif ($b) { "ok" } else { "CAÍDO" } }
$t = [datetime]$a.t
Write-Output ("{0:HH:mm} ANTARES · CPU {1} % · {2} · RAM {3}/{4} GB · {5} · {6} · {7} · Tailscale {8} · Funnel {9} · Ollama {10} · Noticias {11} · encendida {12} h" -f `
  $t, [math]::Round($a.cpu), $temp, (& $f ($a.ramMB / 1024)), [math]::Round($a.ramTotalMB / 1024), $disc, $wifi, $ping, (& $ok $a.tailscale), (& $ok $a.funnel), (& $ok $a.ollama), $a.noticias, [math]::Round($a.uptimeH))
if ($j.alertas.Count -eq 0) { Write-Output "Sin alertas."; exit 0 }
foreach ($x in $j.alertas) { Write-Output ("{0}: {1} (desde {2:dd/MM HH:mm})" -f $x.nivel.ToUpper(), $x.texto, [datetime]$x.inicio) }
exit 1
