from fastapi import APIRouter, Depends

from app.api.schemas.clientes import ClienteCreate
from app.application.servicios import clientes as svc
from app.core.deps import get_restaurante_id

router = APIRouter(prefix="/api/clientes", tags=["clientes"])


@router.get("")
def listar(q: str = "", rid: int = Depends(get_restaurante_id)):
    return svc.listar(q, rid)


@router.post("")
def crear(c: ClienteCreate, rid: int = Depends(get_restaurante_id)):
    return svc.crear(rid, c.nombre, c.telefono, c.direccion, c.notas)


@router.get("/{cid}/ultimo_pedido")
def ultimo_pedido(cid: int, rid: int = Depends(get_restaurante_id)):
    return svc.ultimo_pedido(rid, cid)