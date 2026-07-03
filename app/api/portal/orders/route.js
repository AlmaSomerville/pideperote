import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getSession, requireRestaurant } from "@/lib/auth";

export const dynamic = "force-dynamic";

const VALID_STATUS = ["nuevo", "aceptado", "listo", "entregado", "rechazado"];

// GET /api/portal/orders?rid=X — pedidos de las últimas 48h
export async function GET(req) {
  const s = getSession();
  if (!s) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const url = new URL(req.url);
  const rid = s.role === "admin" ? Number(url.searchParams.get("rid") || 0) : Number(s.rid);

  let orders;
  if (s.role === "admin" && !rid) {
    orders = await sql`SELECT o.*, r.name AS restaurant_name FROM orders o
      JOIN restaurants r ON r.id = o.restaurant_id
      WHERE o.created_at > NOW() - INTERVAL '48 hours' ORDER BY o.created_at DESC LIMIT 200`;
  } else {
    if (!requireRestaurant(rid)) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    orders = await sql`SELECT * FROM orders WHERE restaurant_id = ${rid}
      AND created_at > NOW() - INTERVAL '48 hours' ORDER BY created_at DESC LIMIT 200`;
  }
  const ids = orders.map((o) => o.id);
  const items = ids.length
    ? await sql`SELECT order_id, name, qty, unit_price_cents, modifiers FROM order_items WHERE order_id = ANY(${ids})`
    : [];
  return NextResponse.json({
    orders: orders.map((o) => ({ ...o, items: items.filter((i) => i.order_id === o.id) })),
  });
}

// PATCH { orderId, status }
export async function PATCH(req) {
  const { orderId, status } = await req.json().catch(() => ({}));
  if (!VALID_STATUS.includes(status))
    return NextResponse.json({ error: "Estado no válido" }, { status: 400 });
  const [order] = await sql`SELECT id, restaurant_id FROM orders WHERE id = ${Number(orderId)}`;
  if (!order) return NextResponse.json({ error: "No existe" }, { status: 404 });
  if (!requireRestaurant(order.restaurant_id))
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  await sql`UPDATE orders SET status = ${status} WHERE id = ${order.id}`;
  return NextResponse.json({ ok: true });
}
