# Minimal static file server for the web test (no Python or Node needed). Serves this folder on http://localhost:8765/
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$port = 8765
$types = @{ '.html'='text/html; charset=utf-8'; '.js'='text/javascript; charset=utf-8'; '.json'='application/json'; '.css'='text/css';
            '.png'='image/png'; '.jpg'='image/jpeg'; '.mp4'='video/mp4'; '.mp3'='audio/mpeg'; '.md'='text/plain; charset=utf-8' }
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")
try { $listener.Start() } catch { Write-Host "Port $port is busy - the server may already be running. Opening the browser anyway."; Start-Process "http://localhost:$port/index.html"; exit }
Write-Host "Serving $root at http://localhost:$port/  (close this window to stop)"
Start-Process "http://localhost:$port/index.html"
while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  $res = $ctx.Response
  try {
    $rel = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath.TrimStart('/'))
    if ($rel -eq '') { $rel = 'index.html' }
    $path = [IO.Path]::GetFullPath((Join-Path $root $rel))
    if (-not $path.StartsWith($root) -or -not (Test-Path $path -PathType Leaf)) { $res.StatusCode = 404 }
    else {
      $bytes = [IO.File]::ReadAllBytes($path)
      $ext = [IO.Path]::GetExtension($path).ToLower()
      $res.ContentType = if ($types.ContainsKey($ext)) { $types[$ext] } else { 'application/octet-stream' }
      $res.ContentLength64 = $bytes.Length
      $res.OutputStream.Write($bytes, 0, $bytes.Length)
    }
  } catch { $res.StatusCode = 500 }
  finally { try { $res.Close() } catch {} }
}
