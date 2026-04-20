$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$port = 48631
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://127.0.0.1:$port/")
$listener.Start()
Start-Process "http://127.0.0.1:$port/"
Write-Host "FarmBot simulator server started on http://127.0.0.1:$port/"
Write-Host "Press Ctrl+C to stop."

function Send-File($ctx, $path) {
  if (-not (Test-Path $path)) { $ctx.Response.StatusCode = 404; $ctx.Response.Close(); return }
  $ext = [System.IO.Path]::GetExtension($path).ToLowerInvariant()
  $contentType = switch ($ext) {
    '.html' {'text/html; charset=utf-8'}
    '.js' {'application/javascript; charset=utf-8'}
    '.css' {'text/css; charset=utf-8'}
    '.json' {'application/json; charset=utf-8'}
    '.png' {'image/png'}
    '.jpg' {'image/jpeg'}
    '.jpeg' {'image/jpeg'}
    '.svg' {'image/svg+xml'}
    default {'application/octet-stream'}
  }
  $bytes = [System.IO.File]::ReadAllBytes($path)
  $ctx.Response.ContentType = $contentType
  $ctx.Response.ContentLength64 = $bytes.Length
  $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
  $ctx.Response.OutputStream.Close()
}

while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  $urlPath = $ctx.Request.Url.AbsolutePath.TrimStart('/')
  if ([string]::IsNullOrWhiteSpace($urlPath)) { $urlPath = 'index.html' }
  $full = Join-Path $root $urlPath
  Send-File $ctx $full
}
