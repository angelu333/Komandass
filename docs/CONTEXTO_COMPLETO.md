# Comandas · Sistema Multinegocio de Restaurantes — Documentación Completa

> Documento de contexto integral para retomar el proyecto en cualquier conversación.
> Última actualización: 2026-08-18.

---

## 1. Qué es el proyecto

Un **sistema de comandas multinegocio** para restaurantes (pizzerías, taquerías, etc.), estilo Domino's para el menú: una sola app web que permite **tomar pedidos, configurar pizzas personalizables, ver la cocina en vivo, llevar historial y generar reportes**. Cada cuenta = un negocio.

- **Frontend**: HTML/CSS/JS vanilla (sin frameworks), servido por el mismo backend.
- **Backend**: FastAPI (Python) con arquitectura **clean** (dominio puro + aplicación + infraestructura).
- **Base de datos**: Supabase (PostgreSQL + Auth + PostgREST).
- **Despliegue**: Vercel (serverless, una sola función Python).

### Repos
- Repo local: `C:\Users\PC001\pizzeria-app`
- GitHub remoto: **https://github.com/angelu333/Komandass.git** (branch `main`)

### Credenciales demo
- Email: `prueba.opencode@gmail.com`
- Password: `DemoNegocio123`
- Negocio: "Taqueria El Mexicano" (id 16)

---

## 2. Cómo levantar / probar localmente

```bat
iniciar.bat        :: arranca uvicorn en 127.0.0.1:8123 (app.main:app)
```

- App local: `http://127.0.0.1:8123`
- Backend usa Supabase; credenciales en `.env` (**no versionado**, está en `.gitignore`).
- Tras cambios de backend hay que **reiniciar el server**; tras cambios de frontend, **recargar sin caché (Ctrl+F5)**.
- Verificación rápida de sintaxis: `python -m compileall app -q` y `node --check static/app.js`.

### Variables de entorno (`.env`)
```
SUPABASE_URL = https://TU-PROYECTO.supabase.co
SUPABASE_SERVICE_KEY = TU-SERVICE-ROLE-KEY-SECRETA
```
- `config.py` lee `.env` si existe (con `setdefault`, no pisa variables ya definidas).
- En Vercel se configuran en el dashboard (Settings → Environment Variables), **nunca** en el repo.

---

## 3. Arquitectura del backend (clean)

```
app/
├── main.py                       # Bootstrap FastAPI: monta routers + sirve estáticos + index.html
├── core/
│   ├── config.py                 # Lee .env → SUPABASE_URL, SUPABASE_KEY (service role)
│   └── deps.py                   # get_current_user, get_restaurante, get_restaurante_id
├── api/
│   ├── schemas/                  # Pydantic: auth, menu, pedidos, ingredientes, clientes
│   └── routers/                  # auth, menu, pedidos, ingredientes, clientes, reportes
├── application/
│   └── servicios/                # Lógica de caso de uso: auth, menu, pedidos, ingredientes, clientes, reportes
├── domain/                       # Módulos PUROS (sin imports de BD/infra)
│   ├── pedidos.py                # Estados, transiciones, folio, timestamps
│   └── precios.py                # Cálculo de precios y descripciones (Protocol LectorPrecios)
└── infrastructure/
    ├── database.py               # Cliente supabase + HTTP/1.1 + reintentos (4) ante errores de red
    └── repositorios/
        ├── base.py               # select/insert/update/delete genérico + restaurar service_role + config
        └── lectura_precios.py    # LectorPreciosSupabase (adaptador que inyecta datos al dominio)
```

**Puntos clave del diseño:**
- **`app/domain/` no importa BD** — las reglas reciben un `LectorPrecios` (Protocol) para leer recargos/nombres; la infraestructura lo implementa en `lectura_precios.py`.
- **Tenant transversal**: cada filtro lleva `restaurante_id` (`_con_tenant` en `base.py`). Las tablas tienen la columna `restaurante_id` para aislar negocios.
- **`database.py`** reconfigura la sesión del cliente supabase a HTTP/1.1 (evita WinError 10035 en Windows) y `ejecutar()` reintenta hasta 4 veces ante errores transitorios de red con backoff.
- **`_restaurar_service_role()`** en `base.py`: tras llamadas a `auth.sign_up/sign_in/get_user`, supabase-py cambia el header Authorization del cliente PostgREST al JWT del usuario (rol `authenticated`); se regresa siempre al `service_role` para que el backend vea todas las filas.

