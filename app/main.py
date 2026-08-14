import socket
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.api.routers import auth, clientes, ingredientes, menu, pedidos, reportes

app = FastAPI(title="Comandas - Sistema multinegocio")

app.include_router(auth.router)
app.include_router(pedidos.router)
app.include_router(menu.router)
app.include_router(ingredientes.router)
app.include_router(clientes.router)
app.include_router(reportes.router)

STATIC = Path(__file__).resolve().parent.parent / "static"
app.mount("/static", StaticFiles(directory=STATIC), name="static")


@app.get("/")
def index():
    return FileResponse(STATIC / "index.html")


@app.get("/api/ip")
def get_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return {"ip": ip}
    except Exception:
        return {"ip": "127.0.0.1"}