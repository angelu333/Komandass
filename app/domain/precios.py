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
    def configuracion_mitad(self) -> dict: ...
    def regla_ingredientes_extra(self) -> dict: ...


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


def _ids_unicos(ids) -> list[int]:
    """Conserva el orden y evita cobrar dos veces un ingrediente entero."""
    return list(dict.fromkeys(int(i) for i in (ids or [])))


def _extras_personalizados(producto: dict, personalizada: dict) -> list[int]:
    """Obtiene sólo los toppings añadidos, nunca los de la receta incluida.

    ``ingredientes_extra`` se guarda explícitamente por el configurador nuevo.
    El fallback mantiene compatibles los pedidos creados con el configurador
    anterior, que sólo enviaba las dos mitades.
    """
    if personalizada.get("ingredientes_extra") is not None:
        return _ids_unicos(personalizada.get("ingredientes_extra"))
    receta = set() if personalizada.get("desde_cero") else set(_ids_unicos(producto.get("receta", [])))
    return [i for i in _ids_unicos(_personalizada_ingredientes(personalizada))
            if i not in receta]


def _recargo_mitad(tamano: str, personalizada: dict, lector: LectorPrecios) -> float:
    if not personalizada or personalizada.get("distribucion") != "mitad":
        return 0.0
    cfg = lector.configuracion_mitad() or {}
    modo = cfg.get("modo", "sin_cargo")
    if modo == "fijo":
        return float(cfg.get("valor", 0) or 0)
    if modo == "por_tamano":
        return float((cfg.get("precios") or {}).get(tamano, 0) or 0)
    return 0.0


def _calcular_recargo_ingredientes(extras: list[int], lector: LectorPrecios) -> float:
    """Calcula el cobro por ingredientes extra según la regla del negocio:
    - 'por_cantidad': N primeros incluidos gratis, cobro fijo por excedente.
    - 'individual' (o por defecto): suma de recargos individuales de cada ingrediente."""
    regla = getattr(lector, "regla_ingredientes_extra", None)
    cfg = regla() if callable(regla) else {}
    if cfg and cfg.get("modo") == "por_cantidad":
        incluidos = max(0, int(cfg.get("incluidos", 0) or 0))
        recargo_extra = max(0.0, float(cfg.get("recargo_extra", 0.0) or 0.0))
        excedente = max(0, len(extras) - incluidos)
        return round(excedente * recargo_extra, 2)
    return sum(lector.recargo_ingrediente(ing_id) for ing_id in extras)


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
        # La receta está incluida en el precio de la pizza; sólo cobran extras.
        extras = _extras_personalizados(producto, personalizada)
        total += _calcular_recargo_ingredientes(extras, lector)
        total += _recargo_mitad(tamano, personalizada, lector)
    else:
        extras = [int(i) for i in (ingredientes_extra or [])]
        total += _calcular_recargo_ingredientes(extras, lector)
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
        receta = set() if personalizada.get("desde_cero") else set(_ids_unicos(producto.get("receta", [])))
        extras = _extras_personalizados(producto, personalizada)
        unicos = _ids_unicos(_personalizada_ingredientes(personalizada))
        eliminados = [i for i in receta if i not in set(unicos)]
        if eliminados:
            partes.append("Sin: " + ", ".join(_nombre_ingrediente(i, lector) for i in eliminados))
        if dist == "combinado":
            todos = ", ".join(_nombre_ingrediente(i, lector) for i in unicos)
            if todos:
                partes.append(f"Ingredientes: {todos}")
        else:
            n1 = ", ".join(_nombre_ingrediente(i, lector) for i in _ids_unicos(mitad1))
            n2 = ", ".join(_nombre_ingrediente(i, lector) for i in _ids_unicos(mitad2))
            partes.append(f"Personalizada: Mitad y mitad — Mitad 1 ({n1}) · Mitad 2 ({n2})")
        if extras and (dist != "combinado" or set(extras) != set(unicos)):
            partes.append("Extras: " + ", ".join(_nombre_ingrediente(i, lector) for i in extras))
    elif ingredientes_extra:
        nombres = [_nombre_ingrediente(i, lector) for i in _ids_unicos(ingredientes_extra)]
        partes.append("Extras: " + ", ".join(nombres))
    return " · ".join(partes)
