-- The unique (order_id, product_id) index already supports order_id lookups.
-- Avoid keeping a second B-tree with the same leading key.
drop index if exists public.order_items_order_id_idx;

-- A retried checkout reuses its submission ID, so a timeout cannot create a
-- second order. Backfill existing rows before enforcing the unique key.
alter table public.orders add column submission_id uuid;
update public.orders
   set submission_id = gen_random_uuid()
 where submission_id is null;
alter table public.orders
  alter column submission_id set default gen_random_uuid(),
  alter column submission_id set not null;

create unique index orders_user_submission_id_idx
  on public.orders (user_id, submission_id);

create or replace function public.place_order(
  p_items jsonb,
  p_submission_id uuid
)
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
  v_order public.orders%rowtype;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;

  if not (select private.is_active_member()) then
    raise exception using errcode = '42501', message = 'active_member_required';
  end if;

  if p_submission_id is null then
    raise exception using errcode = '22023', message = 'invalid_submission_id';
  end if;

  select user_row.name, user_row.username
    into v_customer_name, v_customer_username
    from public.users as user_row
   where user_row.id = v_user_id and user_row.active
   for share;

  if not found then
    raise exception using errcode = '42501', message = 'active_member_required';
  end if;

  select order_row.*
    into v_order
    from public.orders as order_row
   where order_row.user_id = v_user_id
     and order_row.submission_id = p_submission_id
   for share;

  if found then
    return jsonb_build_object(
      'id', v_order.id,
      'status', v_order.status,
      'subtotal', v_order.subtotal,
      'created_at', v_order.created_at
    );
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
    user_id, submission_id, customer_name, customer_username, status, subtotal
  )
  values (
    v_user_id, p_submission_id, v_customer_name, v_customer_username,
    'placed', v_subtotal
  )
  on conflict (user_id, submission_id) do nothing
  returning id, created_at into v_order_id, v_created_at;

  if not found then
    select order_row.*
      into v_order
      from public.orders as order_row
     where order_row.user_id = v_user_id
       and order_row.submission_id = p_submission_id;

    return jsonb_build_object(
      'id', v_order.id,
      'status', v_order.status,
      'subtotal', v_order.subtotal,
      'created_at', v_order.created_at
    );
  end if;

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

revoke all on function public.place_order(jsonb, uuid)
  from public, anon, authenticated;
grant execute on function public.place_order(jsonb, uuid) to authenticated;

-- Remove the non-idempotent overload so clients cannot bypass the key.
revoke all on function public.place_order(jsonb) from public, anon, authenticated;
drop function public.place_order(jsonb);
