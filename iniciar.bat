@echo off
title Comandas - Sistema multinegocio
cd /d "%~dp0"
echo Verificando Python...
where python >nul 2>nul || (echo No se encontro Python en PATH & pause & exit /b 1)
echo Verificando dependencias...
python -c "import fastapi, uvicorn, supabase, httpx" >nul 2>nul || (
  echo Instalando dependencias...
  pip install -r requirements.txt || (echo Fallo al instalar dependencias & pause & exit /b 1)
)
echo Iniciando servidor en http://localhost:8123 ...
start "" http://localhost:8123
python -m uvicorn app.main:app --host 127.0.0.1 --port 8123
pause