import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { setSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req) {
  const { slug, password } = await req.json().catch(() => ({}));
  if (!slug || !password) return NextResponse.json({ error: "Faltan datos." }, { status: 400 });
  const [rest] = await sql`SELECT id, name, slug, portal_password FROM restaurants WHERE slug = ${slug.trim().toLowerCase()}`;
  if (!rest || !rest.portal_password || rest.portal_password !== password)
    return NextResponse.json({ error: "Restaurante o contraseña incorrectos." }, { status: 401 });
  setSession({ role: "restaurant", rid: rest.id });
  return NextResponse.json({ ok: true, restaurantId: rest.id, name: rest.name });
}
