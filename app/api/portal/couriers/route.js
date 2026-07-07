import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getSession, requireRestaurant } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET /api/portal/couriers?rid=X — repartidores del restaurante
export async function GET(req) {
  const s = getSession();
  if (!s) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const url = new URL(req.url);
  const rid = s.role === "admin" ? Number(url.searchParams.get("rid") || 0) : Number(s.rid);
  if (!rid || !requireRestaurant(rid))
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const couriers = await sql`SELECT id, name, phone FROM couriers WHERE restaurant_id = ${rid} ORDER BY id`;
  return NextResponse.json({ couriers });
}

// POST { rid, name, phone } — añadir repartidor
export async function POST(req) {
  const b = await req.json().catch(() => ({}));
  const rid = Number(b.rid);
  if (!rid || !requireRestaurant(rid))
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const name = String(b.name || "").trim().slice(0, 60);
  const phone = String(b.phone || "").replace(/[^0-9+]/g, "").slice(0, 20);
  if (!name || phone.replace(/\D/g, "").length < 9)
    return NextResponse.json({ error: "Pon un nombre y un teléfono válido (9 dígitos)." }, { status: 400 });
  const [courier] = await sql`INSERT INTO couriers (restaurant_id, name, phone)
    VALUES (${rid}, ${name}, ${phone}) RETURNING id, name, phone`;
  return NextResponse.json({ courier });
}

// DELETE /api/portal/couriers?id=X — quitar repartidor (los pedidos antiguos conservan su nombre)
export async function DELETE(req) {
  const id = Number(new URL(req.url).searchParams.get("id"));
  const [c] = await sql`SELECT id, restaurant_id FROM couriers WHERE id = ${id}`;
  if (!c) return NextResponse.json({ error: "No existe" }, { status: 404 });
  if (!requireRestaurant(c.restaurant_id))
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  await sql`DELETE FROM couriers WHERE id = ${id}`;
  return NextResponse.json({ ok: true });
}
