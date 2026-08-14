import json

from fastapi import HTTPException

from app.infrastructure.repositorios import base as repo


def _parse_precios(raw):
    if isinstance(raw, dict):
        return raw
    if not raw:
        return {}
    try:
        return json.loads(raw) if isinstance(raw, str) else {}
    except (TypeError, ValueError):
        return {}


def _receta_producto(rid: int, producto_id: int) -> list[int]:
    filas, _ = repo.select("producto_ingrediente", restaurante_id=rid,
                           eq={"producto_id": producto_id, "base": 1},
                           columns="ingrediente_id")
    return [f["ingrediente_id"] for f in filas]


def _enriquecer_producto(rid: int, p: dict) -> dict:
    p = dict(p)
    p["precios"] = _parse_precios(p.get("precios"))
    p["receta"] = _receta_producto(rid, p["id"])
    return p


# ---------- CATÁLOGO (menú del negocio) ----------
def get_menu(rid: int):
    categorias, _ = repo.select("categorias", restaurante_id=rid,
                                eq={"activa": 1}, order="orden")
    result = []
    for cat in categorias:
        productos, _ = repo.select("productos", restaurante_id=rid,
                                   eq={"categoria_id": cat["id"], "activo": 1}, order="orden")
        productos = [_enriquecer_producto(rid, p) for p in productos]
        grupos, _ = repo.select("grupos_opciones", eq={"categoria_id": cat["id"]}, order="orden")
        grupos_rich = []
        for g in grupos:
            gd = dict(g)
            opts, _ = repo.select("opciones", eq={"grupo_id": g["id"]}, order="orden")
            gd["opciones"] = opts
            grupos_rich.append(gd)
        result.append({"categoria": cat, "productos": productos, "opciones": grupos_rich})
    return result


def productos_activos(rid: int):
    data, _ = repo.select("productos", restaurante_id=rid, eq={"activo": 1}, order="orden")
    return [_enriquecer_producto(rid, p) for p in data]


def catalogo_completo(rid: int):
    categorias, _ = repo.select("categorias", restaurante_id=rid, order="orden")
    result = []
    for cat in categorias:
        productos, _ = repo.select("productos", restaurante_id=rid,
                                   eq={"categoria_id": cat["id"]}, order="orden")
        productos = [_enriquecer_producto(rid, p) for p in productos]
        opciones, _ = repo.select("grupos_opciones", eq={"categoria_id": cat["id"]}, order="orden")
        for g in opciones:
            g["opciones"] = repo.select("opciones", eq={"grupo_id": g["id"]}, order="orden")[0]
        result.append({"categoria": cat, "productos": productos, "opciones": opciones})
    return result


def ingredientes_activos(rid: int):
    data, _ = repo.select("ingredientes", restaurante_id=rid, eq={"activo": 1}, order="nombre")
    return [{k: r[k] for k in ("id", "nombre", "recargo", "pizza")} for r in data]


def personalizados(rid: int):
    grupos, _ = repo.select("grupos_opciones", restaurante_id=rid, order="orden")
    out = []
    for g in grupos:
        gd = dict(g)
        opts, _ = repo.select("opciones", eq={"grupo_id": g["id"]}, order="orden")
        gd["opciones"] = opts
        out.append(gd)
    return out


def todas_opciones(rid: int):
    return personalizados(rid)


def precio_combinado(rid: int):
    return {"valor": repo.get_config("precio_combinado", "15", restaurante_id=rid)}


def editar_precio_combinado(rid: int, valor: str):
    repo.set_config("precio_combinado", valor, restaurante_id=rid)
    return {"ok": True}


# ---------- CATEGORÍAS ----------
def crear_categoria(rid: int, nombre: str, icono: str, orden: int, activa: int):
    if not nombre.strip():
        raise HTTPException(400, "El nombre es obligatorio")
    data = repo.insert("categorias", [{
        "nombre": nombre.strip(), "icono": icono,
        "orden": orden, "activa": activa,
    }], restaurante_id=rid)
    return {"id": data[0]["id"]}


