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

:: Ejecutar con node estandar de la PC
node sync_pepsi.js

echo.
echo ======================================================================
echo El sincronizador se ha detenido.
echo ======================================================================
pause
