"""Cálculo de precios y descripciones. Módulo puro: lee datos vía un Lector
inyectado (Protocol), sin depender de infraestructura."""
from typing import Protocol


class LectorPrecios(Protocol):
    """Interfaz de lectura que la infraestructura debe proveer."""

    def recargo_ingrediente(self, ing_id: int) -> float: ...
    def nombre_ingrediente(self, ing_id: int) -> str: ...
    def recargo_opcion(self, opcion_id: int) -> float: ...
    def opcion(self, opcion_id: int) -> dict | None: ...          # -> {nombre, grupo_id}
    def nombre_grupo(self, grupo_id: int) -> str | None: ...
    def precio_combinado(self) -> float: ...


def _personalizada_ingredientes(personalizada) -> list:
    """Lista de ids de ingredientes elegidos en una pizza personalizada."""
    if not personalizada:
        return []
    mitad1 = personalizada.get("mitad1", []) or []
    mitad2 = personalizada.get("mitad2", []) or []
    return list(mitad1) + list(mitad2)


def _recargo_combinado(personalizada, lector: LectorPrecios) -> float:
    """Recargo único por 'combinado' (solo si hay 2+ ingredientes)."""
    if not personalizada:
        return 0
    if personalizada.get("distribucion") != "combinado":
        return 0
    if len(_personalizada_ingredientes(personalizada)) < 2:
        return 0
    return lector.precio_combinado()


def calcular_precio(producto, opciones, ingredientes_extra, personalizada=None,
                    tamano: str = "", *, lector: LectorPrecios) -> float:
    """opciones: {grupo_id: opcion_id} | ingredientes_extra: [ingrediente_id, ...]
    personalizada: {distribucion, mitad1: [ids], mitad2: [ids]}
    tamano: 'individual' | 'chica' | 'mediana' | 'grande' (usado si el producto
    define precios por tamaño)."""
    precios = producto.get("precios") or {}
    base = precios.get(tamano) if (tamano and isinstance(precios, dict)) else None
    total = float(base) if base is not None else producto["precio_base"]
    for opcion_id in opciones.values():
        total += lector.recargo_opcion(int(opcion_id))
    if personalizada:
        total += _recargo_combinado(personalizada, lector)
    else:
        for ing_id in ingredientes_extra:
            total += lector.recargo_ingrediente(int(ing_id))
    return round(total, 2)


def _nombre_ingrediente(ing_id: int, lector: LectorPrecios) -> str:
    return lector.nombre_ingrediente(int(ing_id))


def construir_descripcion(producto, opciones, ingredientes_extra, personalizada=None,
                          tamano: str = "", *, lector: LectorPrecios) -> str:
    partes = []
    if tamano and (producto.get("precios") or {}):
        partes.append(f"Tamaño: {tamano.capitalize()}")
    for opcion_id in opciones.values():
        opt = lector.opcion(int(opcion_id))
        if not opt:
            continue
        grp_nombre = lector.nombre_grupo(int(opt["grupo_id"]))
        if grp_nombre:
            partes.append(f"{grp_nombre}: {opt['nombre']}")
    if personalizada:
        dist = personalizada.get("distribucion")
        mitad1 = personalizada.get("mitad1", []) or []
        mitad2 = personalizada.get("mitad2", []) or []
        n1 = ", ".join(_nombre_ingrediente(i, lector) for i in mitad1)
        n2 = ", ".join(_nombre_ingrediente(i, lector) for i in mitad2)
        if dist == "combinado":
            todos = ", ".join(_nombre_ingrediente(i, lector)
                              for i in _personalizada_ingredientes(personalizada))
            partes.append(f"Personalizada: Combinado ({todos})")
        else:
            partes.append(f"Personalizada: Mitad y mitad — Mitad 1 ({n1}) · Mitad 2 ({n2})")
    elif ingredientes_extra:
        nombres = [_nombre_ingrediente(i, lector) for i in ingredientes_extra]
        partes.append("Extras: " + ", ".join(nombres))
    return " · ".join(partes)