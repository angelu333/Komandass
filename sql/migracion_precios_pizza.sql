-- Constructor de pizza estilo Domino's
-- 1) Precios por tamaño por producto (JSON: {"individual":..,"chica":..,"mediana":..,"grande":..})
ALTER TABLE productos ADD COLUMN IF NOT EXISTS precios TEXT NOT NULL DEFAULT '';

-- 2) La tabla de receta base ya existe (producto_ingrediente) con columna "base".
--    No requiere cambios.