### Flujo de auth (importante, hubo bugs aquí)
- `signup` → `supabase.auth.sign_up` → **`confirma_email()`** hace `PUT` a `/auth/v1/admin/users/{id}` con `{"email_confirm": true}` (Supabase exige **PUT**, PATCH da 405).
- Si Supabase tiene **"Confirm email" activado** (default), `sign_up` **no devuelve sesión** (`session=None`); por eso `signup()` hace un **fallback a `login`** tras confirmar el correo, para regresar un token válido al frontend.
- `login` → `auth.sign_in_with_password`. Errores "invalid login credentials" → 401 "Email o contraseña incorrectos".
- Rate limit de Supabase en signups → el backend lo traduce a **429 "Demasiados intentos"**.

---

## 4. Esquema de base de datos (Supabase)

Archivos en `sql/`: `supabase_schema.sql` (base) + `migracion_pizza.sql` + `migracion_precios_pizza.sql` + `migracion_estados_repartidores.sql`.

### Tablas principales
| Tabla | Propósito | Columnas notables |
|-------|-----------|-------------------|
| `categorias` | Secciones del menú | `nombre, icono, orden, activa, restaurante_id` |
| `productos` | Artículos | `categoria_id, nombre, descripcion, precio_base, personalizable, precios (JSON TEXT), restaurante_id` |
| `grupos_opciones` | Grupos (Tamaño, Orilla, Masa) | `nombre, categoria_id, seleccion_texto, orden, restaurante_id` |
| `opciones` | Opciones dentro de un grupo | `grupo_id, nombre, recargo, orden, restaurante_id` |
| `ingredientes` | Toppings | `nombre, recargo, stock, minimo, unidad, descontable, activo, pizza (flag topping), restaurante_id` |
| `producto_ingrediente` | Receta base por producto | `producto_id, ingrediente_id, base (1=receta), obligatorio, restaurante_id` |
| `clientes` | Clientes | `nombre, telefono, direccion, notas, creado_en, restaurante_id` |
| `pedidos` | Comandas | `folio, cliente_id, cliente_nombre, tipo, mesa, direccion, telefono, nota, metodo_pago, estado, total, creado_en, enviado_en, pagado_en, cancelado_en, motivo_cancelacion, restaurante_id` |
| `detalle_pedido` | Líneas del pedido | `pedido_id, producto_id, producto_nombre, cantidad, configuracion (descripción), precio_unitario, subtotal, restaurante_id` |
| `detalle_ingredientes` | Ingredientes por línea (no usado activamente) | — |
| `config` | Clave→valor por negocio | `clave, valor, restaurante_id` (ej: `precio_combinado`) |

### Migraciones aplicadas
1. **`migracion_pizza.sql`**: tabla `config`, columna `ingredientes.pizza`, columna `productos.personalizable`, seed de `precio_combinado=15`.
2. **`migracion_precios_pizza.sql`**: columna `productos.precios TEXT DEFAULT ''` (JSON `{"individual":..,"chica":..,"mediana":..,"grande":..}`). La receta base usa la tabla `producto_ingrediente` ya existente.

### Seguridad
- RLS **habilitado** en todas las tablas pero con política abierta `todos_acceso_total` (`USING true`). El aislamiento real lo hace el backend: filtros `restaurante_id` + acceso por `service_role`. **No exponer** la service key al frontend.

---

## 5. API (resumen de rutas)

Todas bajo `/api`. Autenticación: header `Authorization: Bearer <token>`. Cada endpoint inyecta el `restaurante_id` del usuario logueado.

### Auth
| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/auth/signup` | Crea cuenta + confirma email + regresa sesión |
| POST | `/api/auth/login` | Inicia sesión |
| GET | `/api/me` | Usuario + su negocio |
| POST | `/api/restaurantes` | Crea el negocio (onboarding) |
| PUT | `/api/restaurantes/{rid}` | Edita nombre/teléfono/dirección/ícono |

### Menú / catálogo
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/menu` | Menú activo (para tomar pedido) |
| GET | `/api/menu/catalogo` | Catálogo completo (admin) |
| GET | `/api/menu/productos`, `/api/menu/ingredientes`, `/api/menu/opciones`, `/api/menu/todo/personal` | Listados |
| GET/PUT | `/api/menu/config/precio_combinado` | Recargo combinado |
| POST/PUT/DELETE | `/api/menu/categorias[/{cid}]` | CRUD categorías (DELETE desactiva) |
| POST/PUT/DELETE | `/api/menu/productos[/{pid}]` | CRUD productos (acepta `precios` JSON y `receta`) |
| POST/DELETE | `/api/menu/grupos[/{gid}]` | CRUD grupos de opciones |
| POST/DELETE | `/api/menu/opciones[/{oid}]`, PUT `/opciones/{oid}/recargo` | CRUD opciones |

### Ingredientes
| Método | Ruta |
|--------|------|
| GET/POST | `/api/ingredientes` |
| PUT/DELETE | `/api/ingredientes/{iid}` |

