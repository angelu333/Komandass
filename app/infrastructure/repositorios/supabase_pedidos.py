import json
from typing import Any, Optional

from app.application.puertos import PedidosRepository
from app.infrastructure.repositorios import base as repo


class SupabasePedidosRepository(PedidosRepository):
    def contar_pedidos_hoy(self, rid: int, fecha_hoy: str) -> int:
        inicio = fecha_hoy + "T00:00:00.000"
        fin = fecha_hoy + "T23:59:59.999"
        _, count = repo.select("pedidos", restaurante_id=rid,
                               gte={"creado_en": inicio}, lte={"creado_en": fin},
                               columns="id", count="exact")
        return count or 0

    def obtener_producto(self, rid: int, producto_id: int) -> Optional[dict[str, Any]]:
        prod, _ = repo.select("productos", restaurante_id=rid,
                              eq={"id": producto_id, "activo": 1})
        if not prod:
            return None
        p = dict(prod[0])
        try:
            p["precios"] = json.loads(p.get("precios")) if p.get("precios") else {}
        except (TypeError, ValueError):
            p["precios"] = {}
        receta, _ = repo.select("producto_ingrediente", restaurante_id=rid,
                                eq={"producto_id": producto_id, "base": 1},
                                columns="ingrediente_id")
        p["receta"] = [r["ingrediente_id"] for r in receta]
        return p

    def obtener_cliente_nombre(self, rid: int, cliente_id: int) -> Optional[str]:
        cl, _ = repo.select("clientes", restaurante_id=rid,
                            eq={"id": cliente_id}, columns="nombre")
        if cl:
            return cl[0]["nombre"]
        return None

    def crear_pedido(self, rid: int, datos: dict) -> dict:
        pedidos = repo.insert("pedidos", [datos], restaurante_id=rid)
        return pedidos[0]

    def insertar_detalle(self, rid: int, pedido_id: int, item_data: dict) -> None:
        item_data["pedido_id"] = pedido_id
        repo.insert("detalle_pedido", [item_data], restaurante_id=rid)

    def actualizar_total(self, rid: int, pedido_id: int, total: float) -> None:
        repo.update("pedidos", {"total": round(total, 2)}, {"id": pedido_id}, restaurante_id=rid)

    def listar_pedidos(self, rid: int, estado: Optional[str], activos: bool) -> list[dict[str, Any]]:
        if activos:
            data, _ = repo.select("pedidos", restaurante_id=rid,
                                  neq={"estado": "entregado"}, order="id", desc=True)
            data = [p for p in data if p["estado"] != "cancelado"]
        else:
            data, _ = repo.select("pedidos", restaurante_id=rid, order="id", desc=True)
        result = []
        for ped in data:
            if estado and ped["estado"] != estado:
                continue
            pd = dict(ped)
            items, _ = repo.select("detalle_pedido", eq={"pedido_id": ped["id"]}, order="id")
            pd["items"] = items
            result.append(pd)
        return result

    def obtener_pedido(self, rid: int, pedido_id: int) -> Optional[dict[str, Any]]:
        data, _ = repo.select("pedidos", restaurante_id=rid, eq={"id": pedido_id})
        if not data:
            return None
        pd = dict(data[0])
        items, _ = repo.select("detalle_pedido", eq={"pedido_id": pedido_id}, order="id")
        pd["items"] = items
        return pd

    def actualizar_estado(self, rid: int, pedido_id: int, campos: dict) -> None:
        repo.update("pedidos", campos, {"id": pedido_id}, restaurante_id=rid)
