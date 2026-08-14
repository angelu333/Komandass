-- ============================================================
-- PIZZERIA · Sistema de Comandas · Esquema para Supabase
-- Pega TODO este script en el SQL Editor de Supabase y ejecuta.
-- ============================================================

-- ---------- EXTENSIÓN para generar UUIDs (folio) ----------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------- CATEGORÍAS ----------
CREATE TABLE IF NOT EXISTS categorias (
    id BIGSERIAL PRIMARY KEY,
    nombre TEXT NOT NULL UNIQUE,
    icono TEXT NOT NULL DEFAULT 'pizza',
    orden INTEGER NOT NULL DEFAULT 0,
    activa INTEGER NOT NULL DEFAULT 1
);

-- ---------- GRUPOS DE OPCIONES ----------
CREATE TABLE IF NOT EXISTS grupos_opciones (
    id BIGSERIAL PRIMARY KEY,
    nombre TEXT NOT NULL,
    categoria_id BIGINT,
    seleccion_texto TEXT NOT NULL DEFAULT 'elegir_una',
    orden INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (categoria_id) REFERENCES categorias(id) ON DELETE CASCADE
);

-- ---------- OPCIONES ----------
CREATE TABLE IF NOT EXISTS opciones (
    id BIGSERIAL PRIMARY KEY,
    grupo_id BIGINT NOT NULL,
    nombre TEXT NOT NULL,
    recargo REAL NOT NULL DEFAULT 0,
    orden INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (grupo_id) REFERENCES grupos_opciones(id) ON DELETE CASCADE
);

-- ---------- PRODUCTOS ----------
CREATE TABLE IF NOT EXISTS productos (
    id BIGSERIAL PRIMARY KEY,
    categoria_id BIGINT NOT NULL,
    nombre TEXT NOT NULL,
    descripcion TEXT DEFAULT '',
    precio_base REAL NOT NULL DEFAULT 0,
    icono TEXT NOT NULL DEFAULT 'pizza',
    activo INTEGER NOT NULL DEFAULT 1,
    orden INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (categoria_id) REFERENCES categorias(id) ON DELETE CASCADE
);

-- ---------- INGREDIENTES ----------
CREATE TABLE IF NOT EXISTS ingredientes (
    id BIGSERIAL PRIMARY KEY,
    nombre TEXT NOT NULL UNIQUE,
    recargo REAL NOT NULL DEFAULT 0,
    stock REAL NOT NULL DEFAULT 0,
    minimo REAL NOT NULL DEFAULT 1,
    unidad TEXT NOT NULL DEFAULT 'pz',
    descontable INTEGER NOT NULL DEFAULT 1,
    activo INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS producto_ingrediente (
    id BIGSERIAL PRIMARY KEY,
    producto_id BIGINT NOT NULL,
    ingrediente_id BIGINT NOT NULL,
    base INTEGER NOT NULL DEFAULT 0,
    obligatorio INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (producto_id) REFERENCES productos(id) ON DELETE CASCADE,
    FOREIGN KEY (ingrediente_id) REFERENCES ingredientes(id) ON DELETE CASCADE
);

-- ---------- CLIENTES ----------
CREATE TABLE IF NOT EXISTS clientes (
    id BIGSERIAL PRIMARY KEY,
    nombre TEXT NOT NULL,
    telefono TEXT DEFAULT '',
    direccion TEXT DEFAULT '',
    notas TEXT DEFAULT '',
    creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- PEDIDOS ----------
CREATE TABLE IF NOT EXISTS pedidos (
    id BIGSERIAL PRIMARY KEY,
    folio TEXT NOT NULL,
    cliente_id BIGINT,
    cliente_nombre TEXT NOT NULL DEFAULT '',
    tipo TEXT NOT NULL DEFAULT 'salon',
    mesa TEXT DEFAULT '',
    direccion TEXT DEFAULT '',
    telefono TEXT DEFAULT '',
    nota TEXT DEFAULT '',
    metodo_pago TEXT DEFAULT '',
    estado TEXT NOT NULL DEFAULT 'recibido',
    total REAL NOT NULL DEFAULT 0,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
    estado_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    enviado_en TIMESTAMPTZ,
    pagado_en TIMESTAMPTZ,
    cancelado_en TIMESTAMPTZ,
    motivo_cancelacion TEXT,
    FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_pedidos_estado ON pedidos(estado);
CREATE INDEX IF NOT EXISTS idx_pedidos_creado ON pedidos(creado_en);

-- ---------- DETALLE DE PEDIDO ----------
CREATE TABLE IF NOT EXISTS detalle_pedido (
    id BIGSERIAL PRIMARY KEY,
    pedido_id BIGINT NOT NULL,
    producto_id BIGINT NOT NULL,
    producto_nombre TEXT NOT NULL,
    cantidad INTEGER NOT NULL DEFAULT 1,
    configuracion TEXT NOT NULL DEFAULT '',
    precio_unitario REAL NOT NULL DEFAULT 0,
    subtotal REAL NOT NULL DEFAULT 0,
    FOREIGN KEY (pedido_id) REFERENCES pedidos(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS detalle_ingredientes (
    id BIGSERIAL PRIMARY KEY,
    detalle_id BIGINT NOT NULL,
    ingrediente_id BIGINT NOT NULL,
    ingrediente_nombre TEXT NOT NULL,
    cantidad REAL NOT NULL DEFAULT 1,
    recargo REAL NOT NULL DEFAULT 0,
    FOREIGN KEY (detalle_id) REFERENCES detalle_pedido(id) ON DELETE CASCADE
);

-- ---------- Row Level Security: desactivamos (acceso vía service_role) ----------
ALTER TABLE categorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE grupos_opciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE opciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE productos ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingredientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE producto_ingrediente ENABLE ROW LEVEL SECURITY;
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE pedidos ENABLE ROW LEVEL SECURITY;
ALTER TABLE detalle_pedido ENABLE ROW LEVEL SECURITY;
ALTER TABLE detalle_ingredientes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "todos_acceso_total" ON categorias;
CREATE POLICY "todos_acceso_total" ON categorias USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "todos_acceso_total" ON grupos_opciones;
CREATE POLICY "todos_acceso_total" ON grupos_opciones USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "todos_acceso_total" ON opciones;
CREATE POLICY "todos_acceso_total" ON opciones USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "todos_acceso_total" ON productos;
CREATE POLICY "todos_acceso_total" ON productos USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "todos_acceso_total" ON ingredientes;
CREATE POLICY "todos_acceso_total" ON ingredientes USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "todos_acceso_total" ON producto_ingrediente;
CREATE POLICY "todos_acceso_total" ON producto_ingrediente USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "todos_acceso_total" ON clientes;
CREATE POLICY "todos_acceso_total" ON clientes USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "todos_acceso_total" ON pedidos;
CREATE POLICY "todos_acceso_total" ON pedidos USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "todos_acceso_total" ON detalle_pedido;
CREATE POLICY "todos_acceso_total" ON detalle_pedido USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "todos_acceso_total" ON detalle_ingredientes;
CREATE POLICY "todos_acceso_total" ON detalle_ingredientes USING (true) WITH CHECK (true);

SELECT 'ESQUEMA CREADO CORRECTAMENTE' AS resultado;