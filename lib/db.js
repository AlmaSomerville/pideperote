import { neon } from "@neondatabase/serverless";

let _sql = null;
export function sql(...args) {
  if (!_sql) {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL no está configurada");
    _sql = neon(process.env.DATABASE_URL);
  }
  return _sql(...args);
}

export async function createSchema() {
  await sql`CREATE TABLE IF NOT EXISTS restaurants (
    id SERIAL PRIMARY KEY,
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    whatsapp TEXT DEFAULT '',
    logo TEXT DEFAULT '',
    color TEXT DEFAULT '#0E7268',
    is_open BOOLEAN DEFAULT TRUE,
    hours TEXT DEFAULT '',
    sort INT DEFAULT 0,
    active BOOLEAN DEFAULT TRUE,
    portal_password TEXT DEFAULT '',
    delivery BOOLEAN DEFAULT TRUE,
    pickup BOOLEAN DEFAULT TRUE,
    delivery_fee_cents INT DEFAULT 0,
    min_order_cents INT DEFAULT 0,
    schedule TEXT DEFAULT '',
    cover TEXT DEFAULT '',
    max_orders_per_hour INT DEFAULT 0
  )`;
  // Migraciones para bases de datos ya creadas (se pueden ejecutar siempre)
  await sql`ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS schedule TEXT DEFAULT ''`;
  await sql`ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS cover TEXT DEFAULT ''`;
  await sql`ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS max_orders_per_hour INT DEFAULT 0`;
  await sql`CREATE TABLE IF NOT EXISTS categories (
    id SERIAL PRIMARY KEY,
    restaurant_id INT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    sort INT DEFAULT 0
  )`;
  await sql`CREATE TABLE IF NOT EXISTS items (
    id SERIAL PRIMARY KEY,
    restaurant_id INT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    category_id INT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    price_cents INT NOT NULL DEFAULT 0,
    available BOOLEAN DEFAULT TRUE,
    sort INT DEFAULT 0
  )`;
  await sql`CREATE TABLE IF NOT EXISTS modifier_groups (
    id SERIAL PRIMARY KEY,
    item_id INT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    min_select INT DEFAULT 0,
    max_select INT DEFAULT 1,
    sort INT DEFAULT 0
  )`;
  await sql`CREATE TABLE IF NOT EXISTS modifier_options (
    id SERIAL PRIMARY KEY,
    group_id INT NOT NULL REFERENCES modifier_groups(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    price_delta_cents INT DEFAULT 0,
    sort INT DEFAULT 0
  )`;
  await sql`CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    restaurant_id INT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    customer_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    address TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    type TEXT DEFAULT 'reparto',
    status TEXT DEFAULT 'nuevo',
    total_cents INT NOT NULL DEFAULT 0,
    delivery_fee_cents INT DEFAULT 0,
    scheduled_for TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`;
  // Migraciones de orders (después de crear la tabla, para que /api/setup funcione también en BD nuevas)
  await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMPTZ`;
  await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS courier_id INT`;
  await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS courier_name TEXT DEFAULT ''`;
  await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_token TEXT`;
  await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ`;
  await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS picked_up_at TIMESTAMPTZ`;
  await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_token ON orders(delivery_token)`;
  // Repartidores de cada restaurante (nombre + WhatsApp)
  await sql`CREATE TABLE IF NOT EXISTS couriers (
    id SERIAL PRIMARY KEY,
    restaurant_id INT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`;
  // Mesas: cada una con un token secreto que va dentro de su QR impreso.
  // Regenerar el token invalida los QR antiguos de esa mesa.
  await sql`CREATE TABLE IF NOT EXISTS tables (
    id SERIAL PRIMARY KEY,
    restaurant_id INT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    label TEXT NOT NULL,
    token TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`;
  await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS table_id INT`;
  await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS table_label TEXT DEFAULT ''`;
  await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ`;
  await sql`CREATE TABLE IF NOT EXISTS order_items (
    id SERIAL PRIMARY KEY,
    order_id INT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    qty INT NOT NULL DEFAULT 1,
    unit_price_cents INT NOT NULL DEFAULT 0,
    modifiers TEXT DEFAULT ''
  )`;
  await sql`CREATE INDEX IF NOT EXISTS idx_orders_rest ON orders(restaurant_id, created_at DESC)`;
}

export async function seedDemo() {
  const existing = await sql`SELECT id FROM restaurants LIMIT 1`;
  if (existing.length) return false;
  const [r] = await sql`INSERT INTO restaurants (slug, name, color, portal_password, hours)
    VALUES ('bar-ejemplo', 'Bar Ejemplo', '#0E7268', 'ejemplo123', 'Ma-Do 12:00-16:00, 19:00-23:30')
    RETURNING id`;
  const [c1] = await sql`INSERT INTO categories (restaurant_id, name, sort) VALUES (${r.id}, 'Hamburguesas', 0) RETURNING id`;
  const [c2] = await sql`INSERT INTO categories (restaurant_id, name, sort) VALUES (${r.id}, 'Bebidas', 1) RETURNING id`;
  const [i1] = await sql`INSERT INTO items (restaurant_id, category_id, name, description, price_cents, sort)
    VALUES (${r.id}, ${c1.id}, 'Hamburguesa clásica', 'Ternera, lechuga, tomate y cebolla', 650, 0) RETURNING id`;
  await sql`INSERT INTO items (restaurant_id, category_id, name, description, price_cents, sort)
    VALUES (${r.id}, ${c2.id}, 'Coca-Cola 33cl', '', 180, 0)`;
  const [g1] = await sql`INSERT INTO modifier_groups (item_id, name, min_select, max_select, sort)
    VALUES (${i1.id}, 'Salsas', 0, 3, 0) RETURNING id`;
  await sql`INSERT INTO modifier_options (group_id, name, price_delta_cents, sort) VALUES
    (${g1.id}, 'Ketchup', 0, 0), (${g1.id}, 'Mayonesa', 0, 1), (${g1.id}, 'Salsa BBQ', 50, 2)`;
  const [g2] = await sql`INSERT INTO modifier_groups (item_id, name, min_select, max_select, sort)
    VALUES (${i1.id}, 'Extras', 0, 5, 1) RETURNING id`;
  await sql`INSERT INTO modifier_options (group_id, name, price_delta_cents, sort) VALUES
    (${g2.id}, 'Queso', 60, 0), (${g2.id}, 'Bacon', 90, 1), (${g2.id}, 'Huevo', 80, 2)`;
  return true;
}

export function euros(cents) {
  return (cents / 100).toFixed(2).replace(".", ",") + " €";
}
