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
call npm install
if errorlevel 1 goto :install_error
echo [INFO] Dependencias instaladas con exito.
echo.
goto :node_modules_ok

:install_error
echo.
echo [ERROR] Hubo un error al ejecutar 'npm install'.
echo Por favor, asegurese de estar conectado a Internet y tener Node.js instalado correctamente.
echo.
pause
exit /b

:node_modules_ok

:: Ejecutar con node
node sync_digip.js

echo.
echo ======================================================================
echo El sincronizador de stock se ha detenido.
echo ======================================================================
pause
