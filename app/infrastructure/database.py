import time

import httpx
from supabase import Client, create_client

from app.core.config import SUPABASE_KEY, SUPABASE_URL

supabase: Client | None = create_client(SUPABASE_URL, SUPABASE_KEY)


def _cliente_httpx(base=None):
    # HTTP/1.1 en vez de HTTP/2: evita el WinError 10035 en Windows.
    # Header de auth del service_role en una sola instancia, sin duplicitas.
    headers = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"}
    if base is not None:
        try:
            for k, v in dict(base.headers).items():
                if k.lower() in ("apikey", "authorization"):
                    continue
                headers[k] = v
        except Exception:
            pass
    return httpx.Client(http2=False, timeout=8.0, headers=headers)


# Reemplaza la sesión interna por una con HTTP/1.1 (más estable en Windows)
# y con el header de auth del service_role correcto (sin duplicados).
def _reconfigurar_sesion():
    try:
        old = supabase.postgrest.session
        supabase.postgrest.session = _cliente_httpx(old)
        # Token de auth para el request builder de postgrest.
        supabase.postgrest.auth_token = SUPABASE_KEY
    except Exception:
        pass


_reconfigurar_sesion()


def get_sb() -> Client:
    return supabase


def ejecutar(fn, intentos: int = 4):
    """Ejecuta una operación con reintentos ante errores transitorios de red."""
    ultimo = None
    for intento in range(intentos):
        try:
            return fn()
        except Exception as e:  # noqa: BLE001
            ultimo = e
            msg = str(e).lower().replace("\n", " ")[:160]
            es_red = (
                isinstance(e, (httpx.ReadError, httpx.ConnectError, httpx.TimeoutException))
                or "10035" in msg
                or "readerror" in msg
                or "conexi" in msg
                or "connection" in msg
                or "socket" in msg
                or "pgrst303" in msg
                or "jwt issued at future" in msg
            )
            if not es_red:
                raise e
            time.sleep(0.25 * (intento + 1))
    raise ultimo