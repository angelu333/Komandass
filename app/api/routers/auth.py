from fastapi import APIRouter, Depends

from app.api.schemas.auth import Credenciales, NegocioCreate, NegocioUpdate
from app.application.servicios import auth as svc
from app.core.deps import get_current_user, get_restaurante

router = APIRouter(tags=["auth"])


@router.post("/api/auth/signup")
def signup(c: Credenciales):
    if not c.email.strip() or len(c.password or "") < 6:
        from fastapi import HTTPException
        raise HTTPException(400, "Email inválido o contraseña menor a 6 caracteres")
    return svc.signup(c.email.strip(), c.password)


@router.post("/api/auth/login")
def login(c: Credenciales):
    return svc.login(c.email.strip(), c.password)


@router.get("/api/me")
def me(user=Depends(get_current_user)):
    # Un usuario recién registrado todavía no tiene negocio: es el estado
    # esperado del onboarding, no un error 404.
    rest = svc.datos_negocio(user.id)
    return {"user": {"id": user.id, "email": getattr(user, "email", "")},
            "negocio": rest}


@router.post("/api/restaurantes")
def crear_negocio(n: NegocioCreate, user=Depends(get_current_user)):
    return svc.crear_negocio(user.id, n.nombre, n.telefono, n.direccion)


@router.put("/api/restaurantes/{rid}")
def editar_negocio(rid: int, n: NegocioUpdate,
                   r=Depends(get_restaurante)):
    campos = {}
    if n.nombre is not None:
        campos["nombre"] = n.nombre.strip()
    if n.telefono is not None:
        campos["telefono"] = n.telefono.strip()
    if n.direccion is not None:
        campos["direccion"] = n.direccion.strip()
    if n.icono is not None:
        campos["icono"] = n.icono
    return svc.editar_negocio(r["id"], rid, campos)
