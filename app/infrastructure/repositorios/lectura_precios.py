from app.infrastructure.repositorios import base as repo


class LectorPreciosSupabase:
    """Adaptador de infraestructura que provee los datos de precios al dominio."""

    def __init__(self, restaurante_id: int | None):
        self.rid = restaurante_id

    def recargo_ingrediente(self, ing_id: int) -> float:
        filas, _ = repo.select("ingredientes", restaurante_id=self.rid,
                               eq={"id": ing_id}, columns="recargo")
        return float(filas[0]["recargo"]) if filas else 0.0

    def nombre_ingrediente(self, ing_id: int) -> str:
        filas, _ = repo.select("ingredientes", restaurante_id=self.rid,
                               eq={"id": ing_id}, columns="nombre")
        return filas[0]["nombre"] if filas else f"#{ing_id}"

    def recargo_opcion(self, opcion_id: int) -> float:
        filas, _ = repo.select("opciones", restaurante_id=self.rid,
                               eq={"id": opcion_id}, columns="recargo")
        return float(filas[0]["recargo"]) if filas else 0.0

    def opcion(self, opcion_id: int) -> dict | None:
        filas, _ = repo.select("opciones", restaurante_id=self.rid,
                               eq={"id": opcion_id}, columns="nombre,grupo_id")
        return filas[0] if filas else None

    def nombre_grupo(self, grupo_id: int) -> str | None:
        filas, _ = repo.select("grupos_opciones", restaurante_id=self.rid,
                               eq={"id": grupo_id}, columns="nombre")
        return filas[0]["nombre"] if filas else None

    def precio_combinado(self) -> float:
        valor = repo.get_config("precio_combinado", "15", restaurante_id=self.rid)
        try:
            return float(valor)
        except (TypeError, ValueError):
            return 15.0