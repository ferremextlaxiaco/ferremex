# ============================================================================
#  Ferremex - Crea un acceso directo "Ferremex POS" en el Escritorio.
#  Abre el POS en Chrome modo aplicacion (sin barra de navegador).
#
#  Detecta automaticamente la URL correcta:
#    - En una CAJA (con proxy Caddy):  http://localhost:8080/pos/
#    - En la MATRIZ (servidor):         http://localhost:9000/pos/
# ============================================================================

Write-Host "Creando acceso directo del POS Ferremex..." -ForegroundColor Cyan
Write-Host ""

# --- 1. Encontrar Chrome ---
$chrome = @(
  "C:\Program Files\Google\Chrome\Application\chrome.exe",
  "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $chrome) {
  Write-Host "[ERROR] No se encontro Google Chrome." -ForegroundColor Red
  Write-Host "El POS necesita Chrome para el cajon y la impresora (Web Serial)."
  Write-Host "Instala Chrome y vuelve a correr este archivo."
  Read-Host "Presiona ENTER para cerrar"
  exit 1
}
Write-Host "Chrome: $chrome"

# --- 2. Detectar la URL del POS (caja 8080 o matriz 9000) ---
$posUrl = $null
foreach ($u in @("http://localhost:8080/pos/", "http://localhost:9000/pos/")) {
  try {
    $r = Invoke-WebRequest -Uri $u -UseBasicParsing -TimeoutSec 3
    if ($r.StatusCode -eq 200) { $posUrl = $u; break }
  } catch { }
}

if (-not $posUrl) {
  Write-Host "[AVISO] No se detecto el POS corriendo en 8080 ni 9000." -ForegroundColor Yellow
  Write-Host "Usando la URL de caja por defecto: http://localhost:8080/pos/"
  Write-Host "(Si es la matriz, edita el acceso y cambia 8080 por 9000.)"
  $posUrl = "http://localhost:8080/pos/"
} else {
  Write-Host "POS detectado en: $posUrl" -ForegroundColor Green
}

# --- 3. Crear el acceso directo en el Escritorio ---
$desktop = [Environment]::GetFolderPath("Desktop")
$lnk = Join-Path $desktop "Ferremex POS.lnk"

$ws = New-Object -ComObject WScript.Shell
$s = $ws.CreateShortcut($lnk)
$s.TargetPath = $chrome
$s.Arguments = "--app=$posUrl"
$s.WorkingDirectory = Split-Path $chrome
$s.IconLocation = "$chrome,0"
$s.Description = "Ferremex Punto de Venta"
$s.Save()

if (Test-Path $lnk) {
  Write-Host ""
  Write-Host "[OK] Acceso directo creado en el Escritorio: 'Ferremex POS'" -ForegroundColor Green
  Write-Host "Doble clic en el para abrir el POS."
} else {
  Write-Host ""
  Write-Host "[ERROR] No se pudo crear el acceso directo." -ForegroundColor Red
}

Write-Host ""
Read-Host "Presiona ENTER para cerrar"
