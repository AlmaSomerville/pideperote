import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";

// Página del repartidor: el token del enlace ES la autorización (no hay cuentas).
// El enlace caduca a las 24h de asignarse el pedido.
const TTL_MS = 24 * 60 * 60 * 1000;

function expired(o) {
  return !o.assigned_at || Date.now() - new Date(o.assigned_at).getTime() > TTL_MS;
}

// GET /api/reparto/[token] — datos del pedido para el repartidor
export async function GET(_req, { params }) {
  const [o] = await sql`SELECT o.id, o.code, o.status, o.customer_name, o.phone, o.address, o.notes,
      o.total_cents, o.paid_online, o.courier_name, o.assigned_at, o.picked_up_at, o.delivered_at,
      r.name AS restaurant_name
    FROM orders o JOIN restaurants r ON r.id = o.restaurant_id
    WHERE o.delivery_token = ${params.token}`;
  if (!o) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (expired(o)) return NextResponse.json({ error: "expired" }, { status: 410 });
  const items = await sql`SELECT name, qty, modifiers FROM order_items WHERE order_id = ${o.id}`;
  const { id, ...order } = o;
  return NextResponse.json({ order, items }, { headers: { "Cache-Control": "no-store" } });
}

// PATCH { action: "recogido" | "entregado" }
export async function PATCH(req, { params }) {
  const { action } = await req.json().catch(() => ({}));
  const [o] = await sql`SELECT id, status, assigned_at FROM orders WHERE delivery_token = ${params.token}`;
  if (!o) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (expired(o)) return NextResponse.json({ error: "expired" }, { status: 410 });

  if (action === "recogido" && ["nuevo", "aceptado", "listo"].includes(o.status)) {
    await sql`UPDATE orders SET status = 'en_camino', picked_up_at = NOW() WHERE id = ${o.id}`;
    return NextResponse.json({ ok: true, status: "en_camino" });
  }
  if (action === "entregado" && o.status === "en_camino") {
    await sql`UPDATE orders SET status = 'entregado', delivered_at = NOW() WHERE id = ${o.id}`;
    return NextResponse.json({ ok: true, status: "entregado" });
  }
  // Estado ya cambiado (doble toque, o el restaurante se adelantó): no es un error grave
  return NextResponse.json({ ok: false, status: o.status }, { status: 409 });
}
