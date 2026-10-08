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

-- "Spread the word": people who share the sale for a commission on Bitcoin Cash sales (src/partners.js).
create table if not exists partners (
  id text primary key,
  code text not null unique,
  name text not null,
  address text not null,
  email text,
  key_hash text not null,
  country text not null,
  us_person integer not null,
  mailing_address text not null,
  terms_version text not null,
  terms_accepted_at text not null,
  -- active · paused (their link stops earning) · removed
  status text not null default 'active',
  -- Their own rate; null: the shop's (Settings).
  rate_percent real,
  created_at text not null,
  updated_at text not null
);
create index if not exists partners_key_idx on partners (key_hash);

-- One per order through a partner's link, once it's paid.
create table if not exists commissions (
  order_id text primary key,
  partner_id text not null,
  order_number integer not null,
  rate_percent real,
  base_cents integer,
  cents integer,
  -- pending · sent · cancelled
  state text not null,
  -- split (in the buyer's own payment) · wallet (from the hot wallet)
  how text,
  sats integer,
  txid text,
  note text,
  created_at text not null,
  updated_at text not null,
  sent_at text
);
create index if not exists commissions_partner_idx on commissions (partner_id, created_at);
`;

// Columns added after the first version (SQLite has no "add column if not exists").
const LATER_COLUMNS = [
  ["orders", "partner_id", "text"],
  ["orders", "receipt_pref", "text"],
];

export function openDb(file = ":memory:") {
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  db.exec(SCHEMA);
  for (const [table, column, type] of LATER_COLUMNS) {
    const has = db.prepare(`select 1 from pragma_table_info('${table}') where name = ?`).get(column);
    if (!has) db.exec(`alter table ${table} add column ${column} ${type}`);
  }
  return db;
}
