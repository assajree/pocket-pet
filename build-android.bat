@echo off
setlocal

cd /d "%~dp0"

set "MODE=%~1"
if "%MODE%"=="" set "MODE=debug"

if /I "%MODE%"=="debug" goto :build_debug
if /I "%MODE%"=="release" goto :build_release
if /I "%MODE%"=="sync" goto :sync_only
if /I "%MODE%"=="help" goto :help

echo [ERROR] Unknown mode: %MODE%
goto :help

:sync_only
echo [1/1] Sync Android project...
call npm run android:sync
if errorlevel 1 goto :fail
echo.
echo Sync completed.
goto :success

:build_debug
echo [1/2] Sync Android project...
call npm run android:sync
if errorlevel 1 goto :fail

echo.
echo [2/2] Build Debug APK...
pushd android
call gradlew.bat assembleDebug
set "BUILD_EXIT=%ERRORLEVEL%"
popd
if not "%BUILD_EXIT%"=="0" goto :fail_gradle

echo.
echo Debug APK should be available at:
echo android\app\build\outputs\apk\debug\app-debug.apk
goto :success

:build_release
echo [1/2] Sync Android project...
call npm run android:sync
if errorlevel 1 goto :fail

echo.
echo [2/2] Build Release APK...
pushd android
call gradlew.bat assembleRelease
set "BUILD_EXIT=%ERRORLEVEL%"
popd
if not "%BUILD_EXIT%"=="0" goto :fail_gradle

echo.
echo Release APK is usually available at one of these paths:
echo android\app\build\outputs\apk\release\app-release.apk
echo android\app\build\outputs\apk\release\app-release-unsigned.apk
goto :success

:help
echo Usage:
echo   build-android.bat [debug^|release^|sync]
echo.
echo Examples:
echo   build-android.bat
echo   build-android.bat debug
echo   build-android.bat release
echo   build-android.bat sync
exit /b 1

:fail_gradle
echo.
echo [ERROR] Gradle build failed with exit code %BUILD_EXIT%.
exit /b %BUILD_EXIT%

:fail
echo.
echo [ERROR] Command failed with exit code %ERRORLEVEL%.
exit /b %ERRORLEVEL%

:success
exit /b 0
