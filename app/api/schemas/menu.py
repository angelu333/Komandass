from pydantic import BaseModel


class CategoriaCreate(BaseModel):
    nombre: str
    icono: str = "plate"
    orden: int = 0
    activa: int = 1


class CategoriaUpdate(BaseModel):
    nombre: str | None = None
    icono: str | None = None
    orden: int | None = None
    activa: int | None = None


class ProductoCreate(BaseModel):
    categoria_id: int
    nombre: str
    descripcion: str = ""
    precio_base: float = 0
    icono: str = "plate"
    orden: int = 0
    personalizable: int = 0
    precios: dict | None = None
    receta: list[int] = []


class ProductoUpdate(BaseModel):
    precio_base: float | None = None
    nombre: str | None = None
    descripcion: str | None = None
    activo: int | None = None
    icono: str | None = None
    personalizable: int | None = None
    precios: dict | None = None
    receta: list[int] | None = None


class GrupoCreate(BaseModel):
    nombre: str
    categoria_id: int
    seleccion_texto: str = "elegir_una"
    orden: int = 0


class OpcionCreate(BaseModel):
    grupo_id: int
    nombre: str
    recargo: float = 0
    orden: int = 0


class OpcionRecargo(BaseModel):
    recargo: float = 0


class ConfigValor(BaseModel):
    valor: str