import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(_req, { params }) {
  const [order] = await sql`SELECT o.code, o.status, o.type, o.total_cents, o.created_at, o.scheduled_for, r.name AS restaurant_name, r.color
    FROM orders o JOIN restaurants r ON r.id = o.restaurant_id WHERE o.code = ${params.code}`;
  if (!order) return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 });
  const items = await sql`SELECT oi.name, oi.qty, oi.unit_price_cents, oi.modifiers FROM order_items oi
    JOIN orders o ON o.id = oi.order_id WHERE o.code = ${params.code}`;
  return NextResponse.json({ order, items }, { headers: { "Cache-Control": "no-store" } });
}
