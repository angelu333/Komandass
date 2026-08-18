from datetime import datetime, timedelta, timezone

from app.infrastructure.repositorios import base as repo


def _iso_local(fecha_str, extremo):
    """Convierte una fecha local (YYYY-MM-DD) a límites ISO en UTC.

    PostgREST compara timestamptz contra la cadena tal cual; si pasamos
    fecha local con turno horario negativo quedaría fuera del rango real.
    """
    try:
        fecha = datetime.strptime(fecha_str, "%Y-%m-%d")
    except ValueError:
        return fecha_str
    tz = datetime.now().astimezone().tzinfo
    if extremo == "inicio":
        local = fecha.replace(hour=0, minute=0, second=0, microsecond=0, tzinfo=tz)
    else:
        local = fecha.replace(hour=23, minute=59, second=59, microsecond=999000, tzinfo=tz)
    return local.astimezone(timezone.utc).isoformat()


def _dia(fecha):
    try:
        return datetime.fromisoformat(str(fecha).replace("Z", "+00:00")).astimezone().strftime("%Y-%m-%d")
    except Exception:
        return str(fecha)[:10]


def resumen_dia(rid: int, fecha: str = ""):
    if not fecha:
        fecha = datetime.now().astimezone().strftime("%Y-%m-%d")
    inicio = _iso_local(fecha, "inicio")
    fin = _iso_local(fecha, "fin")

    data, _ = repo.select("pedidos", restaurante_id=rid,
                          gte={"creado_en": inicio}, lte={"creado_en": fin})
    pedidos = [p for p in data if p["estado"] != "cancelado"]
    pagados = [p for p in pedidos if p["estado"] == "entregado"]

    total = round(sum(p["total"] for p in pedidos), 2)
    por_pago = {}
    for p in pagados:
        clave = p["metodo_pago"] or "No definido"
        por_pago[clave] = round(por_pago.get(clave, 0) + p["total"], 2)

    contar = {}
    for p in pedidos:
        dets, _ = repo.select("detalle_pedido", eq={"pedido_id": p["id"]},
                              columns="producto_nombre,cantidad")
        for d in dets:
            contar[d["producto_nombre"]] = contar.get(d["producto_nombre"], 0) + d["cantidad"]
    top = sorted(contar.items(), key=lambda x: x[1], reverse=True)[:10]

    repartidores = {}
    for p in pedidos:
        if p.get("tipo") != "domicilio" or not p.get("repartidor_nombre"):
            continue
        nombre = p["repartidor_nombre"].strip()
        r = repartidores.setdefault(nombre, {"nombre": nombre, "asignados": 0, "en_camino": 0,
                                             "entregados": 0, "efectivo_por_rendir": 0.0,
                                             "pendiente_por_cobrar": 0.0})
        r["asignados"] += 1
        if p["estado"] == "en_camino":
            r["en_camino"] += 1
            if p.get("metodo_pago") == "efectivo":
                r["pendiente_por_cobrar"] += p["total"]
        elif p["estado"] == "entregado":
            r["entregados"] += 1
            if p.get("metodo_pago") == "efectivo":
                r["efectivo_por_rendir"] += p["total"]
    repartidores_lista = [
        {**r, "efectivo_por_rendir": round(r["efectivo_por_rendir"], 2),
         "pendiente_por_cobrar": round(r["pendiente_por_cobrar"], 2)}
        for r in sorted(repartidores.values(), key=lambda x: x["nombre"].lower())
    ]

    return {
        "fecha": fecha,
        "pedidos": len(pedidos),
        "entregados": len(pagados),
        "en_proceso": len([p for p in pedidos if p["estado"] != "entregado"]),
        "total": total,
        "por_pago": por_pago,
        "top": [{"nombre": n, "cantidad": c} for n, c in top],
        "repartidores": repartidores_lista,
        "lista": pedidos,
    }


def ventas_rango(rid: int, dias: int = 30):
    hoy = datetime.now().astimezone()
    inicio_fecha = (hoy - timedelta(days=dias - 1)).strftime("%Y-%m-%d")
    hoy_fecha = hoy.strftime("%Y-%m-%d")
    inicio = _iso_local(inicio_fecha, "inicio")
    fin = _iso_local(hoy_fecha, "fin")

    data, _ = repo.select("pedidos", restaurante_id=rid,
                          gte={"creado_en": inicio}, lte={"creado_en": fin})
    por_dia = {}
    for p in data:
        if p["estado"] == "cancelado":
            continue
        d = _dia(p["creado_en"])
        if d not in por_dia:
            por_dia[d] = {"dia": d, "total": 0.0, "n": 0}
        por_dia[d]["total"] = round(por_dia[d]["total"] + p["total"], 2)
        por_dia[d]["n"] += 1
    datos = [por_dia[k] for k in sorted(por_dia.keys())]
    return {"inicio": inicio_fecha, "fin": hoy_fecha, "datos": datos}
