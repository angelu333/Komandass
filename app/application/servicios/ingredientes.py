from fastapi import HTTPException

from app.infrastructure.repositorios import base as repo


def lista_ingredientes(rid: int):
    data, _ = repo.select("ingredientes", restaurante_id=rid,
                          eq={"activo": 1}, order="nombre")
    return [{k: r[k] for k in ("id", "nombre", "recargo", "pizza", "activo")} for r in data]


def crear_ingrediente(rid: int, nombre: str, recargo: float, pizza: int = 1):
    if not nombre.strip():
        raise HTTPException(400, "El nombre es obligatorio")
    data = repo.insert("ingredientes", [{
        "nombre": nombre.strip(), "recargo": recargo,
        "pizza": pizza, "descontable": 1, "activo": 1,
    }], restaurante_id=rid)
    return {"id": data[0]["id"]}


def actualizar_ingrediente(rid: int, iid: int, campos: dict):
    if campos:
        repo.update("ingredientes", campos, {"id": iid}, restaurante_id=rid)
    return {"ok": True}


def borrar_ingrediente(rid: int, iid: int):
    repo.delete("ingredientes", {"id": iid}, restaurante_id=rid)
    return {"ok": True}