def editar_categoria(rid: int, cid: int, campos: dict):
    if campos.get("nombre") is not None:
        campos["nombre"] = str(campos["nombre"]).strip()
    if campos:
        repo.update("categorias", campos, {"id": cid}, restaurante_id=rid)
    return {"ok": True}


def borrar_categoria(rid: int, cid: int):
    # No se borra nada: se desactiva para conservar menú e histórico.
    repo.update("categorias", {"activa": 0}, {"id": cid}, restaurante_id=rid)
    return {"ok": True}


# ---------- GRUPOS DE OPCIONES ----------
def crear_grupo(rid: int, nombre: str, categoria_id: int, seleccion_texto: str = "elegir_una", orden: int = 0):
    if not nombre.strip():
        raise HTTPException(400, "El nombre del grupo es obligatorio")
    data = repo.insert("grupos_opciones", [{
        "nombre": nombre.strip(), "categoria_id": categoria_id,
        "seleccion_texto": seleccion_texto, "orden": orden,
    }], restaurante_id=rid)
    return {"id": data[0]["id"]}


def borrar_grupo(rid: int, gid: int):
    repo.delete("grupos_opciones", {"id": gid}, restaurante_id=rid)
    return {"ok": True}


# ---------- OPCIONES ----------
def crear_opcion(rid: int, grupo_id: int, nombre: str, recargo: float = 0, orden: int = 0):
    if not nombre.strip():
        raise HTTPException(400, "El nombre de la opción es obligatorio")
    data = repo.insert("opciones", [{
        "grupo_id": grupo_id, "nombre": nombre.strip(),
        "recargo": recargo, "orden": orden,
    }], restaurante_id=rid)
    return {"id": data[0]["id"]}


def borrar_opcion(rid: int, oid: int):
    repo.delete("opciones", {"id": oid}, restaurante_id=rid)
    return {"ok": True}


def cambiar_recargo(rid: int, oid: int, recargo: float):
    repo.update("opciones", {"recargo": recargo}, {"id": oid}, restaurante_id=rid)
    return {"ok": True}


# ---------- PRODUCTOS ----------
def crear_producto(rid: int, categoria_id: int, nombre: str, descripcion: str,
                   precio_base: float, icono: str, orden: int, personalizable: int = 0,
                   precios: dict | None = None, receta: list[int] | None = None):
    if not nombre.strip():
        raise HTTPException(400, "El nombre es obligatorio")
    data = repo.insert("productos", [{
        "categoria_id": categoria_id, "nombre": nombre.strip(),
        "descripcion": descripcion, "precio_base": precio_base,
        "icono": icono or "plate", "orden": orden, "activo": 1,
        "personalizable": personalizable,
        "precios": json.dumps(precios) if precios else "",
    }], restaurante_id=rid)
    pid = data[0]["id"]
    _guardar_receta(rid, pid, receta)
    return {"id": pid}


def _guardar_receta(rid: int, pid: int, receta: list[int] | None):
    if receta is None:
        return
    repo.delete("producto_ingrediente", {"producto_id": pid}, restaurante_id=rid)
    for iid in receta:
        repo.insert("producto_ingrediente", [{
            "producto_id": pid, "ingrediente_id": iid,
            "base": 1, "obligatorio": 0,
        }], restaurante_id=rid)


def actualizar_producto(rid: int, pid: int, campos: dict, receta: list[int] | None = None):
    data, _ = repo.select("productos", restaurante_id=rid, eq={"id": pid}, columns="id")
    if not data:
        raise HTTPException(404, "Producto no existe")
    if campos:
        if "precios" in campos:
            campos["precios"] = json.dumps(campos["precios"]) if campos["precios"] else ""
        repo.update("productos", campos, {"id": pid}, restaurante_id=rid)
    if receta is not None:
        _guardar_receta(rid, pid, receta)
    return {"ok": True}


def borrar_producto(rid: int, pid: int):
    repo.delete("productos", {"id": pid}, restaurante_id=rid)
    return {"ok": True}


# ---------- OPCIONES ----------
def cambiar_recargo(rid: int, oid: int, recargo: float):
    repo.update("opciones", {"recargo": recargo}, {"id": oid}, restaurante_id=rid)
    return {"ok": True}