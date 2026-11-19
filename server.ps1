# Poti Waterski - local web server (no installs needed). Close this window to stop.
$root = (Split-Path -Parent $MyInvocation.MyCommand.Path).TrimEnd('\') + '\'
$port = 5500
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")
try { $listener.Start() } catch {
  Write-Host "Port $port is busy. The site may already be running: http://localhost:$port/"
  Start-Process "http://localhost:$port/"
  exit 1
}
Write-Host ""
Write-Host "  Poti Waterski is running:  http://localhost:$port/"
Write-Host "  Owner page:                http://localhost:$port/owner.html"
Write-Host "  Close this window to stop the site."
Write-Host ""
Start-Process "http://localhost:$port/"
$mime = @{
  '.html' = 'text/html; charset=utf-8'; '.css' = 'text/css; charset=utf-8'; '.js' = 'application/javascript; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'; '.png' = 'image/png'; '.jpg' = 'image/jpeg'; '.jpeg' = 'image/jpeg'
  '.svg' = 'image/svg+xml'; '.webp' = 'image/webp'; '.ico' = 'image/x-icon'; '.mp4' = 'video/mp4'; '.txt' = 'text/plain; charset=utf-8'
}
while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  $res = $ctx.Response
  try {
    $path = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath.TrimStart('/'))
    if ($path -eq '' -or $path.EndsWith('/')) { $path = $path + 'index.html' }
    $full = [IO.Path]::GetFullPath((Join-Path $root $path))
    if ($full.StartsWith($root, [StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $full -PathType Leaf)) {
      $bytes = [IO.File]::ReadAllBytes($full)
      $ext = [IO.Path]::GetExtension($full).ToLower()
      if ($mime.ContainsKey($ext)) { $res.ContentType = $mime[$ext] } else { $res.ContentType = 'application/octet-stream' }
      $res.Headers.Add('Cache-Control', 'no-store')
      $res.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
      $res.StatusCode = 404
      $b = [Text.Encoding]::UTF8.GetBytes('Not found')
      $res.OutputStream.Write($b, 0, $b.Length)
    }
  } catch { $res.StatusCode = 500 } finally { $res.Close() }
}
