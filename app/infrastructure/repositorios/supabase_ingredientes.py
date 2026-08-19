from typing import Any

from app.application.puertos import IngredientesRepository
from app.infrastructure.repositorios import base as repo


class SupabaseIngredientesRepository(IngredientesRepository):
    def listar_ingredientes(self, rid: int) -> list[dict[str, Any]]:
        data, _ = repo.select("ingredientes", restaurante_id=rid,
                              eq={"activo": 1}, order="nombre")
        return [{k: r[k] for k in ("id", "nombre", "recargo", "pizza", "activo")} for r in data]

    def crear_ingrediente(self, rid: int, datos: dict) -> int:
        data = repo.insert("ingredientes", [datos], restaurante_id=rid)
        return data[0]["id"]

    def actualizar_ingrediente(self, rid: int, iid: int, datos: dict) -> None:
        if datos:
            repo.update("ingredientes", datos, {"id": iid}, restaurante_id=rid)

    def borrar_ingrediente(self, rid: int, iid: int) -> None:
        repo.delete("ingredientes", {"id": iid}, restaurante_id=rid)
