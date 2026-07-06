# ============================================================================
#  Ferremex - Convierte "Icono.png" en "ferremex-pos.ico" multi-tamano
#  para el icono del acceso directo del POS.
#
#  Icono.png ya es cuadrado (512x512) con fondo transparente, asi que solo
#  lo re-escalamos a los tamanos que Windows usa y lo empaquetamos en un .ico.
#
#  Genera "ferremex-pos.ico" en la raiz del repo. No instala nada
#  (usa System.Drawing, incluido en Windows).
# ============================================================================

Add-Type -AssemblyName System.Drawing

$origen  = Join-Path $PSScriptRoot "Icono.png"
$destino = Join-Path $PSScriptRoot "ferremex-pos.ico"

if (-not (Test-Path $origen)) {
  Write-Host "[ERROR] No se encontro la imagen en: $origen" -ForegroundColor Red
  exit 1
}

Write-Host "Convirtiendo Icono.png a icono multi-tamano..." -ForegroundColor Cyan
$src = New-Object System.Drawing.Bitmap($origen)
$fmt = [System.Drawing.Imaging.PixelFormat]::Format32bppArgb

# Tamanos que Windows usa (escritorio, barra de tareas, alt-tab, tiles).
$tamanos = 16, 24, 32, 48, 64, 128, 256

# --- Construir un .ico real (cada tamano guardado como PNG dentro del .ico) ---
$ms = New-Object System.IO.MemoryStream
$bw = New-Object System.IO.BinaryWriter($ms)
$bw.Write([UInt16]0); $bw.Write([UInt16]1); $bw.Write([UInt16]$tamanos.Count)

$pngs = @()
foreach ($t in $tamanos) {
  $bmp = New-Object System.Drawing.Bitmap($t, $t, $fmt)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.DrawImage($src, 0, 0, $t, $t)
  $g.Dispose()
  $pngStream = New-Object System.IO.MemoryStream
  $bmp.Save($pngStream, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  $pngs += ,($pngStream.ToArray())
  $pngStream.Dispose()
}
$src.Dispose()

$offset = 6 + (16 * $tamanos.Count)
for ($i = 0; $i -lt $tamanos.Count; $i++) {
  $t = $tamanos[$i]; $bytesImg = $pngs[$i]
  $dim = if ($t -ge 256) { 0 } else { $t }   # 0 = 256 en el formato ICO
  $bw.Write([Byte]$dim); $bw.Write([Byte]$dim)
  $bw.Write([Byte]0); $bw.Write([Byte]0)
  $bw.Write([UInt16]1); $bw.Write([UInt16]32)
  $bw.Write([UInt32]$bytesImg.Length); $bw.Write([UInt32]$offset)
  $offset += $bytesImg.Length
}
foreach ($bytesImg in $pngs) { $bw.Write($bytesImg) }
$bw.Flush()
[System.IO.File]::WriteAllBytes($destino, $ms.ToArray())
$bw.Dispose(); $ms.Dispose()

if (Test-Path $destino) {
  $kb = [math]::Round((Get-Item $destino).Length / 1KB, 1)
  Write-Host "[OK] Icono creado: $destino ($kb KB)" -ForegroundColor Green
} else {
  Write-Host "[ERROR] No se pudo crear el icono." -ForegroundColor Red
  exit 1
}
