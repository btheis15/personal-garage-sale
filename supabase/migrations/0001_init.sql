-- Garage sale: items, orders, settings, and the Bitcoin Cash checkout's storage.
-- Run once in Supabase → SQL Editor (or `supabase db push`). Safe to read top to bottom.
--
-- Everything is read and written by the website's server with the service-role key, so
-- row-level security is on with no policies: the public (anon) key can't read or change anything.
-- Photos live in the public "photos" storage bucket created at the bottom.


-- ---------------------------------------------------------------------------
-- Items for sale
-- ---------------------------------------------------------------------------
create table if not exists items (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  description text not null default '',
  price_cents integer not null check (price_cents >= 0),
  -- "Was" price, shown struck through.
  compare_at_cents integer check (compare_at_cents is null or compare_at_cents >= 0),
  condition text not null default 'good' check (condition in ('new', 'like_new', 'good', 'fair', 'for_parts')),
  category text not null default 'other',
  -- [{ "path": "2026/10/abc.jpg", "width": 1600, "height": 1200 }], first = main photo
  photos jsonb not null default '[]'::jsonb,
  -- draft: only in the Sell app · live: in the shop · sold · hidden: off the shop, kept for records
  status text not null default 'live' check (status in ('draft', 'live', 'sold', 'hidden')),
  -- How many are left. Lowered while a checkout holds one, and for good once it's paid.
  quantity integer not null default 1 check (quantity >= 0),
  -- While a checkout is paying for the last ones: the shop shows "On hold" until then.
  held_until timestamptz,
  -- Price is firm, or "or best offer".
  obo boolean not null default false,
  pickup boolean not null default true,
  ships boolean not null default false,
  shipping_cents integer check (shipping_cents is null or shipping_cents >= 0),
  featured boolean not null default false,
  -- Where else it's listed: { "facebook": { "url": "...", "listedAt": "..." }, "ebay": { ... } }
  channels jsonb not null default '{}'::jsonb,
  -- Private notes (where it's stored, what you paid…), never shown in the shop.
  notes text not null default '',
  sold_at timestamptz,
  sold_via text,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists items_status_idx on items (status, published_at desc);

-- ---------------------------------------------------------------------------
-- Orders (website checkouts and in-person sales)
-- ---------------------------------------------------------------------------
create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  number bigint generated always as identity (start with 1001) unique,
  -- pending: waiting for payment (items held) · reserved: pay at pickup (items held) ·
  -- paid · completed: picked up / shipped · cancelled · expired
  status text not null default 'pending' check (status in ('pending', 'reserved', 'paid', 'completed', 'cancelled', 'expired')),
  -- How it's being paid: stripe · bch · cash · venmo · other. Null: the buyer hasn't picked yet (in-person QR).
  method text,
  -- web: the shop's checkout · in_person: rung up in the Sell app
  channel text not null default 'web' check (channel in ('web', 'in_person')),
  -- [{ "id": "<item uuid>", "title": "...", "priceCents": 1500, "qty": 1, "photo": "path" }]
  items jsonb not null,
  subtotal_cents integer not null,
  shipping_cents integer not null default 0,
  total_cents integer not null,
  fulfillment text not null default 'pickup' check (fulfillment in ('pickup', 'ship')),
  -- { "name", "email", "phone", "note", "address": {...} }
  customer jsonb not null default '{}'::jsonb,
  stripe_session_id text,
  stripe_payment_intent text,
  hold_until timestamptz,
  paid_at timestamptz,
  completed_at timestamptz,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists orders_status_idx on orders (status, created_at desc);
create index if not exists orders_stripe_idx on orders (stripe_session_id);

-- ---------------------------------------------------------------------------
-- Settings (site name, pickup area, payment instructions…), one JSON value per key
-- ---------------------------------------------------------------------------
create table if not exists settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Bitcoin Cash checkout storage (src/lib/bch-engine, the bch_cashtoken_checkout engine)
-- ---------------------------------------------------------------------------
create table if not exists bch_payments (
  id text primary key,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists bch_addresses (
  wallet text not null,
  index integer not null,
  address text not null,
  scripthash text not null,
  -- reserved: an order is showing it · used: paid to, never handed out again · free: can be reused
  state text not null check (state in ('reserved', 'used', 'free')),
  order_id text,
  reserved_at timestamptz,
  released_at timestamptz,
  primary key (wallet, index)
);
create index if not exists bch_addresses_scripthash_idx on bch_addresses (scripthash);
create index if not exists bch_addresses_order_idx on bch_addresses (order_id);
create table if not exists bch_meta (
  name text primary key,
  value jsonb not null
);

alter table items enable row level security;
alter table orders enable row level security;
alter table settings enable row level security;
alter table bch_payments enable row level security;
alter table bch_addresses enable row level security;
alter table bch_meta enable row level security;

-- ---------------------------------------------------------------------------
-- Holding items for a checkout, atomically (two buyers can never both get the last one)
-- ---------------------------------------------------------------------------

-- Gives back what unpaid orders past their hold were holding. Returns how many orders expired.
create or replace function expire_stale_orders() returns integer
language plpgsql security definer set search_path = public as $$
declare
  o record;
  n integer := 0;
begin
  for o in
    select id from orders
    where status in ('pending', 'reserved') and hold_until is not null and hold_until < now()
    for update skip locked
  loop
    perform release_order(o.id, 'expired');
    n := n + 1;
  end loop;
  return n;
end $$;

-- Creates an order and takes its items out of stock in one go. Raises 'unavailable:<item id>'
-- if any item isn't live or doesn't have enough left. lines: [{ "id": uuid, "qty": int }].
create or replace function place_order(
  p_lines jsonb,
  p_status text,
  p_method text,
  p_channel text,
  p_fulfillment text,
  p_customer jsonb,
  p_hold_minutes integer,
  -- Shipping for an item without its own price. One shipping charge per order: the highest.
  p_default_shipping_cents integer default 0
) returns orders
language plpgsql security definer set search_path = public as $$
declare
  line jsonb;
  it items;
  qty integer;
  snapshot jsonb := '[]'::jsonb;
  subtotal integer := 0;
  ship integer := 0;
  o orders;
  hold timestamptz := case when p_hold_minutes is null then null else now() + make_interval(mins => p_hold_minutes) end;
begin
  perform expire_stale_orders();
  if jsonb_array_length(p_lines) = 0 then raise exception 'empty'; end if;
  for line in select * from jsonb_array_elements(p_lines) loop
    qty := greatest(1, coalesce((line->>'qty')::integer, 1));
    select * into it from items where id = (line->>'id')::uuid for update;
    if not found or it.status <> 'live' or it.quantity < qty then
      raise exception 'unavailable:%', line->>'id';
    end if;
    if p_fulfillment = 'ship' and not it.ships then
      raise exception 'noship:%', it.id;
    end if;
    update items set
      quantity = quantity - qty,
      held_until = case when quantity - qty = 0 then hold else held_until end,
      updated_at = now()
    where id = it.id;
    snapshot := snapshot || jsonb_build_object(
      'id', it.id, 'slug', it.slug, 'title', it.title, 'priceCents', it.price_cents, 'qty', qty,
      'photo', it.photos->0->>'path'
    );
    subtotal := subtotal + it.price_cents * qty;
    if p_fulfillment = 'ship' then ship := greatest(ship, coalesce(it.shipping_cents, p_default_shipping_cents, 0)); end if;
  end loop;
  insert into orders (status, method, channel, items, subtotal_cents, shipping_cents, total_cents, fulfillment, customer, hold_until)
  values (p_status, p_method, p_channel, snapshot, subtotal, ship, subtotal + ship, p_fulfillment, coalesce(p_customer, '{}'::jsonb), hold)
  returning * into o;
  return o;
end $$;

-- Puts an unpaid order's items back and closes it (status: cancelled or expired).
-- Does nothing to an order that's already paid or closed. Returns true if it changed.
create or replace function release_order(p_order uuid, p_status text) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  o orders;
  line jsonb;
begin
  select * into o from orders where id = p_order for update;
  if not found or o.status not in ('pending', 'reserved') then return false; end if;
  for line in select * from jsonb_array_elements(o.items) loop
    update items set
      quantity = quantity + greatest(1, coalesce((line->>'qty')::integer, 1)),
      held_until = null,
      updated_at = now()
    where id = (line->>'id')::uuid and status = 'live';
  end loop;
  update orders set status = p_status, updated_at = now() where id = p_order;
  return true;
end $$;

-- Marks an order paid (once). Items with none left become sold. Returns the order if this call
-- changed it, or null if it was already paid (so emails go out once).
create or replace function mark_order_paid(p_order uuid, p_method text, p_payment_intent text) returns orders
language plpgsql security definer set search_path = public as $$
declare
  o orders;
  line jsonb;
  qty integer;
begin
  select * into o from orders where id = p_order for update;
  if not found or o.status in ('paid', 'completed') then return null; end if;
  -- Paid after it expired or was cancelled: the items went back, so take them out again
  -- (quantity can't go below zero; the Sell app flags the order to check).
  if o.status in ('cancelled', 'expired') then
    for line in select * from jsonb_array_elements(o.items) loop
      qty := greatest(1, coalesce((line->>'qty')::integer, 1));
      update items set quantity = greatest(0, quantity - qty), updated_at = now() where id = (line->>'id')::uuid;
    end loop;
    o.notes := trim(o.notes || E'\nPaid after the hold ran out: check the items are still here.');
  end if;
  for line in select * from jsonb_array_elements(o.items) loop
    update items set
      status = case when quantity = 0 then 'sold' else status end,
      sold_at = case when quantity = 0 then now() else sold_at end,
      sold_via = case when quantity = 0 then coalesce(p_method, o.method) else sold_via end,
      held_until = null,
      updated_at = now()
    where id = (line->>'id')::uuid;
  end loop;
  update orders set
    status = 'paid',
    method = coalesce(p_method, method),
    stripe_payment_intent = coalesce(p_payment_intent, stripe_payment_intent),
    paid_at = now(),
    hold_until = null,
    notes = o.notes,
    updated_at = now()
  where id = p_order
  returning * into o;
  return o;
end $$;

-- ---------------------------------------------------------------------------
-- Bitcoin Cash: claiming a receiving address for an order, atomically
-- ---------------------------------------------------------------------------

-- The lowest-numbered free address released before p_reuse_before (or never shown).
-- Returns the row plus the order that had it before, or nothing.
create or replace function bch_claim_free_address(p_wallet text, p_order text, p_reuse_before timestamptz, p_at timestamptz)
returns table (wallet text, index integer, address text, scripthash text, state text, order_id text, reserved_at timestamptz, released_at timestamptz, previous_order_id text, previous_released_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare
  a bch_addresses;
begin
  select * into a from bch_addresses b
  where b.wallet = p_wallet and b.state = 'free' and (b.released_at is null or b.released_at < p_reuse_before)
  order by b.index limit 1 for update skip locked;
  if not found then return; end if;
  update bch_addresses b set state = 'reserved', order_id = p_order, reserved_at = p_at, released_at = null
  where b.wallet = a.wallet and b.index = a.index;
  return query select a.wallet, a.index, a.address, a.scripthash, 'reserved'::text, p_order, p_at, null::timestamptz, a.order_id, a.released_at;
end $$;

-- The next new index for the wallet, reserved for the order (the address is filled in by the caller).
create or replace function bch_claim_new_index(p_wallet text, p_order text, p_at timestamptz) returns integer
language plpgsql security definer set search_path = public as $$
declare
  i integer;
begin
  perform pg_advisory_xact_lock(hashtext('bch_addresses:' || p_wallet));
  select coalesce(max(b.index) + 1, 0) into i from bch_addresses b where b.wallet = p_wallet;
  insert into bch_addresses (wallet, index, address, scripthash, state, order_id, reserved_at)
  values (p_wallet, i, '', '', 'reserved', p_order, p_at);
  return i;
end $$;

-- Nobody but the server (service role) calls these.
revoke execute on function expire_stale_orders() from public, anon, authenticated;
revoke execute on function place_order(jsonb, text, text, text, text, jsonb, integer, integer) from public, anon, authenticated;
revoke execute on function release_order(uuid, text) from public, anon, authenticated;
revoke execute on function mark_order_paid(uuid, text, text) from public, anon, authenticated;
revoke execute on function bch_claim_free_address(text, text, timestamptz, timestamptz) from public, anon, authenticated;
revoke execute on function bch_claim_new_index(text, text, timestamptz) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Photos: a public bucket (anyone can view a photo; only the server can upload)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', true, 15728640, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
