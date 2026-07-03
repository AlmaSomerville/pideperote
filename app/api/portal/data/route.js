import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET /api/portal/data?rid=X  — devuelve restaurante + menú completo.
// Un restaurante solo ve el suyo; el admin puede pasar cualquier rid.
export async function GET(req) {
  const s = getSession();
  if (!s) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const url = new URL(req.url);
  const rid = s.role === "admin" ? Number(url.searchParams.get("rid")) : Number(s.rid);
  if (!rid) return NextResponse.json({ error: "Falta rid" }, { status: 400 });
  if (s.role !== "admin" && rid !== Number(s.rid))
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const [restaurant] = await sql`SELECT * FROM restaurants WHERE id = ${rid}`;
  if (!restaurant) return NextResponse.json({ error: "No existe" }, { status: 404 });
  if (s.role !== "admin") delete restaurant.portal_password;

  const categories = await sql`SELECT id, name, sort FROM categories WHERE restaurant_id = ${rid} ORDER BY sort, id`;
  const items = await sql`SELECT id, category_id, name, description, price_cents, available, sort
    FROM items WHERE restaurant_id = ${rid} ORDER BY sort, id`;
  const itemIds = items.map((i) => i.id);
  const groups = itemIds.length
    ? await sql`SELECT id, item_id, name, min_select, max_select, sort FROM modifier_groups WHERE item_id = ANY(${itemIds}) ORDER BY sort, id`
    : [];
  const gids = groups.map((g) => g.id);
  const options = gids.length
    ? await sql`SELECT id, group_id, name, price_delta_cents, sort FROM modifier_options WHERE group_id = ANY(${gids}) ORDER BY sort, id`
    : [];

  return NextResponse.json({ role: s.role, restaurant, categories, items, groups, options });
}