### Pedidos
| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/pedidos` | Crea pedido con items (calcula precios y descripciones) |
| GET | `/api/pedidos?activos=true&estado=` | Lista (activos por default) |
| GET | `/api/pedidos/{id}` | Detalle con items |
| POST | `/api/pedidos/{id}/estado?estado=` | Cambia estado (valida transiciones) |
| POST | `/api/pedidos/{id}/cancelar?motivo=` | Cancela |

### Clientes
| Método | Ruta |
|--------|------|
| GET | `/api/clientes?q=` (busca por nombre o teléfono) |
| POST | `/api/clientes` |
| GET | `/api/clientes/{cid}/ultimo_pedido` |

### Reportes
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/reportes/dia?fecha=YYYY-MM-DD` | Pedidos, entregados, en proceso, total, por método de pago, top 10 productos |
| GET | `/api/reportes/rango?dias=30` | Ventas por día en el rango |

---

## 6. Feature set actual

### Estados de pedido (flujo cocina)
- `recibido → preparacion → entregado` (+ `cancelado`). **Entregado = cobrado**.
- Transiciones validadas en `app/domain/pedidos.py` (saltos inválidos → 400). Entregar registra `pagado_en` y `enviado_en`.
- Folio del día: `YYMMDD-NNN` (contador = pedidos creados hoy).

### Constructor de pizza estilo Domino's (feature estrella)
- **Activación automática** en categorías cuyo nombre incluye "pizza" (o productos con `personalizable=1` o con `precios`).
- **Wizard de 4 pasos**: Tamaño → Orilla/grupos → Ingredientes → Revisar + cantidad + nota. Total en vivo, botón fijo "Agregar al pedido $X".
- **4 tamaños** con precio propio por producto (columna `precios` JSON). El constructor **ignora** grupos llamados "Tamaño" (el tamaño es nativo).
- **Ingredientes**: Sin / Entera / ½ Izq / ½ Der (mitad izquierda/derecha); "Mitad y mitad" o "Combinado" (recargo `precio_combinado`, default 15, solo si hay 2+ ingredientes y distribución=combinado).
- **Receta base** (`producto_ingrediente` con `base=1`): al abrir una pizza predeterminada sus toppings vienen pre-marcados como "entera". Editable desde el catálogo.
- **Descripción del detalle**: "Tamaño: Mediana · Orilla: Philadelphia · Personalizada: Mitad y mitad — Mitad 1 (…) · Mitad 2 (…)". En pizzas con precio por tamaño los ingredientes ya están incluidos (no se suma recargo combinado).
- En el catálogo se muestran los 4 precios bajo el input de precio base.

### Catálogo / menú (admin)
- Categorías: crear / editar (nombre e ícono) / ocultar / reactivar. **Nunca se borran datos** (desactivar = `activa=0`).
- Productos: crear/editar/ocultar/reactivar, precio editable en línea, checkbox "Pizza personalizable", edición de precios por tamaño y receta base.
- Grupos de opciones editables: crear grupo, agregar/quitar opciones, editar recargo en línea; plantilla "Tamaño + Orilla" de 1 clic.
- Ingredientes (toppings): CRUD completo, flag "Es topping de pizza".
- **Actualización en vivo**: crear/editar categoría o producto se refleja al instante en Catálogo y en Tomar pedido, sin recargar.

### Offline / cola
- Banner "Sin conexión" (`#offline-banner`) + cola en `localStorage["cola_offline"]`.
- `api()` marca offline en fallos de red y en 5xx; al reconectar vacía la cola (`flushCola`).
- Pedidos offline usan folio provisional `PEN-XXX` y se mapean al id real al reenviar.
- `/api/me` con token inválido devuelve 401 → la app cierra sesión sola.

### Configuración del negocio
- Botón engranaje en el sidebar (`#btn-config`) abre modal para editar nombre/teléfono/dirección → `PUT /restaurantes/{rid}` → actualiza `#brand-name` al instante.
- Nombre del negocio también se registra en el onboarding (`POST /restaurantes`).

### Otros
- Clientes con búsqueda y "última orden"; historial con detalle de pedidos; reportes del día/rango con gráfica SVG.
- Reloj en vivo, badge de cocina con contador, sonido (WebAudio) y **Wake Lock** para que la tableta no apague la pantalla.
- Tiempos: `umbral` (minutos críticos) y `warn` (aviso) configurables vía query params (`?umbral=15&warn=10`).

---

## 7. Frontend

Archivos en `static/`:
- `index.html` — pantallas: auth (login/registro), onboarding (crear negocio), app (sidebar + 7 vistas), modales, toasts.
- `app.js` — toda la lógica del cliente (~2050 líneas): estado global en `state`, fetch helper `api()`, render por vista, wizard de pizza, cola offline, cocina con loop de contadores, reportes con gráfica SVG.
- `style.css` — tema claro, variables CSS, responsive/táctil.
- `icons.js` — set de íconos SVG inline (`icon("cart")` etc.).
- `icons/favicon.svg`.

