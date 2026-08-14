import httpx
from fastapi import HTTPException

from app.core.config import SUPABASE_KEY, SUPABASE_URL
from app.infrastructure.repositorios import base as repo


def _payload(user, session=None):
    return {
        "id": user.id,
        "email": getattr(user, "email", ""),
        "session": session.access_token if session else None,
    }


def confirma_email(user_id: str | None = None) -> bool:
    try:
        if not user_id:
            return False
        r = httpx.put(
            f"{SUPABASE_URL}/auth/v1/admin/users/{user_id}",
            headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"},
            json={"email_confirm": True},
            timeout=15,
        )
        return r.status_code == 200
    except Exception:
        return False


def signup(email: str, password: str):
    try:
        user, session = repo.auth_signup(email, password)
    except Exception as e:
        msg = str(e)
        if "already" in msg.lower() or "registered" in msg.lower():
            raise HTTPException(400, "Ese email ya está registrado")
        raise HTTPException(400, f"No se pudo crear la cuenta: {msg[:120]}")
    confirma_email(getattr(user, "id", None))
    return _payload(user, session)


def login(email: str, password: str):
    try:
        user, session = repo.auth_login(email, password)
    except Exception as e:
        msg = str(e)
        if "invalid" in msg.lower() or "not found" in msg.lower():
            raise HTTPException(401, "Email o contraseña incorrectos")
        raise HTTPException(401, f"No se pudo iniciar sesión: {msg[:120]}")
    return _payload(user, session)


def crear_negocio(user_id: str, nombre: str, telefono: str, direccion: str):
    if not nombre.strip():
        raise HTTPException(400, "El nombre del negocio es obligatorio")
    ya = repo.select("restaurantes", eq={"user_id": user_id}, limit=1)
    if ya[0]:
        raise HTTPException(409, "Ya tienes un negocio registrado")
    try:
        data = repo.insert("restaurantes", [{
            "user_id": user_id, "nombre": nombre.strip(),
            "telefono": telefono.strip(), "direccion": direccion.strip(),
            "icono": "store", "activo": 1, "usa_avanzado": 0,
        }])
    except Exception as e:
        msg = str(e)
        if "43505" in msg or "23505" in msg or "duplicate" in msg.lower():
            raise HTTPException(409, "Ya tienes un negocio registrado")
        raise HTTPException(400, f"No se pudo crear el negocio: {msg[:120]}")
    return data[0]


def editar_negocio(rid_actual: int, rid: int, campos: dict):
    if rid_actual != rid:
        raise HTTPException(404, "Negocio no encontrado")
    if campos:
        repo.update("restaurantes", campos, {"id": rid})
    return {"ok": True}


def datos_negocio(user_id: str):
    return repo.get_restaurante_por_user(user_id)