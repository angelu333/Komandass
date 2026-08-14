"""Reglas de negocio del flujo de pedidos. Módulo puro: no importa la BD."""
from datetime import datetime

ESTADOS_VALIDOS = {"recibido", "preparacion", "entregado", "cancelado"}
TRANSICIONES = {
    "recibido": {"preparacion", "cancelado"},
    "preparacion": {"entregado", "cancelado"},
    "entregado": set(),
}


def es_estado_valido(estado: str) -> bool:
    return estado in ESTADOS_VALIDOS


def es_transicion_valida(desde: str, hacia: str) -> bool:
    if hacia == "cancelado":
        return desde != "cancelado"
    return hacia in TRANSICIONES.get(desde, set())


def folio_dia(hoy_fecha: str, contador: int) -> str:
    """Construye el folio del día: YYMMDD-NNN (contador = pedidos ya creados hoy)."""
    return f"{hoy_fecha}-{contador + 1:03d}"


def parse_iso(iso):
    try:
        return datetime.fromisoformat(str(iso).replace("Z", "+00:00")).astimezone().replace(tzinfo=None)
    except Exception:
        return datetime.now()


def edad_seg(creado_en) -> int:
    try:
        return max(0, int((datetime.now() - parse_iso(creado_en)).total_seconds()))
    except Exception:
        return 0


def marca_temporal(estado: str) -> dict:
    """Timestamp a guardar según el estado al que se transiciona.
    'entregado' implica el cobro: se registra en pagado_en (columna existente)."""
    campos = {"estado": estado}
    ahora = datetime.now().isoformat()
    if estado == "entregado":
        campos["pagado_en"] = ahora
        campos["enviado_en"] = ahora
    elif estado == "cancelado":
        campos["cancelado_en"] = ahora
        campos["motivo_cancelacion"] = "cancelado manualmente"
    return campos