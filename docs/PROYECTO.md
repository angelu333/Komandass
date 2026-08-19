# Pizzeria App — Bitácora del proyecto

Sistema multinegocio de comandas (frontend en `static/`, backend FastAPI limpio en `app/`).

> Proyecto en curso. Esta bitácora resume estado actual, arquitectura y pendientes para continuar en la siguiente sesión.

---

## Cómo levantar / probar

```bat
iniciar.bat        :: arranca uvicorn en 127.0.0.1:8123 (app.main:app)
```

- App: `http://127.0.0.1:8123`
- Usuario demo: `prueba.opencode@gmail.com` / `DemoNegocio123` (negocio "Taqueria El Mexicano")
- Backend usa Supabase (Postgres + Auth + PostgREST). Credenciales en `.env` (no versionar).
- Tras cambios de backend hay que reiniciar el server; tras cambios de frontend, recargar sin caché (Ctrl+F5).

---

## Arquitectura (clean)

```
app/
├── main.py                       # bootstrap FastAPI, sirve estáticos + API
├── core/
│   ├── config.py                 # lee .env
│   └── deps.py                   # get_current_user, get_restaurante(id)
├── api/
│   ├── schemas/                  # Pydantic (menu, pedidos, ingredientes…)
│   └── routers/                  # menu, pedidos, auth, ingredientes, clientes, reportes
├── application/
│   └── servicios/                # lógica: menu.py, pedidos.py, reportes.py, auth.py…
└── infrastructure/
    ├── database.py               # cliente supabase + timeout fail-fast (8s)
    └── repositorios/
        ├── base.py               # select/insert/update/delete genérico + auth
        └── lectura_precios.py    # lector para dominio precios
```
- `app/domain/` aloja módulos puros (reglas): `pedidos.py` (estados/transiciones), `precios.py` (cálculo y descripción).

Esquema SQL: `sql/supabase_schema.sql` (base) + `sql/migracion_pizza.sql` (columnas `pizza`, `personalizable`, tabla `config`) + `sql/migracion_precios_pizza.sql` (columna `precios`) + `sql/migracion_estados_repartidores.sql`.

---

## Feature set actual

### Cobro y estados (última versión)
- Estados: **recibido → preparacion → entregado** (+ `cancelado`). Entregado = cobrado.
- Transiciones validadas en `app/domain/pedidos.py` (saltos inválidos → 400). Entregar registra `pagado_en` y `enviado_en`.
- Reportes devuelven `entregados` / `en_proceso` (antes "pagados"). Reportes corrigen zona horaria a UTC (rango del día correcto con GMT−6).

### Nota por ítem
- Cada línea del carrito tiene input de nota (borrador en `renderCarritoHTML`/`bindCart`).
- Al crear el pedido, la nota se concatena a `configuracion` del detalle (`app.php`→servicios/pedidos.py).

### Offline / cola
- Banner "Sin conexión" (`#offline-banner`) + cola en `localStorage["cola_offline"]`.
- `api()` marca offline en fallos de red y en 5xx; reconectar vacía la cola (`flushCola`).
- Pedidos offline usan folio provisional `PEN-XXX` y se mapean a id real al reenviar.
- `/api/me` con token inválido devuelve 401 (antes 500) → la app cierra sesión sola.

### Catálogo / menú
- Categorías: **Nueva / Editar (nombre e ícono) / Ocultar / Reactivar** — nunca se borran datos (desactivar = `activa=0`).
- Productos: crear/editar/ocultar/reactivar, precio editable en línea, **checkbox "Pizza personalizable"**.
- **Grupos de opciones** (Tamaño, Orilla, Masa…) editables desde el catálogo: crear grupo, agregar/quitar opciones, editar recargo en línea; plantilla "Tamaño + Orilla" de 1 clic.
- **Pizza personalizable**: configurador con Mitad y mitad / Combinado; la mitad 1/2 son toppings; los grupos (orilla/tamaño) aplican a toda la pizza. Recargo "combinado" configurable (`precio_combinado`, default 15).
- Ingredientes (toppings): visible para todos + flag "Es topping de pizza".
- **Actualización en vivo**: crear/editar categoría o producto se refleja al instante en Catálogo y en Tomar pedido, sin recargar.

