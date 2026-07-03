import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!requireAdmin()) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const restaurants = await sql`SELECT r.*,
      (SELECT COUNT(*) FROM orders o WHERE o.restaurant_id = r.id AND o.created_at > NOW() - INTERVAL '30 days') AS orders_30d,
      (SELECT COALESCE(SUM(total_cents),0) FROM orders o WHERE o.restaurant_id = r.id AND o.created_at > NOW() - INTERVAL '30 days' AND o.status != 'rechazado') AS revenue_30d
    FROM restaurants r ORDER BY r.sort, r.name`;
  return NextResponse.json({ restaurants });
}

export async function POST(req) {
  if (!requireAdmin()) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const name = String(b.name || "").trim().slice(0, 100);
  if (!name) return NextResponse.json({ error: "Falta el nombre" }, { status: 400 });
  let slug = String(b.slug || name)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  const password = String(b.portalPassword || Math.random().toString(36).slice(2, 10));
  try {
    const [row] = await sql`INSERT INTO restaurants (slug, name, portal_password, whatsapp, color)
      VALUES (${slug}, ${name}, ${password}, ${String(b.whatsapp || "").trim().slice(0, 20)}, ${b.color || "#0E7268"})
      RETURNING *`;
    return NextResponse.json({ row });
  } catch (e) {
    if (String(e.message).includes("duplicate"))
      return NextResponse.json({ error: "Ya existe un restaurante con ese slug." }, { status: 400 });
    throw e;
  }
}

export async function PATCH(req) {
  if (!requireAdmin()) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const id = Number(b.id);
  if (!id) return NextResponse.json({ error: "Falta id" }, { status: 400 });
  if (b.action === "toggleActive") {
    await sql`UPDATE restaurants SET active = NOT active WHERE id = ${id}`;
    return NextResponse.json({ ok: true });
  }
  if (b.action === "delete") {
    await sql`DELETE FROM restaurants WHERE id = ${id}`;
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Acción desconocida" }, { status: 400 });
}
