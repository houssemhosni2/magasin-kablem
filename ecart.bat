@echo off
chcp 65001 >nul
rem Démo : crée des écarts entre le stock et la base (annulables avec ecart-annuler.bat)
echo.
echo  Création d'écarts de test entre le stock et la base...
echo.
cd /d "%~dp0backend"
node scripts\ecart-test.js creer
echo.
pause
