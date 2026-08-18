from fastapi import HTTPException

from app.infrastructure.repositorios import base as repo


def _payload(user, session=None):
    return {
        "id": user.id,
        "email": getattr(user, "email", ""),
        "session": session.access_token if session else None,
    }


def signup(email: str, password: str):
    try:
        user, session = repo.auth_signup(email, password)
    except Exception as e:
        msg = str(e)
        if "already" in msg.lower() or "registered" in msg.lower():
            raise HTTPException(400, "Ese email ya está registrado")
        if "rate limit" in msg.lower():
            raise HTTPException(429, "Demasiados intentos. Espera unos minutos e inténtalo de nuevo")
        raise HTTPException(400, f"No se pudo crear la cuenta: {msg[:120]}")
    # Si Supabase exige confirmar el correo, session será None. El frontend
    # informa el siguiente paso y consume la sesión del enlace de confirmación.
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
