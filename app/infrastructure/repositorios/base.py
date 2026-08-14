from datetime import datetime

from app.infrastructure.database import ejecutar, get_sb

# Implementa la restauración del service_role. El login/signup de supabase-py
# cambia el header Authorization del cliente postgrest al JWT del usuario
# (rol authenticated, sin políticas RLS). Lo regresamos al service_role para
# que las consultas del backend siempre vean todas las filas.
from app.core.config import SUPABASE_KEY


def _restaurar_service_role():
    try:
        get_sb().postgrest.headers["Authorization"] = f"Bearer {SUPABASE_KEY}"
        get_sb().postgrest.headers["apikey"] = SUPABASE_KEY
    except Exception:
        pass


def _con_tenant(eq: dict | None, restaurante_id: int | None) -> dict:
    """Propiedad transversal del grafo: todo filtro lleva restaurante_id."""
    eq = dict(eq or {})
    if restaurante_id is not None:
        eq["restaurante_id"] = restaurante_id
    return eq


# ---------- AUTH (Supabase) ----------
def auth_get_user(jwt: str):
    """Valida el token de sesión y regresa el usuario (o None si es inválido)."""
    try:
        res = get_sb().auth.get_user(jwt)
        return res.user
    except Exception:
        # JWT corrupto/vencido/usuario borrado: el dep lo traduce a 401.
        return None
    finally:
        _restaurar_service_role()


def auth_signup(email: str, password: str):
    res = get_sb().auth.sign_up({"email": email, "password": password})
    _restaurar_service_role()
    return res.user, res.session


def auth_login(email: str, password: str):
    res = get_sb().auth.sign_in_with_password({"email": email, "password": password})
    _restaurar_service_role()
    return res.user, res.session


# ---------- CRUD GENÉRICO ----------
def select(tabla: str, *, restaurante_id: int | None = None, eq: dict | None = None,
           order: str | None = None, desc: bool = False, limit: int | None = None,
           columns: str = "*", ilike: dict | None = None, neq: dict | None = None,
           count: str | None = None, gte: dict | None = None, lte: dict | None = None):
    q = get_sb().table(tabla).select(columns, count=count)
    eq = _con_tenant(eq, restaurante_id)
    if eq:
        for k, v in eq.items():
            q = q.eq(k, v)
    if neq:
        for k, v in neq.items():
            q = q.neq(k, v)
    if ilike:
        for k, v in ilike.items():
            q = q.ilike(k, v)
    if gte:
        for k, v in gte.items():
            q = q.gte(k, v)
    if lte:
        for k, v in lte.items():
            q = q.lte(k, v)
    if order:
        q = q.order(order, desc=desc)
    if limit:
        q = q.limit(limit)
    res = ejecutar(q.execute)
    return res.data, getattr(res, "count", None)


def insert(tabla: str, datos: dict | list, *, restaurante_id: int | None = None):
    filas = datos if isinstance(datos, list) else [datos]
    if restaurante_id is not None:
        for f in filas:
            f.setdefault("restaurante_id", restaurante_id)

    def op():
        return get_sb().table(tabla).insert(filas).select("*").execute()
    res = ejecutar(op)
    return res.data


def update(tabla: str, datos: dict, eq: dict, *, restaurante_id: int | None = None):
    def op():
        q = get_sb().table(tabla).update(datos)
        for k, v in _con_tenant(eq, restaurante_id).items():
            q = q.eq(k, v)
        return q.execute()
    res = ejecutar(op)
    return res.data


def delete(tabla: str, eq: dict, *, restaurante_id: int | None = None):
    def op():
        q = get_sb().table(tabla).delete()
        for k, v in _con_tenant(eq, restaurante_id).items():
            q = q.eq(k, v)
        return q.execute()
    return ejecutar(op)


def ahora_iso():
    return datetime.now().isoformat()


# ---------- RESTAURANTES ----------
def get_restaurante_por_user(user_id: str):
    data, _ = select("restaurantes", eq={"user_id": user_id}, limit=1)
    return data[0] if data else None


def get_config(clave: str, default="", *, restaurante_id: int | None = None):
    data, _ = select("config", restaurante_id=restaurante_id,
                     eq={"clave": clave}, columns="valor")
    return data[0]["valor"] if data else default


def set_config(clave: str, valor, *, restaurante_id: int | None = None):
    rows, _ = select("config", restaurante_id=restaurante_id,
                     eq={"clave": clave}, columns="clave")
    if restaurante_id is None:
        restaurante_id = 0
    if rows:
        update("config", {"valor": str(valor)}, {"clave": clave},
               restaurante_id=restaurante_id)
    else:
        insert("config", [{"restaurante_id": restaurante_id,
                           "clave": clave, "valor": str(valor)}])