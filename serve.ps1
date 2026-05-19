$root = "C:\Users\ItsChugg\Documents\Github\itschu.gg"
$url  = "http://localhost:5500/"

$mime = @{
  '.html' = 'text/html; charset=utf-8'
  '.css'  = 'text/css; charset=utf-8'
  '.js'   = 'application/javascript; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'
  '.png'  = 'image/png'
  '.gif'  = 'image/gif'
  '.jpg'  = 'image/jpeg'
  '.svg'  = 'image/svg+xml'
  '.ico'  = 'image/x-icon'
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($url)
$listener.Start()
Write-Output "Serving $root on $url"

while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  $localPath = $ctx.Request.Url.LocalPath.TrimStart('/') -replace '/', '\'
  if ($localPath -eq '') { $localPath = 'index.html' }
  $file = Join-Path $root $localPath

  if (Test-Path $file -PathType Leaf) {
    $ext   = [IO.Path]::GetExtension($file).ToLower()
    $ct    = if ($mime[$ext]) { $mime[$ext] } else { 'application/octet-stream' }
    $bytes = [IO.File]::ReadAllBytes($file)
    $ctx.Response.ContentType     = $ct
    $ctx.Response.ContentLength64 = $bytes.Length
    $ctx.Response.StatusCode      = 200
    $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
  } else {
    $ctx.Response.StatusCode = 404
    $body = [Text.Encoding]::UTF8.GetBytes("404 Not Found")
    $ctx.Response.ContentLength64 = $body.Length
    $ctx.Response.OutputStream.Write($body, 0, $body.Length)
  }
  $ctx.Response.Close()
}
