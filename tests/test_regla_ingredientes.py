import httpx
from app.domain.precios import _calcular_recargo_ingredientes


class FakeLectorPorCantidad:
    def regla_ingredientes_extra(self):
        return {"modo": "por_cantidad", "incluidos": 2, "recargo_extra": 10.0}

    def recargo_ingrediente(self, i):
        return 15.0


class FakeLectorIndividual:
    def regla_ingredientes_extra(self):
        return {"modo": "individual", "incluidos": 0, "recargo_extra": 0.0}

    def recargo_ingrediente(self, i):
        return 15.0


def test_domain_calculation():
    fl_cant = FakeLectorPorCantidad()
    assert _calcular_recargo_ingredientes([1], fl_cant) == 0.0
    assert _calcular_recargo_ingredientes([1, 2], fl_cant) == 0.0
    assert _calcular_recargo_ingredientes([1, 2, 3], fl_cant) == 10.0
    assert _calcular_recargo_ingredientes([1, 2, 3, 4], fl_cant) == 20.0

    fl_ind = FakeLectorIndividual()
    assert _calcular_recargo_ingredientes([1], fl_ind) == 15.0
    assert _calcular_recargo_ingredientes([1, 2], fl_ind) == 30.0
    assert _calcular_recargo_ingredientes([1, 2, 3], fl_ind) == 45.0
    print("DOMAIN CALCULATION TESTS: PASS")


def test_api_endpoints():
    res = httpx.post(
        "http://127.0.0.1:8123/api/auth/login",
        json={"email": "prueba.opencode@gmail.com", "password": "DemoNegocio123"}
    ).json()
    token = res.get("session") or res.get("token")
    headers = {"Authorization": f"Bearer {token}"}

    # Set threshold rule
    r = httpx.put(
        "http://127.0.0.1:8123/api/menu/config/regla-ingredientes",
        json={"modo": "por_cantidad", "incluidos": 2, "recargo_extra": 10.0},
        headers=headers
    )
    assert r.status_code == 200
    assert r.json()["modo"] == "por_cantidad"
    assert r.json()["incluidos"] == 2
    assert r.json()["recargo_extra"] == 10.0

    # Get threshold rule
    r2 = httpx.get("http://127.0.0.1:8123/api/menu/config/regla-ingredientes", headers=headers)
    assert r2.status_code == 200
    assert r2.json()["modo"] == "por_cantidad"
    assert r2.json()["incluidos"] == 2
    assert r2.json()["recargo_extra"] == 10.0
    print("API ENDPOINTS TEST: PASS")


if __name__ == "__main__":
    test_domain_calculation()
    test_api_endpoints()
    print("ALL THRESHOLD INGREDIENT TESTS PASSED!")
