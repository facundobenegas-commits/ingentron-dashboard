@echo off
title Sincronizador Ingentron - Control de Stock Digip WMS
color 0e

echo ======================================================================
echo      Sincronizador Ingentron - Control de Stock Digip WMS (RPA)
echo ======================================================================
echo.
echo * Automatizando la extraccion de stock desde Digip WMS e integrando...
echo * Deje esta ventana abierta o programada para actualizacion continua.
echo.
echo ======================================================================
echo.

cd /d "%~dp0"

:: Configurar directorio local de cache para Puppeteer (Garantiza portabilidad y evita problemas de permisos de Windows)
set PUPPETEER_CACHE_DIR=%~dp0.cache

:: Verificar si existe el archivo config.json, si no, copiarlo y salir
if exist config.json goto :config_ok
echo [ALERTA] No se encontro el archivo config.json.
echo Creando plantilla a partir de config.json.example...
copy config.json.example config.json > nul
echo.
echo [PRO-TIP] Se ha generado el archivo config.json en esta carpeta.
echo Por favor, abra el archivo config.json con un editor de texto,
echo complete sus datos de Digip WMS (usuario y contrasena) y vuelva a ejecutar.
echo.
pause
exit /b

:config_ok

:: Verificar si existe node_modules, si no, goto a install
if exist node_modules goto :node_modules_ok
echo [INFO] No se encontro la carpeta node_modules. Instalando dependencias necesarias (Puppeteer + SheetJS)...
set PUPPETEER_SKIP_DOWNLOAD=true
call npm install
set PUPPETEER_SKIP_DOWNLOAD=
if errorlevel 1 goto :install_error
echo [INFO] Descargando e instalando el navegador Chromium de Puppeteer...
rmdir /s /q "%PUPPETEER_CACHE_DIR%" 2>nul
call node node_modules\puppeteer\install.mjs
echo [INFO] Dependencias instaladas con exito.
echo.
goto :node_modules_ok

:install_error
echo.
echo [ERROR] Hubo un error al ejecutar 'npm install'.
echo Detectamos que puede haber una descarga corrupta del navegador o carpetas bloqueadas.
echo.
echo Desea que el script limpie la cache de Puppeteer e intente de nuevo?
set /p rta_clean="Escriba 'S' para limpiar cache e instalar, o pulse Enter para salir: "
if /i "%rta_clean%"=="S" (
    echo.
    echo [INFO] Limpiando carpeta node_modules local...
    rmdir /s /q node_modules 2>nul
    echo [INFO] Limpiando cache corrupta de Puppeteer en %PUPPETEER_CACHE_DIR%...
    rmdir /s /q "%PUPPETEER_CACHE_DIR%" 2>nul
    echo.
    echo [INFO] Reintentando instalacion fresca sin descargas automaticas...
    set PUPPETEER_SKIP_DOWNLOAD=true
    call npm install
    set PUPPETEER_SKIP_DOWNLOAD=
    if errorlevel 1 (
        echo.
        echo [ERROR] Volvio a fallar. Por favor revise su conexion de red.
        pause
        exit /b
    )
    echo.
    echo [INFO] Instalando el navegador Chromium en la cache limpia...
    call node node_modules\puppeteer\install.mjs
    echo.
    echo [INFO] Dependencias y navegador instalados con exito!
    echo.
    goto :node_modules_ok
)
pause
exit /b

:node_modules_ok

:: Ejecutar con node
node sync_digip.js
if errorlevel 1 goto :sync_error

echo.
echo ======================================================================
echo El sincronizador de stock se ha detenido.
echo ======================================================================
pause
exit /b

:sync_error
echo.
echo [ALERTA] El sincronizador se detuvo con errores.
echo Es probable que falte el navegador Chromium o este corrupto en la cache.
echo.
echo Desea intentar limpiar la cache corrupta y descargar Chromium ahora mismo?
set /p rta="Escriba 'S' para limpiar cache e instalar, o pulse Enter para salir: "
if /i "%rta%"=="S" (
    echo.
    echo [INFO] Limpiando cache corrupta de Puppeteer en %PUPPETEER_CACHE_DIR%...
    rmdir /s /q "%PUPPETEER_CACHE_DIR%" 2>nul
    echo.
    echo [INFO] Descargando e instalando Chromium de forma automatica...
    call node node_modules\puppeteer\install.mjs
    echo.
    echo [INFO] Instalacion finalizada. Reejecutando el sincronizador...
    echo.
    node sync_digip.js
)
pause
