# ============================================================================
#  Ferremex - Convierte "Logo Ferremex recortado.jpeg" en un .ico multi-tamano
#  con FONDO BLANCO TRANSPARENTE, para el icono del acceso directo del POS.
#
#  Pasos:
#    1. Quita el fondo blanco (flood-fill desde los bordes -> transparente).
#       Se hace por flood-fill (no "todo lo blanco") para NO borrar los
#       blancos internos del dibujo (ojos, camisa clara, brillos).
#    2. Recorta a la caja del contenido (bounding box) para que el logo
#       llene el icono sin margenes enormes.
#    3. Centra en un lienzo cuadrado transparente y exporta .ico multi-tamano.
#
#  Genera "ferremex-pos.ico" en la raiz del repo. No instala nada
#  (usa System.Drawing, incluido en Windows).
# ============================================================================

Add-Type -AssemblyName System.Drawing

$origen  = Join-Path $PSScriptRoot "Logo Ferremex recortado.jpeg"
$destino = Join-Path $PSScriptRoot "ferremex-pos.ico"

if (-not (Test-Path $origen)) {
  Write-Host "[ERROR] No se encontro el logo en: $origen" -ForegroundColor Red
  exit 1
}

Write-Host "1/4 Cargando logo..." -ForegroundColor Cyan
$src = New-Object System.Drawing.Bitmap($origen)
$w = $src.Width; $h = $src.Height

# --- Copiar pixeles a un arreglo ARGB manipulable ---
$rect = New-Object System.Drawing.Rectangle(0, 0, $w, $h)
$fmt = [System.Drawing.Imaging.PixelFormat]::Format32bppArgb
$data = $src.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadOnly, $fmt)
$stride = $data.Stride
$bytes = New-Object byte[] ($stride * $h)
[System.Runtime.InteropServices.Marshal]::Copy($data.Scan0, $bytes, 0, $bytes.Length)
$src.UnlockBits($data)
$src.Dispose()

# --- 2/4 Flood-fill desde los bordes: blanco -> transparente ---
Write-Host "2/4 Quitando fondo blanco..." -ForegroundColor Cyan
# Un pixel es "fondo" si es casi blanco (los 3 canales por encima del umbral).
$umbral = 238   # 0-255; mas bajo = mas agresivo quitando blanco sucio del JPEG
function EsBlanco([int]$idx) {
  return ($bytes[$idx+2] -ge $umbral) -and ($bytes[$idx+1] -ge $umbral) -and ($bytes[$idx] -ge $umbral)
}

# BFS con una cola sobre un arreglo "visitado". Semillas = todo el borde.
$visitado = New-Object bool[] ($w * $h)
$cola = New-Object System.Collections.Generic.Queue[int]

function Encolar([int]$x, [int]$y) {
  if ($x -lt 0 -or $y -lt 0 -or $x -ge $w -or $y -ge $h) { return }
  $p = $y * $w + $x
  if ($visitado[$p]) { return }
  $idx = $y * $stride + $x * 4
  if (EsBlanco $idx) {
    $visitado[$p] = $true
    $cola.Enqueue($p)
  }
}

for ($x = 0; $x -lt $w; $x++) { Encolar $x 0; Encolar $x ($h-1) }
for ($y = 0; $y -lt $h; $y++) { Encolar 0 $y; Encolar ($w-1) $y }

while ($cola.Count -gt 0) {
  $p = $cola.Dequeue()
  $y = [math]::Floor($p / $w); $x = $p - ($y * $w)
  $idx = $y * $stride + $x * 4
  $bytes[$idx+3] = 0    # canal alfa -> transparente
  Encolar ($x-1) $y; Encolar ($x+1) $y; Encolar $x ($y-1); Encolar $x ($y+1)
}

