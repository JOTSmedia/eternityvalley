@echo off
echo ========================================================
echo  Starting Eternity Valley...
echo  Opening in your default browser: http://localhost:8000/
echo ========================================================
start "" http://localhost:8000/
python -m http.server 8000 || python3 -m http.server 8000 || node server\server.js
pause
