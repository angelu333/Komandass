from fastapi import HTTPException

from app.application.puertos import IngredientesRepository
from app.infrastructure.repositorios.supabase_ingredientes import (
    SupabaseIngredientesRepository,
)


def lista_ingredientes(rid: int, repo: IngredientesRepository = SupabaseIngredientesRepository()):
    return repo.listar_ingredientes(rid)


def crear_ingrediente(rid: int, nombre: str, recargo: float, pizza: int = 1,
                      repo: IngredientesRepository = SupabaseIngredientesRepository()):
    if not nombre.strip():
        raise HTTPException(400, "El nombre es obligatorio")
    iid = repo.crear_ingrediente(rid, {
        "nombre": nombre.strip(), "recargo": recargo,
        "pizza": pizza, "descontable": 1, "activo": 1,
    })
    return {"id": iid}


def actualizar_ingrediente(rid: int, iid: int, campos: dict,
                           repo: IngredientesRepository = SupabaseIngredientesRepository()):
    repo.actualizar_ingrediente(rid, iid, campos)
    return {"ok": True}


def borrar_ingrediente(rid: int, iid: int, repo: IngredientesRepository = SupabaseIngredientesRepository()):
    repo.borrar_ingrediente(rid, iid)
    return {"ok": True}