@echo off
chcp 65001 >nul
rem Annule les écarts créés par ecart.bat
echo.
echo  Annulation des écarts de test...
echo.
cd /d "%~dp0backend"
node scripts\ecart-test.js annuler
echo.
pause
