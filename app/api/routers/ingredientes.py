from fastapi import APIRouter, Depends

from app.api.schemas.ingredientes import IngredienteCreate, IngredienteUpdate
from app.application.servicios import ingredientes as svc
from app.core.deps import get_restaurante_id

router = APIRouter(prefix="/api/ingredientes", tags=["ingredientes"])


@router.get("")
def lista_ingredientes(rid: int = Depends(get_restaurante_id)):
    return svc.lista_ingredientes(rid)


@router.post("")
def crear_ingrediente(ing: IngredienteCreate, rid: int = Depends(get_restaurante_id)):
    return svc.crear_ingrediente(rid, ing.nombre, ing.recargo, ing.pizza)


@router.put("/{iid}")
def actualizar_ingrediente(iid: int, ing: IngredienteUpdate,
                           rid: int = Depends(get_restaurante_id)):
    campos = {}
    if ing.nombre is not None:
        campos["nombre"] = ing.nombre
    if ing.recargo is not None:
        campos["recargo"] = ing.recargo
    if ing.activo is not None:
        campos["activo"] = ing.activo
    if ing.pizza is not None:
        campos["pizza"] = ing.pizza
    return svc.actualizar_ingrediente(rid, iid, campos)


@router.delete("/{iid}")
def borrar_ingrediente(iid: int, rid: int = Depends(get_restaurante_id)):
    return svc.borrar_ingrediente(rid, iid)