# ─── Detectar la IP local de la red (excluye loopback, APIPA y adaptadores virtuales) ───
$ip = (
  Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object {
    $_.IPAddress -ne '127.0.0.1' -and
    $_.IPAddress -notmatch '^169\.254\.' -and
    $_.InterfaceAlias -notmatch 'Loopback' -and
    $_.InterfaceAlias -notmatch 'vEthernet' -and
    $_.InterfaceAlias -notmatch 'Virtual' -and
    $_.InterfaceAlias -notmatch 'VMware' -and
    $_.InterfaceAlias -notmatch 'Hyper-V'
  } |
  Sort-Object -Property PrefixLength |
  Select-Object -First 1
).IPAddress

if (-not $ip) {
  Write-Host "[ERROR] No se pudo detectar la IP local." -ForegroundColor Red
  exit 1
}

Write-Host ""
Write-Host "=== IP detectada: $ip ===" -ForegroundColor Cyan
Write-Host ""

# ─── Generar certificado SSL con mkcert ───────────────────────────────────────
Write-Host "Generando certificado SSL para $ip ..." -ForegroundColor Yellow
.\mkcert.exe -cert-file ssl-cert.pem -key-file ssl-key.pem $ip localhost 127.0.0.1

if ($LASTEXITCODE -ne 0) {
  Write-Host "[ERROR] mkcert fallo. Asegurate de haber ejecutado '.\mkcert.exe -install' al menos una vez." -ForegroundColor Red
  exit 1
}

Write-Host ""
Write-Host "Certificado generado para: $ip, localhost, 127.0.0.1" -ForegroundColor Green
Write-Host ""
Write-Host "Iniciando Angular en https://${ip}:4200 ..." -ForegroundColor Cyan
Write-Host ""

# ─── Iniciar ng serve ─────────────────────────────────────────────────────────
npx ng serve --host 0.0.0.0 --ssl true --ssl-cert ssl-cert.pem --ssl-key ssl-key.pem
