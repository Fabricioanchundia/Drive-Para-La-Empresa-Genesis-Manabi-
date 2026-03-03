param(
  [string]$Ip = ''
)

$ErrorActionPreference = 'Continue'
$sw = [System.Diagnostics.Stopwatch]::StartNew()

function Write-Step([string]$msg, [string]$col = 'Cyan') {
  $t = '[{0:mm\:ss}]' -f [timespan]::FromMilliseconds($sw.ElapsedMilliseconds)
  Write-Host "$t $msg" -ForegroundColor $col
}

Write-Host ''
Write-Host '╔══════════════════════════════════════════╗' -ForegroundColor DarkCyan
Write-Host '║          DRIVE-APP  -  INICIO            ║' -ForegroundColor DarkCyan
Write-Host '╚══════════════════════════════════════════╝' -ForegroundColor DarkCyan
Write-Host ''

# ─── 1. DETECTAR IP ──────────────────────────────────────────────────────────
if ($Ip -ne '') {
  $ip = $Ip
  Write-Step "IP manual: $ip" 'Magenta'
} else {
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
    Write-Host '[ERROR] No se detecto IP local. Usa: start.bat 192.168.X.X' -ForegroundColor Red
    exit 1
  }
  Write-Step "IP detectada: $ip" 'Green'
}

# ─── 2. CERTIFICADO SSL (cache — solo regenera si cambia la IP) ──────────────
$certFile = '.\ssl-cert.pem'
$keyFile  = '.\ssl-key.pem'
$ipCache  = '.\ssl-ip.txt'

$needCert = $true
if ((Test-Path $certFile) -and (Test-Path $keyFile) -and (Test-Path $ipCache)) {
  $cachedIp = (Get-Content $ipCache -Raw).Trim()
  if ($cachedIp -eq $ip) {
    $needCert = $false
    Write-Step 'Certificado SSL reutilizado (misma IP).' 'Green'
  }
}

if ($needCert) {
  if (-not (Test-Path '.\mkcert.exe')) {
    Write-Host '[ERROR] mkcert.exe no encontrado.' -ForegroundColor Red
    Write-Host '[TIP]   Descarga: https://github.com/FiloSottile/mkcert/releases' -ForegroundColor Yellow
    Write-Host '        Ejecuta una vez: .\mkcert.exe -install' -ForegroundColor Yellow
    exit 1
  }
  Write-Step 'Generando certificado SSL...' 'Yellow'
  .\mkcert.exe -cert-file $certFile -key-file $keyFile $ip localhost 127.0.0.1
  if ($LASTEXITCODE -ne 0) {
    Write-Host '[ERROR] mkcert fallo. Ejecuta .\mkcert.exe -install' -ForegroundColor Red
    exit 1
  }
  $ip | Set-Content $ipCache
  Write-Step 'Certificado SSL generado.' 'Green'
}

# ─── 3. NODE_MODULES drive-app ───────────────────────────────────────────────
if (-not (Test-Path '.\node_modules')) {
  Write-Step 'Instalando dependencias drive-app (primera vez)...' 'Yellow'
  npm install --prefer-offline --no-audit --no-fund
  Write-Step 'node_modules OK (drive-app)' 'Green'
} else {
  Write-Step 'node_modules OK (drive-app)' 'Green'
}

# ─── 4. NODE_MODULES onlyoffice-callback ─────────────────────────────────────
$callbackPath = Join-Path (Split-Path $PSScriptRoot -Parent) 'onlyoffice-callback'
if ((Test-Path (Join-Path $callbackPath 'server.js')) -and
    -not (Test-Path (Join-Path $callbackPath 'node_modules'))) {
  Write-Step 'Instalando dependencias onlyoffice-callback (primera vez)...' 'Yellow'
  Push-Location $callbackPath
  npm install --prefer-offline --no-audit --no-fund
  Pop-Location
  Write-Step 'node_modules OK (callback)' 'Green'
} else {
  Write-Step 'node_modules OK (callback)' 'Green'
}

# ─── 5. DOCKER + ONLYOFFICE ──────────────────────────────────────────────────
Write-Step 'Verificando OnlyOffice (:8080)...' 'Yellow'
$ooReady = $false
try {
  $t1 = New-Object System.Net.Sockets.TcpClient
  $t1.Connect('127.0.0.1', 8080); $t1.Close()
  $ooReady = $true
} catch {}