# --- 3/4 Bounding box del contenido (pixeles NO transparentes) ---
Write-Host "3/4 Recortando al contenido..." -ForegroundColor Cyan
$minX = $w; $minY = $h; $maxX = -1; $maxY = -1
for ($y = 0; $y -lt $h; $y++) {
  $fila = $y * $stride
  for ($x = 0; $x -lt $w; $x++) {
    if ($bytes[$fila + $x*4 + 3] -ne 0) {
      if ($x -lt $minX) { $minX = $x }; if ($x -gt $maxX) { $maxX = $x }
      if ($y -lt $minY) { $minY = $y }; if ($y -gt $maxY) { $maxY = $y }
    }
  }
}
if ($maxX -lt 0) { Write-Host "[ERROR] Todo el logo quedo transparente; sube el umbral." -ForegroundColor Red; exit 1 }

$cropW = $maxX - $minX + 1
$cropH = $maxY - $minY + 1

# Bitmap transparente ya recortado
$recortado = New-Object System.Drawing.Bitmap($cropW, $cropH, $fmt)
$rect2 = New-Object System.Drawing.Rectangle(0, 0, $cropW, $cropH)
$d2 = $recortado.LockBits($rect2, [System.Drawing.Imaging.ImageLockMode]::WriteOnly, $fmt)
$stride2 = $d2.Stride
$buf2 = New-Object byte[] ($stride2 * $cropH)
for ($y = 0; $y -lt $cropH; $y++) {
  $srcRow = ($y + $minY) * $stride + $minX * 4
  $dstRow = $y * $stride2
  [System.Array]::Copy($bytes, $srcRow, $buf2, $dstRow, $cropW * 4)
}
[System.Runtime.InteropServices.Marshal]::Copy($buf2, 0, $d2.Scan0, $buf2.Length)
$recortado.UnlockBits($d2)

# Lienzo cuadrado transparente con el logo centrado (5% de margen)
$lado = [math]::Max($cropW, $cropH)
$margen = [int]($lado * 0.06)
$ladoFinal = $lado + 2 * $margen
$cuadrado = New-Object System.Drawing.Bitmap($ladoFinal, $ladoFinal, $fmt)
$gc = [System.Drawing.Graphics]::FromImage($cuadrado)
$gc.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$offX = [int](($ladoFinal - $cropW) / 2)
$offY = [int](($ladoFinal - $cropH) / 2)
$gc.DrawImage($recortado, $offX, $offY, $cropW, $cropH)
$gc.Dispose()
$recortado.Dispose()

# --- 4/4 Exportar .ico multi-tamano (PNG por cada tamano) ---
Write-Host "4/4 Escribiendo icono multi-tamano..." -ForegroundColor Cyan
$tamanos = 16, 24, 32, 48, 64, 128, 256

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
  $g.DrawImage($cuadrado, 0, 0, $t, $t)
  $g.Dispose()
  $pngStream = New-Object System.IO.MemoryStream
  $bmp.Save($pngStream, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  $pngs += ,($pngStream.ToArray())
  $pngStream.Dispose()
}

$offset = 6 + (16 * $tamanos.Count)
for ($i = 0; $i -lt $tamanos.Count; $i++) {
  $t = $tamanos[$i]; $bytesImg = $pngs[$i]
  $dim = if ($t -ge 256) { 0 } else { $t }
  $bw.Write([Byte]$dim); $bw.Write([Byte]$dim)
  $bw.Write([Byte]0); $bw.Write([Byte]0)
  $bw.Write([UInt16]1); $bw.Write([UInt16]32)
  $bw.Write([UInt32]$bytesImg.Length); $bw.Write([UInt32]$offset)
  $offset += $bytesImg.Length
}
foreach ($bytesImg in $pngs) { $bw.Write($bytesImg) }
$bw.Flush()
[System.IO.File]::WriteAllBytes($destino, $ms.ToArray())
$bw.Dispose(); $ms.Dispose(); $cuadrado.Dispose()

if (Test-Path $destino) {
  $kb = [math]::Round((Get-Item $destino).Length / 1KB, 1)
  Write-Host ""
  Write-Host "[OK] Icono creado: $destino ($kb KB)" -ForegroundColor Green
  Write-Host "     Contenido recortado a ${cropW}x${cropH}, fondo blanco transparente." -ForegroundColor Green
} else {
  Write-Host "[ERROR] No se pudo crear el icono." -ForegroundColor Red
  exit 1
}
