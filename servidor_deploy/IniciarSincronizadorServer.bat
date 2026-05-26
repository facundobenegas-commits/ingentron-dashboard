@echo off
title Sincronizador Ingentron (Servidor)
color 0b

echo ======================================================================
echo           Sincronizador Ingentron Ejecutándose en el Servidor
echo ======================================================================
echo.
echo * Leyendo datos locales de Firebird y sincronizando a Render...
echo * Deje esta ventana abierta o programada para actualización continua.
echo.
echo ======================================================================
echo.

cd /d "%~dp0"

:: Ejecutar con node estándar del servidor
node sync.js

echo.
echo ======================================================================
echo El sincronizador se ha detenido.
echo ======================================================================
pause