if ($ooReady) {
  Write-Step 'OnlyOffice ya esta corriendo en :8080' 'Green'
} else {
  # Verificar Docker
  $dockerOk = $false
  try { docker version 2>&1 | Out-Null; $dockerOk = ($LASTEXITCODE -eq 0) } catch {}

  if (-not $dockerOk) {
    Write-Host ''
    Write-Host '  [!] Docker no esta instalado o no esta corriendo.' -ForegroundColor Red
    Write-Host '  Instala Docker Desktop: https://www.docker.com/products/docker-desktop/' -ForegroundColor Yellow
    Write-Host '  Luego ejecuta UNA SOLA VEZ:' -ForegroundColor Yellow
    Write-Host '    docker run -d --name onlyoffice-ds -p 8080:80 --restart=unless-stopped onlyoffice/documentserver' -ForegroundColor White
    Write-Host ''
  } else {
    $exists = docker ps -a --format '{{.Names}}' 2>&1 | Select-String 'onlyoffice-ds'
    if ($exists) {
      Write-Step 'Iniciando contenedor onlyoffice-ds...' 'Yellow'
      docker start onlyoffice-ds 2>&1 | Out-Null
    } else {
      Write-Step 'Creando contenedor OnlyOffice por primera vez...' 'Yellow'
      docker run -d --name onlyoffice-ds -p 8080:80 --restart=unless-stopped onlyoffice/documentserver 2>&1 | Out-Null
    }

    if ($LASTEXITCODE -eq 0) {
      # Espera inteligente: polling hasta 90s
      $max = 90; $elapsed2 = 0
      Write-Host '  Esperando que OnlyOffice responda' -NoNewline -ForegroundColor Yellow
      while ($elapsed2 -lt $max) {
        Start-Sleep -Seconds 3; $elapsed2 += 3
        Write-Host '.' -NoNewline -ForegroundColor DarkYellow
        try {
          $t2 = New-Object System.Net.Sockets.TcpClient
          $t2.Connect('127.0.0.1', 8080); $t2.Close()
          $ooReady = $true; break
        } catch {}
      }
      Write-Host ''
      if ($ooReady) {
        Write-Step "OnlyOffice listo en ${elapsed2}s" 'Green'
      } else {
        Write-Host '  [WARN] OnlyOffice no respondio en 90s. Continua sin el.' -ForegroundColor Red
      }
    } else {
      Write-Host '  [WARN] No se pudo iniciar el contenedor.' -ForegroundColor Red
    }
  }
}

# ─── 6. CALLBACK SERVER ──────────────────────────────────────────────────────
Write-Step 'Verificando Callback Server (:3001)...' 'Yellow'
$cbReady = $false
try {
  $t3 = New-Object System.Net.Sockets.TcpClient
  $t3.Connect('127.0.0.1', 3001); $t3.Close()
  $cbReady = $true
} catch {}

if ($cbReady) {
  Write-Step 'Callback Server ya esta corriendo en :3001' 'Green'
} elseif (Test-Path (Join-Path $callbackPath 'server.js')) {
  $cmdArgs = '/k cd /d "' + $callbackPath + '" & node server.js'
  Start-Process 'cmd.exe' -ArgumentList $cmdArgs
  Write-Step 'Callback Server lanzado en ventana nueva.' 'Green'
} else {
  Write-Host '  [WARN] No se encontro onlyoffice-callback\server.js' -ForegroundColor Yellow
}

# ─── 7. RESUMEN ──────────────────────────────────────────────────────────────
Write-Host ''
Write-Host '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━' -ForegroundColor DarkGray
Write-Host "  App Frontend : https://${ip}:4200"      -ForegroundColor White
Write-Host "  App Local    : https://localhost:4200"   -ForegroundColor White
Write-Host "  Callback     : http://${ip}:3001"        -ForegroundColor White
Write-Host "  OnlyOffice   : http://${ip}:8080"        -ForegroundColor White
$tot = '[{0:mm\:ss}]' -f [timespan]::FromMilliseconds($sw.ElapsedMilliseconds)
Write-Host "  Preparado en : $tot" -ForegroundColor DarkGray
Write-Host '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━' -ForegroundColor DarkGray
Write-Host ''
Write-Step "Iniciando Angular -> https://${ip}:4200" 'Cyan'
Write-Host ''

# ─── 8. ng serve (binario local, mucho mas rapido que npx) ───────────────────
# Silenciar warnings de deprecacion de paquetes internos (DEP0060, etc.)
$env:NODE_NO_WARNINGS = '1'

$ngCmd = '.\node_modules\.bin\ng.cmd'
if (Test-Path $ngCmd) {
  & $ngCmd serve --host 0.0.0.0 --ssl true --ssl-cert $certFile --ssl-key $keyFile
} else {
  npx ng serve --host 0.0.0.0 --ssl true --ssl-cert $certFile --ssl-key $keyFile
}
