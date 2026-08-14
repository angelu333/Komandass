"""E2E: constructor de pizza estilo Domino's.

Flujo:
1. login (usuario temporal con suffix en email)
2. crear categoria "Pizzas" + ingredientes (champinon, pina) + grupo "Orilla" (Normal/Queso/Philadelphia)
3. crear producto "Pizza de la casa" con precios por tamano (individual/chica/mediana/grande) + receta base [champinon]
4. verificar catalogo: precios parseado + receta
5. pedido: item con tamano=mediana, orilla=Philadelphia (+20), personalizada mitad champinon/pina
   -> total esperado = precios.mediana(130) + 20 = 150
6. verificar descripcion: incluye "Tamaño: Mediana" y orilla
7. limpieza: cancelar pedido, desactivar/borrar datos de prueba
"""
import os
import sys
import time
from getpass import getpass

import httpx

BASE = "http://127.0.0.1:8123/api"
EMAIL = "e2e.pizza.dominos.opencode@gmail.com"
PASS = "Prueba123!"


def login():
    r = httpx.post(f"{BASE}/auth/login", json={"email": EMAIL, "password": PASS})
    if r.status_code != 200:
        return None
    return r.json()


def setup_usuario():
    # registrar si no existe
    r = httpx.post(f"{BASE}/auth/signup", json={"email": EMAIL, "password": PASS}, timeout=30)
    if r.status_code not in (200, 201):
        return None
    j = r.json()
    if j.get("session"):
        # crear negocio
        h = {"Authorization": "Bearer " + j["session"]}
        nb = httpx.post(f"{BASE}/restaurantes", json={"nombre": "Pizzeria Domino E2E"}, headers=h)
        return j
    return j


def main():
    j = login()
    if not j:
        print("-> no existe usuario, registrando...")
        j = setup_usuario()
    if not j:
        print("FALLO login/signup", file=sys.stderr)
        sys.exit(1)
    token = j.get("session") or j.get("token")
    if not token:
        print(f"FALLO: sin token en respuesta: {j}", file=sys.stderr)
        sys.exit(1)
    H = {"Authorization": "Bearer " + token}

    me = httpx.get(f"{BASE}/me", headers=H).json()
    if not me.get("negocio"):
        nb = httpx.post(f"{BASE}/restaurantes", json={"nombre": "Pizzeria Domino E2E"}, headers=H)
        print("negocio creado:", nb.status_code)

    def api(method, path, **kw):
        r = httpx.request(method, BASE + path, headers=H, timeout=30, **kw)
        if r.status_code >= 400:
            print(f"!! {method} {path} -> {r.status_code}: {r.text[:300]}")
        return r

    # --- limpieza previa del negocio de prueba ---
    cat = api("GET", "/menu/catalogo")
    for c in cat.json():
        for p in c["productos"]:
            if "DOM E2E" in p["nombre"].upper() or "de la casa" in p["nombre"].lower():
                api("DELETE", f"/menu/productos/{p['id']}")
        if "E2E" in c["categoria"]["nombre"].upper():
            api("DELETE", f"/menu/categorias/{c['categoria']['id']}")
    for ing in api("GET", "/menu/ingredientes").json():
        if "dom-e2e" in ing["nombre"].lower():
            api("DELETE", f"/ingredientes/{ing['id']}")

    # --- crear categoria "Pizzas E2E" ---
    r = api("POST", "/menu/categorias", json={"nombre": "Pizzas E2E", "icono": "pizza", "orden": 9})
    cid = r.json()["id"]

    # --- ingredientes ---
    ing1 = api("POST", "/ingredientes", json={"nombre": "Champion DOM-E2E", "recargo": 5, "pizza": 1}).json()["id"]
    ing2 = api("POST", "/ingredientes", json={"nombre": "Pina DOM-E2E", "recargo": 5, "pizza": 1}).json()["id"]
    print(f"ingredientes: {ing1}, {ing2}")

    # --- grupo Orilla ---
    g = api("POST", "/menu/grupos", json={"nombre": "Orilla", "categoria_id": cid, "seleccion_texto": "elegir_una"}).json()["id"]
    oNormal = api("POST", "/menu/opciones", json={"grupo_id": g, "nombre": "Normal", "recargo": 0, "orden": 0}).json()["id"]
    oQueso = api("POST", "/menu/opciones", json={"grupo_id": g, "nombre": "Queso", "recargo": 15, "orden": 1}).json()["id"]
    oPhil = api("POST", "/menu/opciones", json={"grupo_id": g, "nombre": "Philadelphia", "recargo": 20, "orden": 2}).json()["id"]
    print(f"grupo {g}, opciones {oNormal},{oQueso},{oPhil}")

    # --- producto con precios por tamaño + receta base ---
    precios = {"individual": 90, "chica": 110, "mediana": 130, "grande": 160}
    r = api("POST", "/menu/productos", json={
        "categoria_id": cid, "nombre": "Pizza de la casa DOM-E2E", "descripcion": "Receta con champinones",
        "precio_base": 130, "icono": "pizza", "orden": 1, "personalizable": 1,
        "precios": precios, "receta": [ing1],
    })
    pid = r.json()["id"]
    print(f"producto {pid}")

    # --- verificar catalogo ---
    cat = api("GET", "/menu/catalogo").json()
    prod = None
    for c in cat:
        for p in c["productos"]:
            if p["id"] == pid:
                prod = p
    assert prod, "producto no aparece en catalogo"
    assert prod["precios"] == precios, f"precios mal: {prod['precios']}"
    assert prod["receta"] == [ing1], f"receta mal: {prod['receta']}"
    print("catalogo OK: precios + receta")

    # --- pedido ---
    payload = {
        "tipo": "llevar", "cliente_nombre": "E2E Dominos", "metodo_pago": "efectivo",
        "items": [{
            "producto_id": pid, "cantidad": 1, "tamano": "mediana",
            "opciones": {str(g): oPhil},
            "ingredientes_extra": [],
            "personalizada": {"distribucion": "mitad", "mitad1": [ing1], "mitad2": [ing2]},
        }],
    }
    r = api("POST", "/pedidos", json=payload)
    assert r.status_code == 200, f"pedido fallo: {r.text}"
    ped = r.json()
    total_esperado = precios["mediana"] + 20
    assert abs(ped["total"] - total_esperado) < 0.01, f"total {ped['total']} != {total_esperado}"
    print(f"pedido OK total={ped['total']} (esperado {total_esperado}) folio={ped['folio']}")

    # --- verificar detalle/descripcion ---
    det = api("GET", f"/pedidos/{ped['id']}").json()
    cfg = det["items"][0]["configuracion"]
    assert "Tamaño: Mediana" in cfg, f"desc sin tamaño: {cfg}"
    assert "Philadelphia" in cfg, f"desc sin orilla: {cfg}"
    assert "Champion DOM-E2E" in cfg, f"desc sin mitad1: {cfg}"
    assert "Pina DOM-E2E" in cfg, f"desc sin mitad2: {cfg}"
    assert abs(det["items"][0]["precio_unitario"] - total_esperado) < 0.01
    print(f"descripcion OK: {cfg}")

    # --- limpieza ---
    api("POST", f"/pedidos/{ped['id']}/cancelar?motivo=E2E%20fin", json={})
    api("DELETE", f"/menu/productos/{pid}")
    api("DELETE", f"/menu/categorias/{cid}")
    for iid in (ing1, ing2):
        api("DELETE", f"/ingredientes/{iid}")
    print("LIMPIEZA OK")
    print("E2E PIZZA DOMINO'S: PASS")


if __name__ == "__main__":
    main()