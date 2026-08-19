from app.application.puertos import ClientesRepository
from app.infrastructure.repositorios.supabase_clientes import (
    SupabaseClientesRepository,
)


def listar(q: str = "", rid: int = None, repo: ClientesRepository = SupabaseClientesRepository()):
    return repo.buscar_clientes(rid, q)


def crear(rid: int, nombre: str, telefono: str, direccion: str, notas: str,
          repo: ClientesRepository = SupabaseClientesRepository()):
    cl = repo.crear_cliente(rid, {
        "nombre": nombre.strip(), "telefono": telefono,
        "direccion": direccion, "notas": notas,
    })
    return {"id": cl["id"]}


def ultimo_pedido(rid: int, cid: int, repo: ClientesRepository = SupabaseClientesRepository()):
    return repo.obtener_ultimo_pedido(rid, cid)