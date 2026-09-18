@echo off
rem Lanzador de doble clic para el Lector bilingue.
rem %~dp0 es la carpeta de este .bat: funciona en cualquier equipo y letra de
rem unidad (E:, F:...), asi que viaja con el USB. Requiere Node.js instalado.

cd /d "%~dp0"

where npm >nul 2>nul
if errorlevel 1 (
  echo No se encontro Node.js/npm en este equipo.
  echo Instala Node.js desde https://nodejs.org y vuelve a intentarlo.
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo Primera vez en este equipo: instalando dependencias...
  call npm install
)

call npm start
