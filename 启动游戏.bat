@echo off
rem ==========================================================================
rem  City and Metro - Maanshan launcher (v3.21)
rem  Opens the game in your browser. No server window is left behind:
rem  the local server runs under pythonw.exe (no console) and exits by itself
rem  about 45 s after you close the game tab. Run this file again while a server
rem  is still alive and it just reopens the browser.
rem
rem  Plain ASCII on purpose: non-ASCII batch files get misparsed line by line.
rem ==========================================================================
setlocal
set "HERE=%~dp0"

rem ---- 1. Locate the game folder -------------------------------------------
set "SITE=%~dp0city-and-metro-bus"
if not exist "%SITE%\index.html" if exist "%~dp0index.html" set "SITE=%~dp0"
if not exist "%SITE%\index.html" (
  echo [ERROR] index.html was not found.
  echo Put this .bat in the extracted folder, next to "city-and-metro-bus".
  echo.
  pause
  exit /b 1
)

rem ---- 2. Find a REAL Python ------------------------------------------------
rem WindowsApps\python.exe is only a Microsoft Store alias: "where python" finds
rem it but it cannot run anything, so always verify with -c "print(1)".
set "PY="
for %%P in (
  "%LOCALAPPDATA%\Programs\Python\Python314\python.exe"
  "%LOCALAPPDATA%\Programs\Python\Python313\python.exe"
  "%LOCALAPPDATA%\Programs\Python\Python312\python.exe"
  "%LOCALAPPDATA%\Programs\Python\Python311\python.exe"
  "%LOCALAPPDATA%\Programs\Python\Python310\python.exe"
  "C:\Python314\python.exe"
  "C:\Python313\python.exe"
  "C:\Python312\python.exe"
  "C:\Python311\python.exe"
  "%USERPROFILE%\.workbuddy\binaries\python\versions\3.14.3\python.exe"
  "%USERPROFILE%\.workbuddy\binaries\python\versions\3.13.12\python.exe"
) do (
  if not defined PY if exist %%P (
    %%P -c "print(1)" >nul 2>nul
    if not errorlevel 1 set "PY=%%~P"
  )
)
if not defined PY (
  for /f "delims=" %%F in ('where python.exe 2^>nul') do (
    if not defined PY (
      echo %%F | find /i "WindowsApps" >nul
      if errorlevel 1 (
        "%%F" -c "print(1)" >nul 2>nul
        if not errorlevel 1 set "PY=%%F"
      )
    )
  )
)

rem ---- 3a. Python path: run the server windowless and exit immediately -------
if defined PY (
  if exist "%HERE%serve.py" (
    rem pythonw.exe = same interpreter without a console window
    set "PYW=%PY:python.exe=pythonw.exe%"
    if not exist "%PYW%" set "PYW=%PY%"
    start "" "%PYW%" "%HERE%serve.py" --root "%SITE%"
    exit /b 0
  )
)

rem ---- 3b. No Python (or serve.py missing): PowerShell fallback --------------
rem server.ps1 also exits on its own after the game tab closes; its window is
rem minimized rather than hidden, because on a machine without Python that
rem window is the only place errors can show up.
set "PORT="
for %%N in (8123 8124 8125 8126 8127 8128 8129 8130) do (
  if not defined PORT (
    netstat -ano -p tcp | findstr /c:":%%N " | findstr /i /c:"LISTENING" >nul
    if errorlevel 1 set "PORT=%%N"
  )
)
if not defined PORT set "PORT=8123"
if exist "%HERE%server.ps1" (
  start "CityMetro Server" /min powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%HERE%server.ps1" -Root "%SITE%" -Port %PORT%
  echo Running the PowerShell fallback server on port %PORT%.
  echo It stops by itself once you close the game tab.
) else (
  echo [WARN] No Python and no server.ps1 - opening index.html directly.
  echo Saved games may not work in this mode; install Python to fix that:
  echo https://www.python.org/downloads/
  start "" "%SITE%\index.html"
  timeout /t 8 >nul
  exit /b 1
)

rem ---- 4. Wait until the server answers, then open the browser --------------
set "OK="
where curl.exe >nul 2>nul
if errorlevel 1 goto waitSocket
for /l %%I in (1,1,25) do (
  if not defined OK (
    curl.exe -s -o NUL -f --noproxy "*" --max-time 2 "http://127.0.0.1:%PORT%/index.html" >nul 2>nul
    if not errorlevel 1 set "OK=1"
    if not defined OK ping -n 1 -w 300 127.0.0.1 >nul
  )
)
goto opened

:waitSocket
for /l %%I in (1,1,25) do (
  if not defined OK (
    powershell -NoProfile -Command "try{$c=[Net.Sockets.TcpClient]::new('127.0.0.1',%PORT%);$c.Close();exit 0}catch{exit 1}" >nul 2>nul
    if not errorlevel 1 set "OK=1"
    if not defined OK ping -n 1 -w 300 127.0.0.1 >nul
  )
)

:opened
if defined OK (
  start "" "http://127.0.0.1:%PORT%/index.html"
) else (
  echo [WARN] The server did not answer in time - opening index.html directly.
  start "" "%SITE%\index.html"
)
exit /b 0
