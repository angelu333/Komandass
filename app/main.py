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


@app.get("/sw.js")
def service_worker():
    return FileResponse(STATIC / "sw.js", media_type="application/javascript")
