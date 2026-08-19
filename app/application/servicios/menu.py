import json
from typing import Optional

from fastapi import HTTPException

from app.application.puertos import MenuRepository
from app.infrastructure.repositorios.supabase_menu import SupabaseMenuRepository


def get_menu(rid: int, repo: MenuRepository = SupabaseMenuRepository()):
    return repo.obtener_menu(rid)


def productos_activos(rid: int, repo: MenuRepository = SupabaseMenuRepository()):
    return repo.productos_activos(rid)


def catalogo_completo(rid: int, repo: MenuRepository = SupabaseMenuRepository()):
    return repo.catalogo_completo(rid)


def ingredientes_activos(rid: int, repo: MenuRepository = SupabaseMenuRepository()):
    # Reutiliza el repositorio base a través de la infraestructura de catálogo
    from app.infrastructure.repositorios import base as repo_base
    data, _ = repo_base.select("ingredientes", restaurante_id=rid, eq={"activo": 1}, order="nombre")
    return [{k: r[k] for k in ("id", "nombre", "recargo", "pizza")} for r in data]


def personalizados(rid: int, repo: MenuRepository = SupabaseMenuRepository()):
    return repo.personalizados(rid)


def todas_opciones(rid: int, repo: MenuRepository = SupabaseMenuRepository()):
    return repo.personalizados(rid)


def precio_combinado(rid: int, repo: MenuRepository = SupabaseMenuRepository()):
    return {"valor": repo.obtener_config(rid, "precio_combinado", "15")}


def editar_precio_combinado(rid: int, valor: str, repo: MenuRepository = SupabaseMenuRepository()):
    repo.guardar_config(rid, "precio_combinado", valor)
    return {"ok": True}


def regla_mitad(rid: int, repo: MenuRepository = SupabaseMenuRepository()):
    raw = repo.obtener_config(rid, "pizza_regla_mitad", "")
    try:
        return json.loads(raw) if raw else {"modo": "sin_cargo", "valor": 0, "precios": {}}
    except (TypeError, ValueError):
        return {"modo": "sin_cargo", "valor": 0, "precios": {}}


def editar_regla_mitad(rid: int, regla: dict, repo: MenuRepository = SupabaseMenuRepository()):
    modo = regla.get("modo", "sin_cargo")
    if modo not in {"sin_cargo", "fijo", "por_tamano"}:
        raise HTTPException(400, "Regla de mitad y mitad inválida")
    limpia = {"modo": modo, "valor": max(0, float(regla.get("valor", 0) or 0)),
              "precios": regla.get("precios") or {}}
    repo.guardar_config(rid, "pizza_regla_mitad", json.dumps(limpia))
    return limpia


def regla_ingredientes(rid: int, repo: MenuRepository = SupabaseMenuRepository()):
    raw = repo.obtener_config(rid, "pizza_regla_ingredientes", "")
    try:
        return json.loads(raw) if raw else {"modo": "individual", "incluidos": 0, "recargo_extra": 0.0}
    except (TypeError, ValueError):
        return {"modo": "individual", "incluidos": 0, "recargo_extra": 0.0}


def editar_regla_ingredientes(rid: int, regla: dict, repo: MenuRepository = SupabaseMenuRepository()):
    modo = regla.get("modo", "individual")
    if modo not in {"individual", "por_cantidad"}:
        raise HTTPException(400, "Modo de regla de ingredientes inválido")
    limpia = {
        "modo": modo,
        "incluidos": max(0, int(regla.get("incluidos", 0) or 0)),
        "recargo_extra": max(0.0, float(regla.get("recargo_extra", 0.0) or 0.0)),
    }
    repo.guardar_config(rid, "pizza_regla_ingredientes", json.dumps(limpia))
    return limpia


def crear_categoria(rid: int, nombre: str, icono: str, tipo: str = "regular", orden: int = 0, activa: int = 1,
                    repo: MenuRepository = SupabaseMenuRepository()):
    if not nombre.strip():
        raise HTTPException(400, "El nombre es obligatorio")
    cid = repo.crear_categoria(rid, nombre.strip(), icono, tipo, orden, activa)
    return {"id": cid}


def editar_categoria(rid: int, cid: int, campos: dict,
                     repo: MenuRepository = SupabaseMenuRepository()):
    if campos.get("nombre") is not None:
        campos["nombre"] = str(campos["nombre"]).strip()
    repo.editar_categoria(rid, cid, campos)
    return {"ok": True}


def borrar_categoria(rid: int, cid: int, repo: MenuRepository = SupabaseMenuRepository()):
    repo.desactivar_categoria(rid, cid)
    return {"ok": True}


def crear_grupo(rid: int, nombre: str, categoria_id: int, seleccion_texto: str = "elegir_una", orden: int = 0,
                repo: MenuRepository = SupabaseMenuRepository()):
    if not nombre.strip():
        raise HTTPException(400, "El nombre del grupo es obligatorio")
    gid = repo.crear_grupo(rid, nombre.strip(), categoria_id, seleccion_texto, orden)
    return {"id": gid}


def borrar_grupo(rid: int, gid: int, repo: MenuRepository = SupabaseMenuRepository()):
    repo.borrar_grupo(rid, gid)
    return {"ok": True}


def crear_opcion(rid: int, grupo_id: int, nombre: str, recargo: float = 0, orden: int = 0,
                 repo: MenuRepository = SupabaseMenuRepository()):
    if not nombre.strip():
        raise HTTPException(400, "El nombre de la opción es obligatorio")
    oid = repo.crear_opcion(rid, grupo_id, nombre.strip(), recargo, orden)
    return {"id": oid}


def borrar_opcion(rid: int, oid: int, repo: MenuRepository = SupabaseMenuRepository()):
    repo.borrar_opcion(rid, oid)
    return {"ok": True}


def cambiar_recargo(rid: int, oid: int, recargo: float, repo: MenuRepository = SupabaseMenuRepository()):
    repo.cambiar_recargo_opcion(rid, oid, recargo)
    return {"ok": True}


def crear_producto(rid: int, categoria_id: int, nombre: str, descripcion: str,
                   precio_base: float, icono: str, orden: int, personalizable: int = 0,
                   precios: dict | None = None, receta: list[int] | None = None,
                   repo: MenuRepository = SupabaseMenuRepository()):
    if not nombre.strip():
        raise HTTPException(400, "El nombre es obligatorio")
    precios_json = json.dumps(precios) if precios else ""
    pid = repo.crear_producto(rid, categoria_id, nombre.strip(), descripcion, precio_base,
                             icono, orden, personalizable, precios_json, receta)
    return {"id": pid}


def actualizar_producto(rid: int, pid: int, campos: dict, receta: list[int] | None = None,
                        repo: MenuRepository = SupabaseMenuRepository()):
    if "precios" in campos:
        campos["precios"] = json.dumps(campos["precios"]) if campos["precios"] else ""
    ok = repo.actualizar_producto(rid, pid, campos, receta)
    if not ok:
        raise HTTPException(404, "Producto no existe")
    return {"ok": True}


def borrar_producto(rid: int, pid: int, repo: MenuRepository = SupabaseMenuRepository()):
    repo.borrar_producto(rid, pid)
    return {"ok": True}
