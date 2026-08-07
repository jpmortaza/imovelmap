-- ImovelMap — Fase 2 · extensoes
-- postgis: cerco geografico e geometria dos predios
-- vector:  embeddings de fachada (pgvector)
-- pg_trgm: busca por similaridade de logradouro
-- pg_cron: sitemaps que nao bloqueiam (Rede Gaucha)
-- pg_net:  chamadas HTTP assincronas a partir do banco

create extension if not exists postgis  with schema extensions;
create extension if not exists vector   with schema extensions;
create extension if not exists pg_trgm  with schema extensions;
create extension if not exists pg_net   with schema extensions;
create extension if not exists pg_cron;
