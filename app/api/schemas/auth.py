from pydantic import BaseModel


class Credenciales(BaseModel):
    email: str
    password: str


class NegocioCreate(BaseModel):
    nombre: str
    telefono: str = ""
    direccion: str = ""


class NegocioUpdate(BaseModel):
    nombre: str | None = None
    telefono: str | None = None
    direccion: str | None = None
    icono: str | None = None