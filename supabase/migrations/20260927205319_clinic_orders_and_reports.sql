-- Orders are placed without online payment. Item names, brands, images and
-- unit prices are snapshotted so later catalog edits cannot rewrite history.
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete restrict,
  customer_name text not null check (char_length(btrim(customer_name)) between 1 and 160),
  customer_username text not null check (customer_username ~ '^[a-z0-9][a-z0-9._-]{2,39}$'),
  status text not null default 'placed'
    check (status in ('placed', 'confirmed', 'fulfilled', 'cancelled')),
  subtotal numeric(14, 2) not null default 0 check (subtotal >= 0),
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  company_id uuid references public.companies(id) on delete set null,
  product_name_ar text not null check (char_length(btrim(product_name_ar)) between 1 and 240),
  product_name_en text not null check (char_length(btrim(product_name_en)) between 1 and 240),
  company_name_ar text not null check (char_length(btrim(company_name_ar)) between 1 and 200),
  company_name_en text not null check (char_length(btrim(company_name_en)) between 1 and 200),
  image_url text,
  unit_price numeric(14, 2) not null check (unit_price >= 0),
  quantity integer not null check (quantity between 1 and 9999),
  line_total numeric(18, 2) generated always as (unit_price * quantity) stored,
  created_at timestamptz not null default now(),
  constraint order_items_one_product_per_order unique (order_id, product_id)
);

create index orders_user_created_idx on public.orders (user_id, created_at desc, id);
create index orders_created_idx on public.orders (created_at, id);
create index orders_status_created_idx on public.orders (status, created_at, id);
create index order_items_order_id_idx on public.order_items (order_id);
create index order_items_product_id_idx on public.order_items (product_id);
create index order_items_company_id_idx on public.order_items (company_id);

create trigger orders_revision_trigger
  before update on public.orders
  for each row execute function public.enforce_revision_increment();

alter table public.orders enable row level security;
alter table public.orders force row level security;
alter table public.order_items enable row level security;
alter table public.order_items force row level security;

create policy orders_owner_or_admin_select on public.orders
  for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()));

create policy order_items_owner_or_admin_select on public.order_items
  for select to authenticated
  using (
    (select private.is_admin())
    or exists (
      select 1
      from public.orders as order_row
      where order_row.id = order_id
        and order_row.user_id = (select auth.uid())
    )
  );

revoke all on table public.orders, public.order_items from public, anon, authenticated;
grant select on table public.orders, public.order_items to authenticated;
grant all on table public.orders, public.order_items to service_role;

-- The browser sends IDs and quantities only. The function re-reads current
-- catalog prices and creates the order and all snapshots in one transaction.
create function public.place_order(p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_item_count integer;
  v_valid_count integer;
  v_order_id uuid;
  v_subtotal numeric(14, 2);
  v_created_at timestamptz;
  v_customer_name text;
  v_customer_username text;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;

  if not (select private.is_active_member()) then
    raise exception using errcode = '42501', message = 'active_member_required';
  end if;

  select user_row.name, user_row.username
    into v_customer_name, v_customer_username
    from public.users as user_row
   where user_row.id = v_user_id and user_row.active
   for share;

  if not found then
    raise exception using errcode = '42501', message = 'active_member_required';
  end if;

  if jsonb_typeof(p_items) is distinct from 'array' then
    raise exception using errcode = '22023', message = 'invalid_order_items';
  end if;

  v_item_count := jsonb_array_length(p_items);
  if v_item_count < 1 or v_item_count > 100 then
    raise exception using errcode = '22023', message = 'invalid_order_items';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_items) as item(value)
    where jsonb_typeof(item.value) is distinct from 'object'
  ) or exists (
    select 1
    from jsonb_to_recordset(p_items) as item(product_id text, quantity text)
    where item.product_id is null
       or item.product_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or item.quantity is null
       or item.quantity !~ '^[1-9][0-9]{0,3}$'
  ) then
    raise exception using errcode = '22023', message = 'invalid_order_items';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_items) as item(product_id uuid, quantity integer)
    group by item.product_id
    having count(*) > 1
  ) then
    raise exception using errcode = '22023', message = 'duplicate_order_items';
  end if;

  select count(*)
    into v_valid_count
    from jsonb_to_recordset(p_items) as item(product_id uuid, quantity integer)
    join public.products as product on product.id = item.product_id
   where item.quantity between 1 and 9999;

  if v_valid_count <> v_item_count then
    raise exception using errcode = '22023', message = 'product_unavailable';
  end if;

  select round(sum(round(product.final_price, 2) * item.quantity), 2)::numeric(14, 2)
    into v_subtotal
    from jsonb_to_recordset(p_items) as item(product_id uuid, quantity integer)
    join public.products as product on product.id = item.product_id;

  insert into public.orders (
    user_id, customer_name, customer_username, status, subtotal
  )
  values (
    v_user_id, v_customer_name, v_customer_username, 'placed', v_subtotal
  )
  returning id, created_at into v_order_id, v_created_at;

  insert into public.order_items (
    order_id, product_id, company_id,
    product_name_ar, product_name_en, company_name_ar, company_name_en,
    image_url, unit_price, quantity
  )
  select
    v_order_id, product.id, company.id,
    product.name_ar, product.name_en, company.name_ar, company.name_en,
    product.img_url, round(product.final_price, 2), item.quantity
  from jsonb_to_recordset(p_items) as item(product_id uuid, quantity integer)
  join public.products as product on product.id = item.product_id
  join public.companies as company on company.id = product.company_id;

  return jsonb_build_object(
    'id', v_order_id,
    'status', 'placed',
    'subtotal', v_subtotal,
    'created_at', v_created_at
  );
