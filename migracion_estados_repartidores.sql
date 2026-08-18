-- Ejecuta este script una vez en el SQL Editor de Supabase antes de desplegar.
-- Conserva los pedidos existentes y agrega trazabilidad de cocina y reparto.

ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS repartidor_nombre TEXT NOT NULL DEFAULT '';
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS preparacion_en TIMESTAMPTZ;
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS listo_en TIMESTAMPTZ;
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS entregado_en TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_pedidos_repartidor ON pedidos(restaurante_id, repartidor_nombre);
