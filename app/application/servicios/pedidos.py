from datetime import datetime

from fastapi import HTTPException

from app.application.puertos import PedidosRepository
from app.domain import pedidos as reglas
from app.domain import precios as dominio_precios
from app.infrastructure.repositorios.lectura_precios import LectorPreciosSupabase
from app.infrastructure.repositorios.supabase_pedidos import SupabasePedidosRepository


def _generar_folio(rid: int, repo: PedidosRepository) -> str:
    hoy_fecha = datetime.now().strftime("%Y-%m-%d")
    hoy = datetime.now().strftime("%y%m%d")
    n = repo.contar_pedidos_hoy(rid, hoy_fecha)
    return reglas.folio_dia(hoy, n)


def crear_pedido(rid: int, p, repo: PedidosRepository = SupabasePedidosRepository()) -> dict:
    if not p.items:
        raise HTTPException(400, "El pedido no tiene productos")
    folio = _generar_folio(rid, repo)
    nombre = (p.cliente_nombre or "").strip() or "Cliente"
    if p.cliente_id:
        nombre_cliente = repo.obtener_cliente_nombre(rid, p.cliente_id)
        if nombre_cliente:
            nombre = nombre_cliente

    pedido = repo.crear_pedido(rid, {
        "folio": folio, "cliente_id": p.cliente_id, "cliente_nombre": nombre,
        "tipo": p.tipo, "mesa": p.mesa, "direccion": p.direccion, "telefono": p.telefono,
        "nota": p.nota, "metodo_pago": p.metodo_pago, "estado": "recibido", "total": 0,
    })
    pedido_id = pedido["id"]

    lector = LectorPreciosSupabase(rid)
    total = 0.0
    for item in p.items:
        prod = repo.obtener_producto(rid, item.producto_id)
        if not prod:
            raise HTTPException(404, f"Producto {item.producto_id} no existe")
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
        repo.insertar_detalle(rid, pedido_id, {
            "producto_id": prod["id"], "producto_nombre": nombre_producto,
            "cantidad": item.cantidad, "configuracion": desc,
            "precio_unitario": precio_unit, "subtotal": subtotal,
        })
    repo.actualizar_total(rid, pedido_id, total)
    return {"id": pedido_id, "folio": folio, "total": round(total, 2)}


def listar_pedidos(rid: int, estado: str | None = None, activos: bool = True,
                   repo: PedidosRepository = SupabasePedidosRepository()):
    data = repo.listar_pedidos(rid, estado, activos)
    for pd in data:
        pd["edad_seg"] = reglas.edad_seg(pd["creado_en"])
    return data


def get_pedido(rid: int, pedido_id: int, repo: PedidosRepository = SupabasePedidosRepository()):
    pd = repo.obtener_pedido(rid, pedido_id)
    if not pd:
        raise HTTPException(404, "Pedido no encontrado")
    return pd


def cambiar_estado(rid: int, pedido_id: int, estado: str, repartidor: str = "",
                   repo: PedidosRepository = SupabasePedidosRepository()):
    if not reglas.es_estado_valido(estado):
        raise HTTPException(400, f"Estado inválido: {estado}")
    ped = repo.obtener_pedido(rid, pedido_id)
    if not ped:
        raise HTTPException(404, "Pedido no encontrado")
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
    repo.actualizar_estado(rid, pedido_id, campos)
    return {"ok": True, "estado": estado}


def cancelar_pedido(rid: int, pedido_id: int, motivo: str = "",
                    repo: PedidosRepository = SupabasePedidosRepository()):
    ped = repo.obtener_pedido(rid, pedido_id)
    if not ped:
        raise HTTPException(404, "Pedido no encontrado")
    repo.actualizar_estado(rid, pedido_id, {
        "estado": "cancelado", "cancelado_en": datetime.now().isoformat(),
        "motivo_cancelacion": motivo or "cancelado manualmente",
    })
    return {"ok": True}
