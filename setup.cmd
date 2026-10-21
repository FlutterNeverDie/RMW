@echo off
rem Windows setup: runs setup.ps1 with ExecutionPolicy Bypass for this script only (setup.cmd -BuildSfizz to build sfizz from source)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup.ps1" %*
set RC=%ERRORLEVEL%
rem double-clicked from Explorer: keep the window open to read the result
echo %cmdcmdline% | findstr /i /c:"/c " >nul && pause
exit /b %RC%
