@echo off
title Sincronizador Ingentron - Aguas (Calvo PC)
color 0b

echo ======================================================================
echo           Sincronizador Ingentron - Aguas (Calvo PC)
echo ======================================================================
echo.
echo * Leyendo datos locales de Firebird y sincronizando a Render...
echo * Deje esta ventana abierta o programada para actualizacion continua.
echo.
echo ======================================================================
echo.

cd /d "%~dp0"

:: Ejecutar con node estandar de la PC
node sync_aguas.js

echo.
echo ======================================================================
echo El sincronizador se ha detenido.
echo ======================================================================
pause
