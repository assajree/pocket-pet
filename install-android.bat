@echo off
setlocal

cd /d "%~dp0"

set "APK_PATH=android\app\build\outputs\apk\debug\app-debug.apk"

if not exist "%APK_PATH%" (
  echo [ERROR] APK not found at:
  echo %APK_PATH%
  echo.
  echo Build it first with:
  echo npm run android:build:debug
  exit /b 1
)

echo Installing %APK_PATH% via adb...
adb install -r "%APK_PATH%"
if errorlevel 1 (
  echo.
  echo [ERROR] adb install failed.
  exit /b %ERRORLEVEL%
)

echo.
echo Install completed.
exit /b 0
