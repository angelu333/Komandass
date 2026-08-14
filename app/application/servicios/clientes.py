from app.infrastructure.repositorios import base as repo


def listar(q: str = "", rid: int = None):
    if q:
        data, _ = repo.select("clientes", restaurante_id=rid,
                              ilike={"nombre": f"%{q}%"}, order="nombre", limit=50)
        if not data:
            data, _ = repo.select("clientes", restaurante_id=rid,
                                  ilike={"telefono": f"%{q}%"}, order="nombre", limit=50)
    else:
        data, _ = repo.select("clientes", restaurante_id=rid, order="nombre", limit=100)
    return data


def crear(rid: int, nombre: str, telefono: str, direccion: str, notas: str):
    data = repo.insert("clientes", [{
        "nombre": nombre.strip(), "telefono": telefono,
        "direccion": direccion, "notas": notas,
    }], restaurante_id=rid)
    return {"id": data[0]["id"]}


def ultimo_pedido(rid: int, cid: int):
    pedidos, _ = repo.select("pedidos", restaurante_id=rid,
                             eq={"cliente_id": cid}, order="id", desc=True, limit=1)
    if not pedidos:
        return None
    ped = dict(pedidos[0])
    items, _ = repo.select("detalle_pedido", eq={"pedido_id": ped["id"]}, order="id",
                           columns="producto_nombre,cantidad,configuracion,subtotal")
    ped["items"] = items
    return ped