@echo off
chcp 65001 >nul
title Magasin Kablem - demarrage mobile
rem Demarre l'API (port 3000) et l'application mobile (https, port 8100) dans deux fenetres,
rem puis affiche l'adresse a ouvrir sur le telephone (meme Wi-Fi que le PC, ex. « Kablem Guest »).

set RACINE=%~dp0

rem API : seulement si elle ne tourne pas deja
powershell -NoProfile -Command "if (Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }"
if errorlevel 1 (
  start "API Magasin Kablem" /min cmd /k "cd /d "%RACINE%backend" && npm run dev"
) else (
  echo API deja demarree sur le port 3000.
)

rem Application mobile : seulement si elle ne tourne pas deja
powershell -NoProfile -Command "if (Get-NetTCPConnection -LocalPort 8100 -State Listen -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }"
if errorlevel 1 (
  start "Mobile Magasin Kablem" /min cmd /k "cd /d "%RACINE%mobile" && npm start"
) else (
  echo Application mobile deja demarree sur le port 8100.
)

echo.
echo Attente du demarrage...
powershell -NoProfile -Command "$fin=(Get-Date).AddMinutes(3); while((Get-Date) -lt $fin -and -not (Get-NetTCPConnection -LocalPort 8100 -State Listen -ErrorAction SilentlyContinue)){Start-Sleep 2}"

echo.
echo ============================================================
echo  Sur le telephone (meme Wi-Fi que ce PC), ouvrez :
powershell -NoProfile -Command "Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -match 'Wi-?Fi|Ethernet' -and $_.IPAddress -notmatch '^(169\.254|127\.)' } | ForEach-Object { '    https://' + $_.IPAddress + ':8100   (' + $_.InterfaceAlias + ')' }"
echo.
echo  Wi-Fi Kablem Guest : https://192.168.28.91:8100 (si le PC a garde cette adresse)
echo  Ne fermez pas les fenetres « API » et « Mobile » : elles font tourner l'application.
echo ============================================================
echo.
pause
