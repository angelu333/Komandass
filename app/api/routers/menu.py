from fastapi import APIRouter, Depends

from app.api.schemas.menu import (CategoriaCreate, CategoriaUpdate, ConfigValor, ReglaMitad,
                                  ReglaIngredientes, GrupoCreate, OpcionCreate, OpcionRecargo,
                                  ProductoCreate, ProductoUpdate)
from app.application.servicios import menu as svc
from app.core.deps import get_restaurante_id

router = APIRouter(prefix="/api/menu", tags=["menu"])


# ---------- CATÁLOGO ----------
@router.get("")
def get_menu(rid: int = Depends(get_restaurante_id)):
    return svc.get_menu(rid)


@router.get("/productos")
def productos_activos(rid: int = Depends(get_restaurante_id)):
    return svc.productos_activos(rid)


@router.get("/catalogo")
def catalogo_completo(rid: int = Depends(get_restaurante_id)):
    return svc.catalogo_completo(rid)


@router.get("/ingredientes")
def ingredientes_activos(rid: int = Depends(get_restaurante_id)):
    return svc.ingredientes_activos(rid)


@router.get("/todo/personal")
def personalizados(rid: int = Depends(get_restaurante_id)):
    return svc.personalizados(rid)


@router.get("/opciones")
def todas_opciones(rid: int = Depends(get_restaurante_id)):
    return svc.todas_opciones(rid)


@router.get("/config/precio_combinado")
def precio_combinado(rid: int = Depends(get_restaurante_id)):
    return svc.precio_combinado(rid)


@router.put("/config/precio_combinado")
def editar_precio_combinado(c: ConfigValor, rid: int = Depends(get_restaurante_id)):
    return svc.editar_precio_combinado(rid, c.valor)


@router.get("/config/regla-mitad")
def obtener_regla_mitad(rid: int = Depends(get_restaurante_id)):
    return svc.regla_mitad(rid)


@router.put("/config/regla-mitad")
def actualizar_regla_mitad(regla: ReglaMitad, rid: int = Depends(get_restaurante_id)):
    return svc.editar_regla_mitad(rid, regla.dict())


@router.get("/config/regla-ingredientes")
def obtener_regla_ingredientes(rid: int = Depends(get_restaurante_id)):
    return svc.regla_ingredientes(rid)


@router.put("/config/regla-ingredientes")
def actualizar_regla_ingredientes(regla: ReglaIngredientes, rid: int = Depends(get_restaurante_id)):
    return svc.editar_regla_ingredientes(rid, regla.dict())


# ---------- CATEGORÍAS ----------
@router.post("/categorias")
def crear_categoria(c: CategoriaCreate, rid: int = Depends(get_restaurante_id)):
    return svc.crear_categoria(rid, c.nombre, c.icono, c.tipo, c.orden, c.activa)


@router.put("/categorias/{cid}")
def editar_categoria(cid: int, c: CategoriaUpdate, rid: int = Depends(get_restaurante_id)):
    campos = {}
    if c.nombre is not None:
        campos["nombre"] = c.nombre
    if c.icono is not None:
        campos["icono"] = c.icono
    if c.tipo is not None:
        campos["tipo"] = c.tipo
    if c.orden is not None:
        campos["orden"] = c.orden
    if c.activa is not None:
        campos["activa"] = c.activa
    return svc.editar_categoria(rid, cid, campos)


@router.delete("/categorias/{cid}")
def borrar_categoria(cid: int, rid: int = Depends(get_restaurante_id)):
    return svc.borrar_categoria(rid, cid)


# ---------- PRODUCTOS ----------
@router.post("/productos")
def crear_producto(p: ProductoCreate, rid: int = Depends(get_restaurante_id)):
    return svc.crear_producto(rid, p.categoria_id, p.nombre, p.descripcion,
                              p.precio_base, p.icono, p.orden, p.personalizable,
                              p.precios, p.receta)


@router.put("/productos/{pid}")
def actualizar_producto(pid: int, p: ProductoUpdate, rid: int = Depends(get_restaurante_id)):
    campos = {}
    if p.precio_base is not None:
        campos["precio_base"] = p.precio_base
    if p.nombre is not None:
        campos["nombre"] = p.nombre
    if p.descripcion is not None:
        campos["descripcion"] = p.descripcion
    if p.activo is not None:
        campos["activo"] = p.activo
    if p.icono is not None:
        campos["icono"] = p.icono
    if p.personalizable is not None:
        campos["personalizable"] = p.personalizable
    if p.precios is not None:
        campos["precios"] = p.precios
    return svc.actualizar_producto(rid, pid, campos, p.receta)


@router.delete("/productos/{pid}")
def borrar_producto(pid: int, rid: int = Depends(get_restaurante_id)):
    return svc.borrar_producto(rid, pid)


@router.put("/opciones/{oid}/recargo")
def cambiar_recargo(oid: int, p: OpcionRecargo, rid: int = Depends(get_restaurante_id)):
    return svc.cambiar_recargo(rid, oid, p.recargo)


# ---------- GRUPOS DE OPCIONES ----------
@router.post("/grupos")
def crear_grupo(g: GrupoCreate, rid: int = Depends(get_restaurante_id)):
    return svc.crear_grupo(rid, g.nombre, g.categoria_id, g.seleccion_texto, g.orden)


@router.delete("/grupos/{gid}")
def borrar_grupo(gid: int, rid: int = Depends(get_restaurante_id)):
    return svc.borrar_grupo(rid, gid)


# ---------- OPCIONES (dentro de un grupo) ----------
@router.post("/opciones")
def crear_opcion(o: OpcionCreate, rid: int = Depends(get_restaurante_id)):
    return svc.crear_opcion(rid, o.grupo_id, o.nombre, o.recargo, o.orden)


@router.delete("/opciones/{oid}")
def borrar_opcion(oid: int, rid: int = Depends(get_restaurante_id)):
    return svc.borrar_opcion(rid, oid)
