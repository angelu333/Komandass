import json
from datetime import datetime

from fastapi import HTTPException

from app.domain import pedidos as reglas
from app.domain import precios as dominio_precios
from app.infrastructure.repositorios import base as repo
from app.infrastructure.repositorios.lectura_precios import LectorPreciosSupabase


def _generar_folio(rid: int) -> str:
    hoy_fecha = datetime.now().strftime("%Y-%m-%d")
    hoy = datetime.now().strftime("%y%m%d")
    inicio = hoy_fecha + "T00:00:00.000"
    fin = hoy_fecha + "T23:59:59.999"
    data, count = repo.select("pedidos", restaurante_id=rid,
                              gte={"creado_en": inicio}, lte={"creado_en": fin},
                              columns="id", count="exact")
    n = count or 0
    return reglas.folio_dia(hoy, n)


def _leer_producto(rid: int, producto_id: int):
    prod, _ = repo.select("productos", restaurante_id=rid,
                          eq={"id": producto_id, "activo": 1})
    if not prod:
        raise HTTPException(404, f"Producto {producto_id} no existe")
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


def crear_pedido(rid: int, p) -> dict:
    if not p.items:
        raise HTTPException(400, "El pedido no tiene productos")
    folio = _generar_folio(rid)
    nombre = (p.cliente_nombre or "").strip() or "Cliente"
    if p.cliente_id:
        cl = repo.select("clientes", restaurante_id=rid,
                         eq={"id": p.cliente_id}, columns="nombre")[0]
        if cl:
            nombre = cl[0]["nombre"]
    pedido = repo.insert("pedidos", [{
        "folio": folio, "cliente_id": p.cliente_id, "cliente_nombre": nombre,
        "tipo": p.tipo, "mesa": p.mesa, "direccion": p.direccion, "telefono": p.telefono,
        "nota": p.nota, "metodo_pago": p.metodo_pago, "estado": "recibido", "total": 0,
    }], restaurante_id=rid)[0]
    pedido_id = pedido["id"]

    lector = LectorPreciosSupabase(rid)
    total = 0.0
    for item in p.items:
        prod = _leer_producto(rid, item.producto_id)
        precio_unit = dominio_precios.calcular_precio(
            prod, item.opciones, item.ingredientes_extra, item.personalizada,
            tamano=item.tamano, lector=lector)
        desc = dominio_precios.construir_descripcion(
            prod, item.opciones, item.ingredientes_extra, item.personalizada,
            tamano=item.tamano, lector=lector)
        if (item.nota or "").strip():
            desc = (desc + " · " if desc else "") + "Nota: " + item.nota.strip()
        subtotal = round(precio_unit * item.cantidad, 2)
        total += subtotal
        nombre_producto = (item.nombre_personalizado or "").strip() or prod["nombre"]
        repo.insert("detalle_pedido", [{
            "pedido_id": pedido_id, "producto_id": prod["id"], "producto_nombre": nombre_producto,
            "cantidad": item.cantidad, "configuracion": desc,
            "precio_unitario": precio_unit, "subtotal": subtotal,
        }], restaurante_id=rid)
    repo.update("pedidos", {"total": round(total, 2)}, {"id": pedido_id},
                restaurante_id=rid)
    return {"id": pedido_id, "folio": folio, "total": round(total, 2)}


def listar_pedidos(rid: int, estado: str | None = None, activos: bool = True):
    if activos:
        filtros = {"estado": "entregado"}
        data, _ = repo.select("pedidos", restaurante_id=rid,
                              neq=filtros, order="id", desc=True)
        data = [p for p in data if p["estado"] != "cancelado"]
    else:
        data, _ = repo.select("pedidos", restaurante_id=rid, order="id", desc=True)
    result = []
    for ped in data:
        if estado and ped["estado"] != estado:
            continue
        pd = dict(ped)
        pd["edad_seg"] = reglas.edad_seg(ped["creado_en"])
        items, _ = repo.select("detalle_pedido", eq={"pedido_id": ped["id"]}, order="id")
        pd["items"] = items
        result.append(pd)
    return result


def get_pedido(rid: int, pedido_id: int):
    data, _ = repo.select("pedidos", restaurante_id=rid, eq={"id": pedido_id})
    if not data:
        raise HTTPException(404, "Pedido no encontrado")
    pd = dict(data[0])
    items, _ = repo.select("detalle_pedido", eq={"pedido_id": pedido_id}, order="id")
    pd["items"] = items
    return pd


def cambiar_estado(rid: int, pedido_id: int, estado: str, repartidor: str = ""):
    if not reglas.es_estado_valido(estado):
        raise HTTPException(400, f"Estado inválido: {estado}")
    data, _ = repo.select("pedidos", restaurante_id=rid, eq={"id": pedido_id})
    if not data:
        raise HTTPException(404, "Pedido no encontrado")
    ped = data[0]
    if ped["estado"] == "cancelado":
        raise HTTPException(400, "El pedido ya está cancelado")
    if not reglas.es_transicion_valida(ped["estado"], estado):
        raise HTTPException(400, f"No se puede pasar de {ped['estado']} a {estado}")
    campos = reglas.marca_temporal(estado)
    if estado == "en_camino":
        if ped["tipo"] != "domicilio":
            raise HTTPException(400, "Sólo los pedidos a domicilio pueden enviarse con repartidor")
        repartidor = repartidor.strip()
        if not repartidor:
            raise HTTPException(400, "Escribe el nombre del repartidor")
        campos["repartidor_nombre"] = repartidor
    repo.update("pedidos", campos, {"id": pedido_id}, restaurante_id=rid)
    return {"ok": True, "estado": estado}


def cancelar_pedido(rid: int, pedido_id: int, motivo: str = ""):
    data, _ = repo.select("pedidos", restaurante_id=rid, eq={"id": pedido_id})
    if not data:
        raise HTTPException(404, "Pedido no encontrado")
    repo.update("pedidos", {
        "estado": "cancelado", "cancelado_en": datetime.now().isoformat(),
        "motivo_cancelacion": motivo or "cancelado manualmente",
    }, {"id": pedido_id}, restaurante_id=rid)
    return {"ok": True}