### Estado global (`app.js`)
```js
const state = {
  token: localStorage.getItem("ctoken") || "",
  negocio: null, pedido: { items: [] }, cliente: null,
  tab: "pedir", umbralMin: 15, umbralWarn: 8, ...
};
```

### Vistas principales
1. **Tomar pedido**: categorías → productos → carrito (con notas por ítem) → modal confirmar (datos cliente/mesa/dirección/pago).
2. **Cocina**: comandas activas con edad en segundos, contadores por receta, botones de estado, alerta sonora cuando algo supera el umbral.
3. **Historial**: pedidos pasados con detalle.
4. **Catálogo**: gestión de categorías/productos/grupos/opciones/recetas/precios.
5. **Ingredientes**: CRUD de toppings.
6. **Clientes**: búsqueda, creación, "última orden".
7. **Reportes**: resumen del día y ventas por rango con gráfica.

---

## 8. Despliegue en Vercel

### Configuración
- `api/index.py`: `from app.main import app` → entrypoint que Vercel detecta.
- `vercel.json`:
  ```json
  {
    "$schema": "https://openapi.vercel.sh/vercel.json",
    "functions": { "api/index.py": { "maxDuration": 60 } }
  }
  ```
  (Se eliminó `builds`/`routes`: Vercel auto-detecta FastAPI y promueve los estáticos al CDN.)
- `requirements.txt`: `fastapi`, `uvicorn`, `supabase`, `httpx`.

### Pasos (hechos)
1. Repo subido a GitHub (branch `main`).
2. En Vercel: Import Project → `angelu333/Komandass` → variables de entorno `SUPABASE_URL` y `SUPABASE_SERVICE_KEY` (copiadas del `.env` local) → Deploy.
3. Cada `git push` a `main` redespliega automáticamente.

### Notas de producción
- La service key vive en el entorno de Vercel (server-side), no se expone al navegador.
- App stateless (estado en Supabase + localStorage) → compatible con serverless.
- Se eliminó el endpoint `/api/ip` (usaba socket, no se usaba y colgaba en serverless).
- Plan free: límite de invocaciones y timeout 10s por default (se configuró `maxDuration: 60`).

---

## 9. Pendientes / ideas

- [ ] Probar a fondo la cola offline en navegador real (desconexión física).
- [ ] Borrado "real" de cliente marcado inactivo (hay TODO en `app.js`).
- [ ] Pruebas de reporte con varios días/zonas horarias.
- [ ] (Opcional) Editar/renombrar grupo de opciones (hoy solo crear/borrar).
- [ ] Backups periódicos del esquema / datos.
- [ ] Verificar el registro de usuarios nuevo en Vercel (el rate limit de Supabase bloqueó las pruebas; esperar ~1h o probar desde otra red).

---

## 10. Notas de sesión recientes (2026-08)

### Sesión actual
- Despliegue en Vercel configurado: `api/index.py` + `vercel.json` + eliminación de `/api/ip`. Commit `0a60902`.
- Fix a `vercel.json` (Vercel no permite `functions` + `builds` juntos): se dejó solo `functions`. Commit `a618ad4`.
- **Fix crítico de registro**: `signup()` ahora hace login de respaldo cuando `sign_up` no devuelve sesión (confirm email activado). Commits `dfcfe88` + `a0324f4`.
- Verificado: `confirma_email` (PUT admin) responde 200; login demo → `/me` 200 con negocio.
- Bloqueo actual: Supabase "email rate limit exceeded" al probar signup (temporal, ~1h).

### Sesión anterior (2026-08-14)
- Constructor de pizza completo (backend + frontend) validado con `e2e_pizza_dominos.py` (**PASS**): Mediana $130 + Philadelphia +$20 = $150, descripción correcta, catálogo con precios + receta, limpieza completa.
- Migración `precios` aplicada.
- Fixes: `DELETE /ingredientes/{iid}` y confirmación de email (PATCH → PUT).
- Modal "Configuración del negocio" implementado y verificado.

---

## 11. Archivos de referencia

| Archivo | Para qué sirve |
|---------|----------------|
| `PROYECTO.md` | Bitácora del proyecto (estado, API, pendientes) |
| `supabase_schema.sql` | Esquema base (pegar en SQL Editor de Supabase) |
| `migracion_pizza.sql`, `migracion_precios_pizza.sql` | Migraciones posteriores |
| `e2e_pizza_dominos.py` | Test E2E del constructor de pizza |
| `iniciar.bat` | Arranca el servidor local |
| `.env.example` | Plantilla de variables de entorno |
| `vercel.json`, `api/index.py` | Config de despliegue |