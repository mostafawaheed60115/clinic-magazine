-- Keep ranking identity separate from mutable display snapshots. Foreign keys
-- on order_items intentionally become NULL when catalog rows are deleted, so
-- these copied identifiers remain available for historical aggregation.
alter table public.order_items
  add column product_identity_id uuid,
  add column company_identity_id uuid;

-- Preserve original catalog IDs where available. For rows whose catalog links
-- were already deleted, derive a deterministic best-effort key from snapshots.
update public.order_items as item
   set product_identity_id = coalesce(
         item.product_id,
         pg_catalog.md5(pg_catalog.jsonb_build_array(
           item.product_name_ar,
           item.product_name_en,
           item.company_name_ar,
           item.company_name_en
         )::text)::uuid
       ),
       company_identity_id = coalesce(
         item.company_id,
         pg_catalog.md5(pg_catalog.jsonb_build_array(
           item.company_name_ar,
           item.company_name_en
         )::text)::uuid
       )
 where item.product_identity_id is null
    or item.company_identity_id is null;

alter table public.order_items
  alter column product_identity_id set not null,
  alter column company_identity_id set not null;

comment on column public.order_items.product_identity_id is
  'Stable product identity captured at order time; intentionally not a foreign key.';
comment on column public.order_items.company_identity_id is
  'Stable brand identity captured at order time; intentionally not a foreign key.';

-- Populate the stable keys for every insert, including inserts outside the
-- normal checkout RPC. Deleted legacy links fall back to their saved snapshot.
create function private.set_order_item_identity_ids()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  new.product_identity_id := coalesce(
    new.product_id,
    pg_catalog.md5(pg_catalog.jsonb_build_array(
      new.product_name_ar,
      new.product_name_en,
      new.company_name_ar,
      new.company_name_en
    )::text)::uuid
  );
  new.company_identity_id := coalesce(
    new.company_id,
    pg_catalog.md5(pg_catalog.jsonb_build_array(
      new.company_name_ar,
      new.company_name_en
    )::text)::uuid
  );
  return new;
end;
$function$;

revoke all on function private.set_order_item_identity_ids()
  from public, anon, authenticated;

create trigger order_items_identity_ids_trigger
  before insert on public.order_items
  for each row execute function private.set_order_item_identity_ids();

-- Aggregate on the immutable identities and display current catalog names
-- when those rows still exist. Deleted entities fall back to saved labels.
create or replace function public.get_admin_order_reports(
  p_start_date date,
  p_end_date date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_start_at timestamptz;
  v_end_at timestamptz;
  v_result jsonb;
begin
  if (select auth.uid()) is null or not (select private.is_admin()) then
    raise exception using errcode = '42501', message = 'admin_required';
  end if;

  if p_start_date is null or p_end_date is null or p_start_date > p_end_date then
    raise exception using errcode = '22023', message = 'invalid_report_interval';
  end if;

  v_start_at := p_start_date::timestamp at time zone 'Africa/Cairo';
  v_end_at := (p_end_date + 1)::timestamp at time zone 'Africa/Cairo';

  select jsonb_build_object(
    'start_date', p_start_date,
    'end_date', p_end_date,
    'financial', (
      select jsonb_build_object(
        'currency', 'EGP',
        'fulfilled_orders', count(*),
        'gross_item_subtotal', coalesce(sum(order_row.subtotal), 0),
        'average_order_subtotal', coalesce(avg(order_row.subtotal), 0)
      )
      from public.orders as order_row
      where order_row.status = 'fulfilled'
        and order_row.created_at >= v_start_at
        and order_row.created_at < v_end_at
    ),
    'top_selling_items', coalesce((
      select jsonb_agg(to_jsonb(item_rows))
      from (
        select
          item.product_id,
          item.product_identity_id,
          coalesce(product.name_ar, min(item.product_name_ar)) as product_name_ar,
          coalesce(product.name_en, min(item.product_name_en)) as product_name_en,
          coalesce(product.img_url, min(item.image_url)) as image_url,
          sum(item.quantity)::bigint as quantity,
          count(distinct item.order_id)::bigint as orders,
          sum(item.line_total) as gross_item_subtotal
        from public.order_items as item
        join public.orders as order_row on order_row.id = item.order_id
        left join public.products as product on product.id = item.product_id
        where order_row.status = 'fulfilled'
          and order_row.created_at >= v_start_at
          and order_row.created_at < v_end_at
        group by
          item.product_identity_id,
          item.product_id,
          product.name_ar,
          product.name_en,
          product.img_url
        order by quantity desc, gross_item_subtotal desc, product_name_en
        limit 10
      ) as item_rows
    ), '[]'::jsonb),
    'most_ordered_brands', coalesce((
      select jsonb_agg(to_jsonb(brand_rows))
      from (
        select
          item.company_id,
          item.company_identity_id,
          coalesce(company.name_ar, min(item.company_name_ar)) as company_name_ar,
          coalesce(company.name_en, min(item.company_name_en)) as company_name_en,
          sum(item.quantity)::bigint as quantity,
          count(distinct item.order_id)::bigint as orders,
          sum(item.line_total) as gross_item_subtotal
        from public.order_items as item
        join public.orders as order_row on order_row.id = item.order_id
        left join public.companies as company on company.id = item.company_id
        where order_row.status = 'fulfilled'
          and order_row.created_at >= v_start_at
          and order_row.created_at < v_end_at
        group by
          item.company_identity_id,
          item.company_id,
          company.name_ar,
          company.name_en
        order by orders desc, gross_item_subtotal desc, company_name_en
        limit 10
      ) as brand_rows
    ), '[]'::jsonb),
    'highest_purchase_clients', coalesce((
      select jsonb_agg(to_jsonb(client_rows))
      from (
        select
          order_row.user_id,
          coalesce(user_row.name, min(order_row.customer_name)) as customer_name,
          coalesce(user_row.username, min(order_row.customer_username)) as customer_username,
          count(*)::bigint as fulfilled_orders,
          sum(order_row.subtotal) as gross_item_subtotal
        from public.orders as order_row
        left join public.users as user_row on user_row.id = order_row.user_id
        where order_row.status = 'fulfilled'
          and order_row.created_at >= v_start_at
          and order_row.created_at < v_end_at
        group by order_row.user_id, user_row.name, user_row.username
        order by gross_item_subtotal desc, fulfilled_orders desc, customer_username
        limit 10
      ) as client_rows
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$function$;

revoke all on function public.get_admin_order_reports(date, date)
  from public, anon, authenticated;
grant execute on function public.get_admin_order_reports(date, date)
  to authenticated;
