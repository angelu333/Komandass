from fastapi import APIRouter, Depends

from app.application.servicios import reportes as svc
from app.core.deps import get_restaurante_id

router = APIRouter(prefix="/api/reportes", tags=["reportes"])


@router.get("/dia")
def resumen_dia(fecha: str = "", rid: int = Depends(get_restaurante_id)):
    return svc.resumen_dia(rid, fecha)


@router.get("/rango")
def ventas_rango(dias: int = 30, rid: int = Depends(get_restaurante_id)):
    return svc.ventas_rango(rid, dias)