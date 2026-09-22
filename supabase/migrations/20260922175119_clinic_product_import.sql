-- Product import contract for the admin CSV workflow.
-- The expression index makes the documented name fallback deterministic and
-- prevents two products in one brand from sharing the same normalized English
-- name. Product IDs remain the preferred match key for exported files.
create unique index if not exists products_company_name_en_key_idx
on public.products (company_id, lower(btrim(name_en)));

create or replace function public.import_brand_products(
  p_company_id uuid,
  p_rows jsonb,
  p_dry_run boolean default true
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_row jsonb;
  v_row_no integer := 0;
  v_brand_id uuid;
  v_product_id uuid;
  v_lookup_id uuid;
  v_revision integer;
  v_existing public.products%rowtype;
  v_name_en text;
  v_name_ar text;
  v_name_key text;
  v_image_url text;
  v_product_url text;
  v_size_unit text;
  v_size_value numeric;
  v_qty integer;
  v_discount numeric;
  v_final_price numeric;
  v_action text;
  v_key text;
  v_errors text[];
  v_seen_rows integer;
  v_result jsonb := '[]'::jsonb;
  v_error_count integer := 0;
  v_created_count integer := 0;
  v_updated_count integer := 0;
  v_unchanged_count integer := 0;
  v_plan record;
begin
  if not (select private.is_admin()) then
    raise exception using errcode = '42501', message = 'Administrator access required';
  end if;

  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception using errcode = '22023', message = 'Import rows must be a JSON array';
  end if;
  if octet_length(p_rows::text) > 5 * 1024 * 1024 then
    raise exception using errcode = '22023', message = 'Import exceeds the 5 MB limit';
  end if;
  if jsonb_array_length(p_rows) > 5000 then
    raise exception using errcode = '22023', message = 'Import exceeds the 5,000 row limit';
  end if;

  select id into v_brand_id
  from public.companies
  where id = p_company_id;
  if v_brand_id is null then
    raise exception using errcode = '22023', message = 'Selected brand was not found';
  end if;

  create temp table _clinic_import_plan (
    row_no integer primary key,
    payload jsonb not null,
    product_id uuid,
    action text not null,
    changes text[] not null default '{}',
    errors text[] not null default '{}'
  ) on commit drop;
  create temp table _clinic_import_seen (
    match_key text primary key,
    row_no integer not null
  ) on commit drop;

  for v_row in select value from jsonb_array_elements(p_rows) loop
    v_row_no := v_row_no + 1;
    v_errors := '{}'::text[];
    v_action := 'new';
    v_lookup_id := null;
    v_existing := null;
    v_product_id := null;
    v_size_value := null;
    v_qty := null;
    v_discount := null;
    v_final_price := null;
    v_name_en := nullif(btrim(coalesce(v_row->>'name_en', '')), '');
    v_name_ar := nullif(btrim(coalesce(v_row->>'name_ar', '')), '');
    v_name_key := lower(coalesce(v_name_en, ''));
    v_image_url := nullif(btrim(coalesce(v_row->>'image_url', '')), '');
    v_product_url := nullif(btrim(coalesce(v_row->>'product_url', '')), '');
    v_size_unit := nullif(btrim(coalesce(v_row->>'size_unit', '')), '');

    if nullif(btrim(coalesce(v_row->>'brand_id', '')), '') is not null
       and btrim(v_row->>'brand_id') <> p_company_id::text then
      v_errors := array_append(v_errors, 'brand_id does not match the selected brand');
    end if;

    if nullif(btrim(coalesce(v_row->>'product_id', '')), '') is not null then
      begin
        v_product_id := (v_row->>'product_id')::uuid;
      exception when invalid_text_representation then
        v_errors := array_append(v_errors, 'product_id must be a UUID');
      end;
      if v_product_id is not null then
        select * into v_existing
        from public.products
        where id = v_product_id
        for update;
        if not found then
          v_errors := array_append(v_errors, 'product_id was not found');
        elsif v_existing.company_id <> p_company_id then
          v_errors := array_append(v_errors, 'product_id belongs to another brand');
        else
          v_lookup_id := v_existing.id;
          v_action := 'update';
        end if;
      end if;
    elsif v_name_key <> '' then
      select * into v_existing
      from public.products
      where company_id = p_company_id
        and lower(btrim(name_en)) = v_name_key
      for update;
      if found then
        v_lookup_id := v_existing.id;
        v_product_id := v_existing.id;
        v_action := 'update';
      end if;
    end if;

    if v_product_id is not null then
      v_key := 'id:' || v_product_id::text;
    elsif v_name_key <> '' then
      v_key := 'name:' || v_name_key;
    else
      v_key := 'row:' || v_row_no::text;
    end if;
    insert into _clinic_import_seen(match_key, row_no)
    values (v_key, v_row_no)
    on conflict (match_key) do nothing;
    get diagnostics v_seen_rows = row_count;
    if v_seen_rows = 0 then
      v_errors := array_append(v_errors, 'duplicate product key in this import');
    end if;

    if v_action = 'new' then
      if v_name_en is null then v_errors := array_append(v_errors, 'name_en is required for new products'); end if;
      if v_name_ar is null then v_errors := array_append(v_errors, 'name_ar is required for new products'); end if;
      if nullif(btrim(coalesce(v_row->>'size_value', '')), '') is null then
        v_errors := array_append(v_errors, 'size_value is required for new products');
      end if;
      if nullif(btrim(coalesce(v_row->>'final_price', '')), '') is null then
        v_errors := array_append(v_errors, 'final_price is required for new products');
      end if;
      if v_image_url is null then v_errors := array_append(v_errors, 'image_url is required for new products'); end if;
    end if;

    if v_name_en is not null and char_length(v_name_en) > 240 then v_errors := array_append(v_errors, 'name_en is too long'); end if;
    if v_name_ar is not null and char_length(v_name_ar) > 240 then v_errors := array_append(v_errors, 'name_ar is too long'); end if;
    if v_size_unit is not null and v_size_unit not in ('ml', 'g') then v_errors := array_append(v_errors, 'size_unit must be ml or g'); end if;
    if v_image_url is not null and v_image_url !~ '^https://[^[:space:]]+$' then v_errors := array_append(v_errors, 'image_url must start with https://'); end if;
    if v_product_url is not null and v_product_url !~ '^https://[^[:space:]]+$' then v_errors := array_append(v_errors, 'product_url must start with https://'); end if;

    begin
      if nullif(btrim(coalesce(v_row->>'size_value', '')), '') is not null then v_size_value := (v_row->>'size_value')::numeric; end if;
      if nullif(btrim(coalesce(v_row->>'qty', '')), '') is not null then v_qty := (v_row->>'qty')::integer; else v_qty := null; end if;
      if nullif(btrim(coalesce(v_row->>'discount', '')), '') is not null then v_discount := (v_row->>'discount')::numeric; else v_discount := null; end if;
      if nullif(btrim(coalesce(v_row->>'final_price', '')), '') is not null then v_final_price := (v_row->>'final_price')::numeric; end if;
    exception when invalid_text_representation or numeric_value_out_of_range then
      v_errors := array_append(v_errors, 'numeric fields contain an invalid value');
    end;

    if v_size_value is not null and v_size_value <= 0 then v_errors := array_append(v_errors, 'size_value must be greater than zero'); end if;
    if v_qty is not null and v_qty <= 0 then v_errors := array_append(v_errors, 'qty must be greater than zero'); end if;
    if v_discount is not null and (v_discount < 0 or v_discount > 100) then v_errors := array_append(v_errors, 'discount must be between 0 and 100'); end if;
    if v_final_price is not null and v_final_price < 0 then v_errors := array_append(v_errors, 'final_price must not be negative'); end if;

    if v_action = 'update' and v_existing.id is not null then
      if nullif(btrim(coalesce(v_row->>'revision', '')), '') is not null then
        begin
          if (v_row->>'revision')::integer <> v_existing.revision then
            v_errors := array_append(v_errors, 'revision is stale; export the product again');
          end if;
        exception when invalid_text_representation then
          v_errors := array_append(v_errors, 'revision must be an integer');
        end;
      end if;
      if v_name_en is not null and v_name_en <> v_existing.name_en then v_name_key := lower(v_name_en); end if;
      if v_name_key <> '' and exists (
        select 1 from public.products p
        where p.company_id = p_company_id
          and lower(btrim(p.name_en)) = v_name_key
          and p.id <> v_existing.id
      ) then v_errors := array_append(v_errors, 'name_en is already used by another product in this brand'); end if;
      v_name_en := coalesce(v_name_en, v_existing.name_en);
      v_name_ar := coalesce(v_name_ar, v_existing.name_ar);
      v_size_value := coalesce(v_size_value, v_existing.size_value);
      v_size_unit := coalesce(v_size_unit, v_existing.size_unit);
      v_qty := case when nullif(btrim(coalesce(v_row->>'qty', '')), '') is null then v_existing.qty else v_qty end;
      v_discount := case when nullif(btrim(coalesce(v_row->>'discount', '')), '') is null then v_existing.discount else v_discount end;
      v_final_price := coalesce(v_final_price, v_existing.final_price);
      if v_image_url is null then v_image_url := v_existing.img_url; end if;
      if v_product_url is null then v_product_url := v_existing.product_url; end if;
    end if;

    if v_action = 'update' and v_existing.id is not null and v_errors = '{}'::text[] then
      if v_name_en is distinct from v_existing.name_en or v_name_ar is distinct from v_existing.name_ar or
         v_size_value is distinct from v_existing.size_value or v_size_unit is distinct from v_existing.size_unit or
         v_qty is distinct from v_existing.qty or v_discount is distinct from v_existing.discount or
         v_final_price is distinct from v_existing.final_price or v_image_url is distinct from v_existing.img_url or
         v_product_url is distinct from v_existing.product_url then
        v_action := 'update';
      else
        v_action := 'unchanged';
      end if;
    end if;

    if cardinality(v_errors) > 0 then v_error_count := v_error_count + 1; end if;
    if v_action = 'new' and cardinality(v_errors) = 0 then v_created_count := v_created_count + 1; end if;
    if v_action = 'update' and cardinality(v_errors) = 0 then v_updated_count := v_updated_count + 1; end if;
    if v_action = 'unchanged' and cardinality(v_errors) = 0 then v_unchanged_count := v_unchanged_count + 1; end if;

    insert into _clinic_import_plan(row_no, payload, product_id, action, errors)
    values (v_row_no, v_row, v_lookup_id, v_action, v_errors);
    v_result := v_result || jsonb_build_array(jsonb_build_object(
      'row', v_row_no,
      'product_id', v_lookup_id,
      'action', v_action,
      'errors', to_jsonb(v_errors)
    ));
  end loop;

  if v_error_count > 0 or p_dry_run then
    return jsonb_build_object(
      'ok', v_error_count = 0,
      'dry_run', p_dry_run,
      'created', v_created_count,
      'updated', v_updated_count,
      'unchanged', v_unchanged_count,
      'errors', v_error_count,
      'rows', v_result
    );
  end if;

  for v_plan in select * from _clinic_import_plan order by row_no loop
    if v_plan.action = 'new' then
      insert into public.products (
        company_id, name, name_ar, name_en, qty, size_value, size_unit,
        img_url, discount, final_price, product_url, revision
      ) values (
        p_company_id,
        coalesce(nullif(btrim(v_plan.payload->>'name_en'), ''), nullif(btrim(v_plan.payload->>'name_ar'), '')),
        btrim(v_plan.payload->>'name_ar'),
        btrim(v_plan.payload->>'name_en'),
        nullif(btrim(coalesce(v_plan.payload->>'qty', '')), '')::integer,
        (v_plan.payload->>'size_value')::numeric,
        btrim(v_plan.payload->>'size_unit'),
        nullif(btrim(v_plan.payload->>'image_url'), ''),
        nullif(btrim(coalesce(v_plan.payload->>'discount', '')), '')::numeric,
        (v_plan.payload->>'final_price')::numeric,
        nullif(btrim(v_plan.payload->>'product_url'), ''),
        1
      );
    elsif v_plan.action = 'update' then
      update public.products p
      set name = coalesce(nullif(btrim(v_plan.payload->>'name_en'), ''), p.name),
          name_ar = coalesce(nullif(btrim(v_plan.payload->>'name_ar'), ''), p.name_ar),
          name_en = coalesce(nullif(btrim(v_plan.payload->>'name_en'), ''), p.name_en),
          qty = case when nullif(btrim(coalesce(v_plan.payload->>'qty', '')), '') is null then p.qty else (v_plan.payload->>'qty')::integer end,
          size_value = coalesce(nullif(btrim(v_plan.payload->>'size_value'), '')::numeric, p.size_value),
          size_unit = coalesce(nullif(btrim(v_plan.payload->>'size_unit'), ''), p.size_unit),
          img_url = coalesce(nullif(btrim(v_plan.payload->>'image_url'), ''), p.img_url),
          discount = case when nullif(btrim(coalesce(v_plan.payload->>'discount', '')), '') is null then p.discount else (v_plan.payload->>'discount')::numeric end,
          final_price = coalesce(nullif(btrim(v_plan.payload->>'final_price'), '')::numeric, p.final_price),
          product_url = coalesce(nullif(btrim(v_plan.payload->>'product_url'), ''), p.product_url),
          revision = p.revision + 1
      where p.id = v_plan.product_id and p.company_id = p_company_id;
    end if;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'dry_run', false,
    'created', v_created_count,
    'updated', v_updated_count,
    'unchanged', v_unchanged_count,
    'errors', 0,
    'rows', v_result
  );
end;
$$;

revoke all on function public.import_brand_products(uuid, jsonb, boolean) from public, anon;
grant execute on function public.import_brand_products(uuid, jsonb, boolean) to authenticated, service_role;
