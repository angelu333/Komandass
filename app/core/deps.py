from fastapi import Depends, Header, HTTPException

from app.infrastructure.repositorios import base as repo


def get_current_user(authorization: str | None = Header(default=None)):
    if not authorization:
        raise HTTPException(401, "No autenticado")
    token = authorization.removeprefix("Bearer ").strip()
    user = repo.auth_get_user(token)
    if not user:
        raise HTTPException(401, "Sesión inválida o expirada")
    return user


def get_restaurante(user=Depends(get_current_user)):
    """Carga el negocio del usuario logueado (una cuenta = un negocio)."""
    rest = repo.get_restaurante_por_user(user.id)
    if not rest:
        raise HTTPException(404, "Aún no tienes un negocio registrado")
    return rest


def get_restaurante_id(rest=Depends(get_restaurante)):
    return rest["id"]