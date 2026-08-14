from pydantic import BaseModel


class IngredienteCreate(BaseModel):
    nombre: str
    recargo: float = 0
    pizza: int = 1


class IngredienteUpdate(BaseModel):
    nombre: str | None = None
    recargo: float | None = None
    activo: int | None = None
    pizza: int | None = None