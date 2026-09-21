-- Keep the catalog's deterministic name/id ordering index-backed.
-- The browser requests these columns and orders by name_en, then id.
create index if not exists companies_name_en_id_idx
on public.companies (name_en, id);

create index if not exists products_name_en_id_idx
on public.products (name_en, id);

create index if not exists offers_name_en_id_idx
on public.offers (name_en, id);

analyze public.companies;
analyze public.products;
analyze public.offers;
