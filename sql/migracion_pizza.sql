-- ============================================================
-- PIZZERIA · Migración Pizza Personalizada
-- Pega TODO este script en el SQL Editor de Supabase y ejecuta.
-- ============================================================

-- Tabla de configuración (clave -> valor) para el "precio del combinado"
CREATE TABLE IF NOT EXISTS config (
    clave TEXT PRIMARY KEY,
    valor TEXT NOT NULL DEFAULT ''
);

-- Marca de "ingrediente de pizza" en ingredientes
ALTER TABLE ingredientes ADD COLUMN IF NOT EXISTS pizza INTEGER NOT NULL DEFAULT 0;

-- Marca de "producto personalizable" (pizza mitad y mitad / combinado)
ALTER TABLE productos ADD COLUMN IF NOT EXISTS personalizable INTEGER NOT NULL DEFAULT 0;

-- Valor por defecto del recargo combinado (editable después desde el Catálogo)
INSERT INTO config (clave, valor) VALUES ('precio_combinado', '15')
ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor;

SELECT 'MIGRACION APLICADA CORRECTAMENTE' AS resultado;
