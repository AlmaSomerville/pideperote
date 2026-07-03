import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireRestaurant, requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

// PATCH { rid, ...campos } — ajustes del restaurante.
// El logo llega como data URL (base64) y se guarda en la BD; límite 200KB.
export async function PATCH(req) {
  const b = await req.json().catch(() => ({}));
  const rid = Number(b.rid);
  if (!rid || !requireRestaurant(rid))
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const [cur] = await sql`SELECT * FROM restaurants WHERE id = ${rid}`;
  if (!cur) return NextResponse.json({ error: "No existe" }, { status: 404 });

  const t = (v, fallback, max = 200) => (v === undefined ? fallback : String(v).trim().slice(0, max));
  const bool = (v, fallback) => (v === undefined ? fallback : !!v);
  const cents = (v, fallback) => (v === undefined ? fallback : Math.max(0, Math.round(Number(v) || 0)));

  let logo = cur.logo;
  if (b.logo !== undefined) {
    const l = String(b.logo);
    if (l && !l.startsWith("data:image/"))
      return NextResponse.json({ error: "Logo no válido" }, { status: 400 });
    if (l.length > 280000)
      return NextResponse.json({ error: "Logo demasiado grande (máx ~200KB). Usa una imagen más pequeña." }, { status: 400 });
    logo = l;
  }

  let color = t(b.color, cur.color, 9);
  if (!/^#[0-9a-fA-F]{3,8}$/.test(color)) color = cur.color;

  // Solo el admin puede cambiar la contraseña del portal y el WhatsApp
  const isAdmin = !!requireAdmin();
  const portalPassword = isAdmin ? t(b.portalPassword, cur.portal_password, 100) : cur.portal_password;
  const whatsapp = isAdmin ? t(b.whatsapp, cur.whatsapp, 20) : cur.whatsapp;

  await sql`UPDATE restaurants SET
    name = ${t(b.name, cur.name)},
    logo = ${logo},
    color = ${color},
    hours = ${t(b.hours, cur.hours)},
    is_open = ${bool(b.isOpen, cur.is_open)},
    delivery = ${bool(b.delivery, cur.delivery)},
    pickup = ${bool(b.pickup, cur.pickup)},
    delivery_fee_cents = ${cents(b.deliveryFeeCents, cur.delivery_fee_cents)},
    min_order_cents = ${cents(b.minOrderCents, cur.min_order_cents)},
    whatsapp = ${whatsapp},
    portal_password = ${portalPassword}
    WHERE id = ${rid}`;
  return NextResponse.json({ ok: true });
}