end;
$function$;

revoke all on function public.place_order(jsonb) from public, anon, authenticated;
grant execute on function public.place_order(jsonb) to authenticated;

-- Status changes are admin-only and optimistic, with no backwards transition
-- out of fulfilled or cancelled orders.
create function public.update_order_status(
  p_order_id uuid,
  p_status text,
  p_expected_revision integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_order public.orders%rowtype;
begin
  if (select auth.uid()) is null or not (select private.is_admin()) then
    raise exception using errcode = '42501', message = 'admin_required';
  end if;

  if p_status not in ('confirmed', 'fulfilled', 'cancelled') then
    raise exception using errcode = '22023', message = 'invalid_order_status';
  end if;

  update public.orders as order_row
     set status = p_status,
         revision = order_row.revision + 1,
         updated_at = now()
   where order_row.id = p_order_id
     and order_row.revision = p_expected_revision
     and (
       (order_row.status = 'placed' and p_status in ('confirmed', 'cancelled'))
       or (order_row.status = 'confirmed' and p_status in ('fulfilled', 'cancelled'))
     )
  returning order_row.* into v_order;

  if not found then
    if exists (select 1 from public.orders where id = p_order_id) then
      raise exception using errcode = '40001', message = 'order_conflict';
    end if;
    raise exception using errcode = 'P0002', message = 'order_not_found';
  end if;

  return jsonb_build_object(
    'id', v_order.id,
    'status', v_order.status,
    'revision', v_order.revision,
    'updated_at', v_order.updated_at
  );
end;
$function$;

revoke all on function public.update_order_status(uuid, text, integer)
  from public, anon, authenticated;
grant execute on function public.update_order_status(uuid, text, integer)
  to authenticated;

-- Commercial rankings and financial totals include fulfilled orders only.
-- The caller supplies calendar dates; each full day is interpreted in Cairo.
create function public.get_admin_order_reports(
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
          item.product_name_ar,
          item.product_name_en,
          item.image_url,
          sum(item.quantity)::bigint as quantity,
          count(distinct item.order_id)::bigint as orders,
          sum(item.line_total) as gross_item_subtotal
        from public.order_items as item
        join public.orders as order_row on order_row.id = item.order_id
        where order_row.status = 'fulfilled'
          and order_row.created_at >= v_start_at
          and order_row.created_at < v_end_at
        group by item.product_id, item.product_name_ar, item.product_name_en, item.image_url
        order by sum(item.quantity) desc, sum(item.line_total) desc, item.product_name_en
        limit 10
      ) as item_rows
    ), '[]'::jsonb),
    'most_ordered_brands', coalesce((
      select jsonb_agg(to_jsonb(brand_rows))
      from (
        select
          item.company_id,
          item.company_name_ar,
          item.company_name_en,
          sum(item.quantity)::bigint as quantity,
          count(distinct item.order_id)::bigint as orders,
          sum(item.line_total) as gross_item_subtotal
        from public.order_items as item
        join public.orders as order_row on order_row.id = item.order_id
        where order_row.status = 'fulfilled'
          and order_row.created_at >= v_start_at
          and order_row.created_at < v_end_at
        group by item.company_id, item.company_name_ar, item.company_name_en
        order by count(distinct item.order_id) desc, sum(item.line_total) desc, item.company_name_en
        limit 10
      ) as brand_rows
    ), '[]'::jsonb),
    'highest_purchase_clients', coalesce((
      select jsonb_agg(to_jsonb(client_rows))
      from (
        select
          order_row.user_id,
          order_row.customer_name,
          order_row.customer_username,
          count(*)::bigint as fulfilled_orders,
          sum(order_row.subtotal) as gross_item_subtotal
        from public.orders as order_row
        where order_row.status = 'fulfilled'
          and order_row.created_at >= v_start_at
          and order_row.created_at < v_end_at
        group by order_row.user_id, order_row.customer_name, order_row.customer_username
        order by sum(order_row.subtotal) desc, count(*) desc, order_row.customer_username
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
