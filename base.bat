@echo off
chcp 65001 >nul
rem Démo synchronisation : ajoute de nouvelles livraisons dans la base de l'Italie.
rem Usage : base.bat        (2 livraisons)
rem         base.bat 3      (3 livraisons)
echo.
echo  Envoi de nouvelles livraisons par l'Italie...
echo.
cd /d "%~dp0backend"
node scripts\alimenter-italie.js %1
echo.
pause
