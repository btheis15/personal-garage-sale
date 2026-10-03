/**
 * The database: one SQLite file (data/garage.db). Opened once by the server; every change that has
 * to happen all at once (holding items for a checkout, marking an order paid) runs in a transaction,
 * and the server is the only process writing, so two checkouts can never both get the last one.
 */
import Database from "better-sqlite3";

const SCHEMA = `
create table if not exists items (
  id text primary key,
  slug text not null unique,
  title text not null,
  description text not null default '',
  price_cents integer not null check (price_cents >= 0),
  compare_at_cents integer,
  condition text not null default 'good',
  category text not null default 'other',
  size text not null default '',
  brand text not null default '',
  -- [{ "id": "<media id>", "width": 1600, "height": 1200, "maxWidth": 1600 }], first = main photo
  photos text not null default '[]',
  -- draft: only in the Sell app · live: in the shop · sold · hidden: off the shop, kept for records
  status text not null default 'live' check (status in ('draft', 'live', 'sold', 'hidden')),
  quantity integer not null default 1 check (quantity >= 0),
  held_until text,
  obo integer not null default 0,
  pickup integer not null default 1,
  ships integer not null default 0,
  shipping_cents integer,
  featured integer not null default 0,
  channels text not null default '{}',
  notes text not null default '',
  sold_at text,
  sold_via text,
  published_at text,
  created_at text not null,
  updated_at text not null
);
create index if not exists items_status_idx on items (status, published_at);

create table if not exists orders (
  id text primary key,
  number integer not null unique,
  -- pending: being paid (items held) · reserved: pay at pickup (items held) · paid · completed · cancelled · expired
  status text not null,
  method text,
  channel text not null default 'web',
  items text not null,
  subtotal_cents integer not null,
  shipping_cents integer not null default 0,
  total_cents integer not null,
  fulfillment text not null default 'pickup',
  customer text not null default '{}',
  stripe_session_id text,
  stripe_payment_intent text,
  hold_until text,
  paid_at text,
  completed_at text,
  notes text not null default '',
  created_at text not null,
  updated_at text not null
);
create index if not exists orders_status_idx on orders (status, created_at);
create index if not exists orders_stripe_idx on orders (stripe_session_id);

create table if not exists settings (
  key text primary key,
  value text not null
);

-- The Bitcoin Cash engine's storage (src/bch-engine).
create table if not exists bch_payments (
  id text primary key,
  data text not null,
  created_at text not null
);
create table if not exists bch_addresses (
  wallet text not null,
  idx integer not null,
  address text not null,
  scripthash text not null,
  state text not null,
  order_id text,
  reserved_at text,
  released_at text,
  primary key (wallet, idx)
);
create index if not exists bch_addresses_scripthash_idx on bch_addresses (scripthash);
create index if not exists bch_addresses_order_idx on bch_addresses (order_id);
create table if not exists bch_meta (
  name text primary key,
  value text not null
);
`;

export function openDb(file = ":memory:") {
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  db.exec(SCHEMA);
  return db;
}
