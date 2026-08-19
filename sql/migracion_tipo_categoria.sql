-- Migración: Tipo de categoría (pizza vs regular)
ALTER TABLE categorias ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'regular';