### Constructor de pizza (estilo Domino's)
- Se activa automáticamente en categorías cuyo nombre incluye "pizza" (o productos con `personalizable=1` o con `precios`).
- Wizard de 4 pasos: **Tamaño** (Individual/Chica/Mediana/Grande con precio propio) → **Orilla/grupos** → **Ingredientes** (Sin / Entera / ½ Izq / ½ Der, mitad izquierda/derecha) → **Revisar** + cantidad + nota. Total en vivo, botón fijo "Agregar al pedido $X".
- **Precio por tamaño por producto**: columna `productos.precios` (JSON `{"individual":..,"chica":..,"mediana":..,"grande":..}`). El constructor ignora grupos llamados "Tamaño" (el tamaño es nativo).
- **Receta base**: tabla `producto_ingrediente` (`base=1`); al abrir una pizza predeterminada sus toppings vienen pre-marcados como "entera". Editable desde el catálogo (checkbox en el modal de producto).
- `ItemConfig` ganó `tamano`; la descripción del detalle antepone "Tamaño: X"; en pizzas con precio por tamaño los ingredientes ya están incluidos (no se suma recargo combinado).
- En catálogo se muestran los 4 precios bajo el input de precio base.

### Otros
- Clientes con búsqueda y "última orden"; historial; reportes del día/rango con gráfica; multinegocio (1 cuenta = 1 negocio).
- **Configuración del negocio**: botón en el sidebar (icono engranaje) abre modal para editar nombre/teléfono/dirección → `PUT /restaurantes/{rid}` y actualiza el nombre del sidebar al instante.
- Fix: `DELETE /api/ingredientes/{iid}` (antes faltaba).
- Fix: confirmación de email al registrarse (`confirma_email` usaba PATCH, Supabase requiere PUT).

---

## API (resumen)

| Ruta | Métodos |
|------|---------|
| `/api/auth/login`, `/api/auth/signup` | POST |
| `/api/me` | GET |
| `/api/restaurantes` | POST, PUT `/{rid}` |
| `/api/menu` | GET (activo para pedir) |
| `/api/menu/catalogo` | GET (todo, pa' admin) |
| `/api/menu/categorias` | POST, PUT `/{cid}`, DELETE `/{cid}` (DELETE desactiva) |
| `/api/menu/productos` | POST, PUT `/{pid}`, DELETE `/{pid}` |
| `/api/menu/grupos` | POST, DELETE `/{gid}` |
| `/api/menu/opciones` | POST, DELETE `/{oid}`, PUT `/{oid}/recargo` |
| `/api/menu/ingredientes`, `/api/menu/opciones`, `/api/menu/config/precio_combinado` | GET/PUT |
| `/api/ingredientes` | GET, POST, PUT `/{iid}`, DELETE `/{iid}` |
| `/api/pedidos` | POST, GET(`?activos=`), GET `/{id}`, POST `/{id}/estado?estado=`, POST `/{id}/cancelar` |
| `/api/reportes/dia`, `/api/reportes/rango?dias=` | GET |
| `/api/clientes` | GET(`?q=`), POST |

---

## Pendientes / ideas

- [ ] Revisar a fondo la cola offline en navegador real (probar desconexión física).
- [ ] Borrado "real" de cliente marcado inactivo (hay TODO en `app.js`).
- [ ] Pruebas de reporte con varios días/zonas horarias.
- [ ] (Opcional) Editar grupo de opciones (renombrar), no solo borrar; hoy se crea y se borra.
- [ ] Backups periódicos del esquema / datos.

---

## Notas de la última sesión (2026-08-14)

- Se implementó el **constructor de pizza estilo Domino's** completo (backend + frontend): 4 tamaños con precio propio por pizza, orilla por grupos de opciones, toppings con mitad izquierda/derecha y receta base editable.
- Migración aplicada en Supabase: `ALTER TABLE productos ADD COLUMN IF NOT EXISTS precios TEXT NOT NULL DEFAULT '';`.
- Fixes: `DELETE /ingredientes/{iid}` y confirmación de email (`PATCH` → `PUT`).
- E2E validado (`e2e_pizza_dominos.py`): pizza Mediana (130) + Philadelphia (+20) = 150, descripción "Tamaño: Mediana · Orilla: Philadelphia · Personalizada: Mitad y mitad…", catálogo con precios + receta. Limpieza completa.
- Falta probar en navegador: el flujo visual del wizard (Ctrl+F5 para tomar el app.js nuevo). Sugerencia: crear categoría "Pizzas", grupo "Orilla", ingredientes con flag pizza, y pizzas con sus 4 precios y receta.