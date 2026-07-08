import { NextResponse } from "next/server";
import crypto from "crypto";
import { sql } from "@/lib/db";
import { getSession, requireRestaurant } from "@/lib/auth";

export const dynamic = "force-dynamic";

const newToken = () => crypto.randomBytes(9).toString("base64url"); // 12 caracteres

const migrationHint = (e) =>
  String(e?.message || "").includes("does not exist")
    ? " Falta la migración: visita /api/setup con tu contraseña de admin."
    : "";

// GET /api/portal/tables?rid=X — mesas del restaurante
export async function GET(req) {
  const s = getSession();
  if (!s) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const url = new URL(req.url);
  const rid = s.role === "admin" ? Number(url.searchParams.get("rid") || 0) : Number(s.rid);
  if (!rid || !requireRestaurant(rid))
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  try {
    const tables = await sql`SELECT id, label, token FROM tables WHERE restaurant_id = ${rid} ORDER BY label, id`;
    return NextResponse.json({ tables });
  } catch (e) {
    return NextResponse.json({ error: "No se pudieron cargar las mesas." + migrationHint(e) }, { status: 500 });
  }
}

// POST { rid, label } — añadir mesa
export async function POST(req) {
  const b = await req.json().catch(() => ({}));
  const rid = Number(b.rid);
  if (!rid || !requireRestaurant(rid))
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const label = String(b.label || "").trim().slice(0, 30);
  if (!label) return NextResponse.json({ error: "Pon un nombre o número de mesa." }, { status: 400 });
  try {
    const [table] = await sql`INSERT INTO tables (restaurant_id, label, token)
      VALUES (${rid}, ${label}, ${newToken()}) RETURNING id, label, token`;
    return NextResponse.json({ table });
  } catch (e) {
    return NextResponse.json({ error: "No se pudo añadir la mesa." + migrationHint(e) }, { status: 500 });
  }
}

// PATCH { id, action: "regenerate" } — token nuevo: los QR impresos antiguos dejan de valer
export async function PATCH(req) {
  const { id, action } = await req.json().catch(() => ({}));
  const [t] = await sql`SELECT id, restaurant_id FROM tables WHERE id = ${Number(id)}`;
  if (!t) return NextResponse.json({ error: "No existe" }, { status: 404 });
  if (!requireRestaurant(t.restaurant_id))
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  if (action !== "regenerate")
    return NextResponse.json({ error: "Acción no válida" }, { status: 400 });
  const [table] = await sql`UPDATE tables SET token = ${newToken()} WHERE id = ${t.id} RETURNING id, label, token`;
  return NextResponse.json({ table });
}

// DELETE /api/portal/tables?id=X — quitar mesa (los pedidos antiguos conservan su etiqueta)
export async function DELETE(req) {
  const id = Number(new URL(req.url).searchParams.get("id"));
  const [t] = await sql`SELECT id, restaurant_id FROM tables WHERE id = ${id}`;
  if (!t) return NextResponse.json({ error: "No existe" }, { status: 404 });
  if (!requireRestaurant(t.restaurant_id))
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  await sql`DELETE FROM tables WHERE id = ${id}`;
  return NextResponse.json({ ok: true });
}
