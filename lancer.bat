@echo off
rem Ouvre l'app sur ce PC (double-cliquer). Laisser la fenetre ouverte pendant l'utilisation.
start "" http://localhost:8080/
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0outils\serveur.ps1" -Root "%~dp0." -Port 8080
