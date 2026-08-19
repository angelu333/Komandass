from dataclasses import dataclass, field
from typing import Any, Optional


@dataclass
class Categoria:
    id: int
    nombre: str
    icono: str = ""
    tipo: str = "regular"
    orden: int = 0
    activa: int = 1
    restaurante_id: Optional[int] = None


@dataclass
class Producto:
    id: int
    categoria_id: int
    nombre: str
    descripcion: str = ""
    precio_base: float = 0.0
    icono: str = "plate"
    orden: int = 0
    activo: int = 1
    personalizable: int = 0
    precios: dict[str, float] = field(default_factory=dict)
    receta: list[int] = field(default_factory=list)
    restaurante_id: Optional[int] = None


@dataclass
class Opcion:
    id: int
    grupo_id: int
    nombre: str
    recargo: float = 0.0
    orden: int = 0
    restaurante_id: Optional[int] = None


@dataclass
class GrupoOpciones:
    id: int
    categoria_id: int
    nombre: str
    seleccion_texto: str = "elegir_una"
    orden: int = 0
    opciones: list[Opcion] = field(default_factory=list)
    restaurante_id: Optional[int] = None


@dataclass
class Ingrediente:
    id: int
    nombre: str
    recargo: float = 0.0
    stock: float = 0.0
    minimo: float = 0.0
    unidad: str = "pz"
    descontable: int = 1
    activo: int = 1
    pizza: int = 0
    restaurante_id: Optional[int] = None


@dataclass
class DetallePedido:
    id: int
    pedido_id: int
    producto_id: int
    producto_nombre: str
    cantidad: int
    configuracion: str
    precio_unitario: float
    subtotal: float
    restaurante_id: Optional[int] = None


@dataclass
class Pedido:
    id: int
    folio: str
    cliente_nombre: str
    tipo: str
    estado: str
    total: float
    cliente_id: Optional[int] = None
    mesa: str = ""
    direccion: str = ""
    telefono: str = ""
    nota: str = ""
    metodo_pago: str = "efectivo"
    repartidor_nombre: str = ""
    creado_en: Optional[str] = None
    preparacion_en: Optional[str] = None
    listo_en: Optional[str] = None
    entregado_en: Optional[str] = None
    cancelado_en: Optional[str] = None
    motivo_cancelacion: str = ""
    items: list[DetallePedido] = field(default_factory=list)
    restaurante_id: Optional[int] = None


@dataclass
class Cliente:
    id: int
    nombre: str
    telefono: str = ""
    direccion: str = ""
    notas: str = ""
    creado_en: Optional[str] = None
    restaurante_id: Optional[int] = None
