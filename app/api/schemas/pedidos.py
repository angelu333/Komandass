from pydantic import BaseModel


class ItemConfig(BaseModel):
    producto_id: int
    cantidad: int = 1
    tamano: str = ""
    opciones: dict = {}
    ingredientes_extra: list = []
    personalizada: dict | None = None
    nota: str = ""


class PedidoCreate(BaseModel):
    tipo: str = "salon"
    cliente_id: int | None = None
    cliente_nombre: str = ""
    mesa: str = ""
    direccion: str = ""
    telefono: str = ""
    nota: str = ""
    metodo_pago: str = ""
    items: list[ItemConfig]