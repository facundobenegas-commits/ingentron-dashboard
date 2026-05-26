@echo off
title Sincronizador Ingentron - PepsiCo (Gescom PC)
color 0b

echo ======================================================================
echo           Sincronizador Ingentron - PepsiCo (Gescom PC)
echo ======================================================================
echo.
echo * Leyendo datos locales de SQL Server y sincronizando a Render...
echo * Deje esta ventana abierta o programada para actualizacion continua.
echo.
echo ======================================================================
echo.

cd /d "%~dp0"

:: Verificar si existe node_modules, si no, instalar dependencias automáticamente
if not exist node_modules (
    echo [INFO] No se encontro la carpeta node_modules. Instalando dependencias necesarias...
    call npm install
    if errorlevel 1 (
        echo.
        echo [ERROR] Hubo un error al ejecutar 'npm install'.
        echo Por favor, asegurese de estar conectado a Internet y tener Node.js instalado correctamente.
        echo.
        pause
        exit /b
    )
    echo [INFO] Dependencias instaladas con exito.
    echo.
)

:: Ejecutar con node estandar de la PC
node sync_pepsi.js

echo.
echo ======================================================================
echo El sincronizador se ha detenido.
echo ======================================================================
pause
