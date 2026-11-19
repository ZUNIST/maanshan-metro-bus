# City and Metro - zero-dependency static file server.
# Used by the launcher when no real Python interpreter is available.
# Windows PowerShell 5.1 compatible; ASCII only on purpose.
#
# v3.21: serves /__hb heartbeats and shuts itself down 45 s after the game tab
# closes, so the minimized window does not stay in the background forever.

param(
  [string]$Root = '',
  [int]$Port = 8123
)

$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($Root)) { $Root = (Get-Location).Path }
$Root = [System.IO.Path]::GetFullPath($Root).TrimEnd('\', '/')

$mime = @{
  '.html'  = 'text/html; charset=utf-8'
  '.htm'   = 'text/html; charset=utf-8'
  '.js'    = 'application/javascript; charset=utf-8'
  '.mjs'   = 'application/javascript; charset=utf-8'
  '.css'   = 'text/css; charset=utf-8'
  '.json'  = 'application/json; charset=utf-8'
  '.map'   = 'application/json; charset=utf-8'
  '.txt'   = 'text/plain; charset=utf-8'
  '.md'    = 'text/plain; charset=utf-8'
  '.png'   = 'image/png'
  '.jpg'   = 'image/jpeg'
  '.jpeg'  = 'image/jpeg'
  '.gif'   = 'image/gif'
  '.svg'   = 'image/svg+xml'
  '.ico'   = 'image/x-icon'
  '.webp'  = 'image/webp'
  '.woff'  = 'font/woff'
  '.woff2' = 'font/woff2'
  '.ttf'   = 'font/ttf'
  '.mp3'   = 'audio/mpeg'
  '.ogg'   = 'audio/ogg'
  '.wav'   = 'audio/wav'
}

$ascii = [System.Text.Encoding]::ASCII
$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
$listener.Start()
Write-Host ("CityMetro server: http://127.0.0.1:{0}/  root={1}" -f $Port, $Root)
Write-Host 'This window closes by itself about 45 s after you close the game tab.'

$idleLimit = 45
$armed = $false
$last = Get-Date

while ($true) {
  if (-not $listener.Pending()) {
    Start-Sleep -Milliseconds 60
    if ($armed -and ((Get-Date) - $last).TotalSeconds -gt $idleLimit) { break }
    continue
  }
  $client = $null
  try {
    $client = $listener.AcceptTcpClient()
    $client.ReceiveTimeout = 4000
    $client.SendTimeout    = 15000
    $stream = $client.GetStream()
    $reader = [System.IO.StreamReader]::new($stream, $ascii, $false, 1024, $true)

    $requestLine = $reader.ReadLine()
    if ($null -ne $requestLine -and $requestLine.Length -gt 0) {
      # Consume the remaining request headers.
      while ($true) {
        $h = $reader.ReadLine()
        if ($null -eq $h -or $h.Length -eq 0) { break }
      }
      $reader.Dispose()

      $parts = $requestLine -split '\s+'
      $method = $parts[0]
      $rawPath = '/'
      if ($parts.Length -gt 1) { $rawPath = $parts[1] }
      $q = $rawPath.IndexOf('?')
      if ($q -ge 0) { $rawPath = $rawPath.Substring(0, $q) }

      if ($rawPath -eq '/__hb') {
        # heartbeat from js/serve-hb.js: arm the idle timer
        $armed = $true
        $last = Get-Date
        $hbHeader = "HTTP/1.1 204 No Content`r`nX-CityMetro: 1`r`nContent-Length: 0`r`nConnection: close`r`n`r`n"
        $hbBytes = $ascii.GetBytes($hbHeader)
        $stream.Write($hbBytes, 0, $hbBytes.Length)
        $stream.Flush()
      } else {
        $last = Get-Date
        $rel = [Uri]::UnescapeDataString($rawPath).TrimStart('/')
        $rel = $rel.Replace('/', [System.IO.Path]::DirectorySeparatorChar)
        if ([string]::IsNullOrWhiteSpace($rel)) { $rel = 'index.html' }

        $full = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($Root, $rel))
        $inside = $full.StartsWith($Root + [System.IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)
        if (-not $inside) { throw 'out of root' }
        if ([System.IO.Directory]::Exists($full)) { $full = [System.IO.Path]::Combine($full, 'index.html') }

        $status = '200 OK'
        $ctype  = 'application/octet-stream'
        if ([System.IO.File]::Exists($full)) {
          $ext = [System.IO.Path]::GetExtension($full).ToLowerInvariant()
          if ($mime.ContainsKey($ext)) { $ctype = $mime[$ext] }
          $body = [System.IO.File]::ReadAllBytes($full)
        } else {
          $status = '404 Not Found'
          $ctype  = 'text/plain; charset=utf-8'
          $body   = [System.Text.Encoding]::UTF8.GetBytes('404 Not Found')
        }
        if ($method -eq 'HEAD') { $body = [byte[]]@() }

        $header = "HTTP/1.1 $status`r`nContent-Type: $ctype`r`nContent-Length: $($body.Length)`r`nConnection: close`r`nCache-Control: no-cache`r`n`r`n"
        $hb = $ascii.GetBytes($header)
        $stream.Write($hb, 0, $hb.Length)
        if ($body.Length -gt 0) { $stream.Write($body, 0, $body.Length) }
        $stream.Flush()
      }
    } else {
      $reader.Dispose()
    }
  } catch {
    # Keep serving even if one request is malformed or the client disconnects.
  } finally {
    if ($null -ne $client) { try { $client.Close() } catch {} }
  }
}

try { $listener.Stop() } catch {}
