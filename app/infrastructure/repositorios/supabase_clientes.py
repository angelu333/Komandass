from typing import Any, Optional

from app.application.puertos import ClientesRepository
from app.infrastructure.repositorios import base as repo


class SupabaseClientesRepository(ClientesRepository):
    def buscar_clientes(self, rid: int, query: str = "") -> list[dict[str, Any]]:
        if query:
            data, _ = repo.select("clientes", restaurante_id=rid,
                                  ilike={"nombre": f"%{query}%"}, order="nombre", limit=50)
            if not data:
                data, _ = repo.select("clientes", restaurante_id=rid,
                                      ilike={"telefono": f"%{query}%"}, order="nombre", limit=50)
        else:
            data, _ = repo.select("clientes", restaurante_id=rid, order="nombre", limit=100)
        return data

    def crear_cliente(self, rid: int, datos: dict) -> dict:
        data = repo.insert("clientes", [datos], restaurante_id=rid)
        return data[0]

    def obtener_ultimo_pedido(self, rid: int, cliente_id: int) -> Optional[dict[str, Any]]:
        pedidos, _ = repo.select("pedidos", restaurante_id=rid,
                                 eq={"cliente_id": cliente_id}, order="id", desc=True, limit=1)
        if not pedidos:
            return None
        ped = dict(pedidos[0])
        items, _ = repo.select("detalle_pedido", eq={"pedido_id": ped["id"]}, order="id",
                               columns="producto_nombre,cantidad,configuracion,subtotal")
        ped["items"] = items
        return ped
