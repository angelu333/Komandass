from fastapi import APIRouter, Depends

from app.api.schemas.pedidos import PedidoCreate
from app.application.servicios import pedidos as svc
from app.core.deps import get_restaurante_id

router = APIRouter(prefix="/api/pedidos", tags=["pedidos"])


@router.post("")
def crear_pedido(p: PedidoCreate, rid: int = Depends(get_restaurante_id)):
    return svc.crear_pedido(rid, p)


@router.get("")
def listar_pedidos(estado: str | None = None, activos: bool = True,
                   rid: int = Depends(get_restaurante_id)):
    return svc.listar_pedidos(rid, estado, activos)


@router.get("/{pedido_id}")
def get_pedido(pedido_id: int, rid: int = Depends(get_restaurante_id)):
    return svc.get_pedido(rid, pedido_id)


@router.post("/{pedido_id}/estado")
def cambiar_estado(pedido_id: int, estado: str, repartidor: str = "",
                   rid: int = Depends(get_restaurante_id)):
    return svc.cambiar_estado(rid, pedido_id, estado, repartidor)


@router.post("/{pedido_id}/cancelar")
def cancelar_pedido(pedido_id: int, motivo: str = "", rid: int = Depends(get_restaurante_id)):
    return svc.cancelar_pedido(rid, pedido_id, motivo)
