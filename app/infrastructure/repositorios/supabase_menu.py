import json
from typing import Any, Optional

from app.application.puertos import MenuRepository
from app.infrastructure.repositorios import base as repo


class SupabaseMenuRepository(MenuRepository):
    def _parse_precios(self, raw: Any) -> dict:
        if isinstance(raw, dict):
            return raw
        if not raw:
            return {}
        try:
            return json.loads(raw) if isinstance(raw, str) else {}
        except (TypeError, ValueError):
            return {}

    def _receta_producto(self, rid: int, producto_id: int) -> list[int]:
        filas, _ = repo.select("producto_ingrediente", restaurante_id=rid,
                               eq={"producto_id": producto_id, "base": 1},
                               columns="ingrediente_id")
        return [f["ingrediente_id"] for f in filas]

    def _enriquecer_producto(self, rid: int, p: dict) -> dict:
        pd = dict(p)
        pd["precios"] = self._parse_precios(pd.get("precios"))
        pd["receta"] = self._receta_producto(rid, pd["id"])
        return pd

    def obtener_menu(self, rid: int) -> list[dict[str, Any]]:
        categorias, _ = repo.select("categorias", restaurante_id=rid,
                                    eq={"activa": 1}, order="orden")
        result = []
        for cat in categorias:
            productos, _ = repo.select("productos", restaurante_id=rid,
                                       eq={"categoria_id": cat["id"], "activo": 1}, order="orden")
            productos = [self._enriquecer_producto(rid, p) for p in productos]
            grupos, _ = repo.select("grupos_opciones", restaurante_id=rid,
                                    eq={"categoria_id": cat["id"]}, order="orden")
            grupos_rich = []
            for g in grupos:
                gd = dict(g)
                opts, _ = repo.select("opciones", restaurante_id=rid,
                                      eq={"grupo_id": g["id"]}, order="orden")
                gd["opciones"] = opts
                grupos_rich.append(gd)
            result.append({"categoria": cat, "productos": productos, "opciones": grupos_rich})
        return result

    def productos_activos(self, rid: int) -> list[dict[str, Any]]:
        data, _ = repo.select("productos", restaurante_id=rid, eq={"activo": 1}, order="orden")
        return [self._enriquecer_producto(rid, p) for p in data]

    def catalogo_completo(self, rid: int) -> list[dict[str, Any]]:
        categorias, _ = repo.select("categorias", restaurante_id=rid, order="orden")
        result = []
        for cat in categorias:
            productos, _ = repo.select("productos", restaurante_id=rid,
                                       eq={"categoria_id": cat["id"]}, order="orden")
            productos = [self._enriquecer_producto(rid, p) for p in productos]
            opciones, _ = repo.select("grupos_opciones", restaurante_id=rid,
                                      eq={"categoria_id": cat["id"]}, order="orden")
            for g in opciones:
                g["opciones"] = repo.select("opciones", restaurante_id=rid,
                                             eq={"grupo_id": g["id"]}, order="orden")[0]
            result.append({"categoria": cat, "productos": productos, "opciones": opciones})
        return result

    def personalizados(self, rid: int) -> list[dict[str, Any]]:
        grupos, _ = repo.select("grupos_opciones", restaurante_id=rid, order="orden")
        out = []
        for g in grupos:
            gd = dict(g)
            opts, _ = repo.select("opciones", restaurante_id=rid,
                                  eq={"grupo_id": g["id"]}, order="orden")
            gd["opciones"] = opts
            out.append(gd)
        return out

    def obtener_config(self, rid: int, clave: str, default: str = "") -> str:
        return repo.get_config(clave, default, restaurante_id=rid)

    def guardar_config(self, rid: int, clave: str, valor: str) -> None:
        repo.set_config(clave, valor, restaurante_id=rid)

    def crear_categoria(self, rid: int, nombre: str, icono: str, tipo: str, orden: int, activa: int) -> int:
        try:
            data = repo.insert("categorias", [{
                "nombre": nombre, "icono": icono, "tipo": tipo or "regular", "orden": orden, "activa": activa,
            }], restaurante_id=rid)
        except Exception:
            data = repo.insert("categorias", [{
                "nombre": nombre, "icono": icono, "orden": orden, "activa": activa,
            }], restaurante_id=rid)
        return data[0]["id"]

    def editar_categoria(self, rid: int, cid: int, campos: dict) -> None:
        if campos:
            try:
                repo.update("categorias", campos, {"id": cid}, restaurante_id=rid)
            except Exception:
                campos_copy = dict(campos)
                campos_copy.pop("tipo", None)
                if campos_copy:
                    repo.update("categorias", campos_copy, {"id": cid}, restaurante_id=rid)

    def desactivar_categoria(self, rid: int, cid: int) -> None:
        repo.update("categorias", {"activa": 0}, {"id": cid}, restaurante_id=rid)

    def crear_grupo(self, rid: int, nombre: str, categoria_id: int, seleccion_texto: str, orden: int) -> int:
        data = repo.insert("grupos_opciones", [{
            "nombre": nombre, "categoria_id": categoria_id,
            "seleccion_texto": seleccion_texto, "orden": orden,
        }], restaurante_id=rid)
        return data[0]["id"]

    def borrar_grupo(self, rid: int, gid: int) -> None:
        repo.delete("grupos_opciones", {"id": gid}, restaurante_id=rid)

    def crear_opcion(self, rid: int, grupo_id: int, nombre: str, recargo: float, orden: int) -> int:
        data = repo.insert("opciones", [{
            "grupo_id": grupo_id, "nombre": nombre,
            "recargo": recargo, "orden": orden,
        }], restaurante_id=rid)
        return data[0]["id"]

    def borrar_opcion(self, rid: int, oid: int) -> None:
        repo.delete("opciones", {"id": oid}, restaurante_id=rid)

    def cambiar_recargo_opcion(self, rid: int, oid: int, recargo: float) -> None:
        repo.update("opciones", {"recargo": recargo}, {"id": oid}, restaurante_id=rid)

    def crear_producto(self, rid: int, categoria_id: int, nombre: str, descripcion: str,
                       precio_base: float, icono: str, orden: int, personalizable: int,
                       precios_json: str, receta: Optional[list[int]]) -> int:
        data = repo.insert("productos", [{
            "categoria_id": categoria_id, "nombre": nombre,
            "descripcion": descripcion, "precio_base": precio_base,
            "icono": icono or "plate", "orden": orden, "activo": 1,
            "personalizable": personalizable,
            "precios": precios_json,
        }], restaurante_id=rid)
        pid = data[0]["id"]
        self._guardar_receta(rid, pid, receta)
        return pid

    def _guardar_receta(self, rid: int, pid: int, receta: Optional[list[int]]) -> None:
        if receta is None:
            return
        repo.delete("producto_ingrediente", {"producto_id": pid}, restaurante_id=rid)
        for iid in receta:
            repo.insert("producto_ingrediente", [{
                "producto_id": pid, "ingrediente_id": iid,
                "base": 1, "obligatorio": 0,
            }], restaurante_id=rid)

    def actualizar_producto(self, rid: int, pid: int, campos: dict, receta: Optional[list[int]]) -> bool:
        data, _ = repo.select("productos", restaurante_id=rid, eq={"id": pid}, columns="id")
        if not data:
            return False
        if campos:
            repo.update("productos", campos, {"id": pid}, restaurante_id=rid)
        if receta is not None:
            self._guardar_receta(rid, pid, receta)
        return True

    def borrar_producto(self, rid: int, pid: int) -> None:
        repo.delete("productos", {"id": pid}, restaurante_id=rid)
