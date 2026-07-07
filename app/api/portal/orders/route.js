import { NextResponse } from "next/server";
import crypto from "crypto";
import { sql } from "@/lib/db";
import { getSession, requireRestaurant } from "@/lib/auth";

export const dynamic = "force-dynamic";

const VALID_STATUS = ["nuevo", "aceptado", "listo", "en_camino", "entregado", "rechazado"];

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
    // Activos arriba (más recientes primero); entregados/rechazados se van al fondo
    orders = await sql`SELECT * FROM orders WHERE restaurant_id = ${rid}
      AND created_at > NOW() - INTERVAL '48 hours'
      ORDER BY (status IN ('entregado', 'rechazado')), created_at DESC LIMIT 200`;
  }
  const ids = orders.map((o) => o.id);
  const items = ids.length
    ? await sql`SELECT order_id, name, qty, unit_price_cents, modifiers FROM order_items WHERE order_id = ANY(${ids})`
    : [];
  return NextResponse.json(
    { orders: orders.map((o) => ({ ...o, items: items.filter((i) => i.order_id === o.id) })) },
    { headers: { "Cache-Control": "no-store" } }
  );
}

// POST { orderId, courierId } — asignar repartidor y generar enlace de entrega.
// Devuelve { token, courier } para que el portal abra WhatsApp con el enlace.
// Reasignar genera un token nuevo (el enlace del repartidor anterior deja de valer).
export async function POST(req) {
  const { orderId, courierId } = await req.json().catch(() => ({}));
  const [order] = await sql`SELECT id, restaurant_id, status, type FROM orders WHERE id = ${Number(orderId)}`;
  if (!order) return NextResponse.json({ error: "No existe" }, { status: 404 });
  if (!requireRestaurant(order.restaurant_id))
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  if (order.type !== "reparto")
    return NextResponse.json({ error: "Este pedido es para recoger en local." }, { status: 400 });
  if (order.status === "entregado" || order.status === "rechazado")
    return NextResponse.json({ error: "El pedido ya está cerrado." }, { status: 400 });
  const [courier] = await sql`SELECT id, name, phone FROM couriers
    WHERE id = ${Number(courierId)} AND restaurant_id = ${order.restaurant_id}`;
  if (!courier) return NextResponse.json({ error: "Repartidor no encontrado." }, { status: 404 });

  const token = crypto.randomBytes(12).toString("base64url");
  await sql`UPDATE orders SET courier_id = ${courier.id}, courier_name = ${courier.name},
    delivery_token = ${token}, assigned_at = NOW() WHERE id = ${order.id}`;
  return NextResponse.json({ token, courier: { id: courier.id, name: courier.name, phone: courier.phone } });
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
