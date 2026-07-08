import { NextResponse } from "next/server";
import crypto from "crypto";
import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { stripe } from "@/lib/stripe";

export const dynamic = "force-dynamic";

// POST { id, action } — gestión de Stripe Connect por restaurante (solo admin).
// Acciones:
//  - "connect": crea la cuenta Express (si no existe) y devuelve el enlace de alta estable
//  - "link":    devuelve el enlace de alta estable (para reenviar al bar)
//  - "status":  consulta Stripe y actualiza si la cuenta ya puede cobrar
export async function POST(req) {
  if (!requireAdmin()) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const { id, action } = await req.json().catch(() => ({}));
  const [r] = await sql`SELECT * FROM restaurants WHERE id = ${Number(id)}`;
  if (!r) return NextResponse.json({ error: "No existe" }, { status: 404 });
  const origin = new URL(req.url).origin;

  try {
    if (action === "connect") {
      let accountId = r.stripe_account_id;
      if (!accountId) {
        const account = await stripe().accounts.create({
          type: "express",
          country: "ES",
          business_profile: { name: r.name },
          capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
          metadata: { restaurant_id: String(r.id), platform: "pideperote" },
        });
        accountId = account.id;
      }
      const token = r.stripe_onboard_token || crypto.randomBytes(12).toString("base64url");
      await sql`UPDATE restaurants SET stripe_account_id = ${accountId}, stripe_onboard_token = ${token}
        WHERE id = ${r.id}`;
      return NextResponse.json({ ok: true, url: `${origin}/conectar/${token}` });
    }

    if (action === "link") {
      if (!r.stripe_account_id)
        return NextResponse.json({ error: "Este bar aún no tiene cuenta de Stripe. Dale a Conectar." }, { status: 400 });
      let token = r.stripe_onboard_token;
      if (!token) {
        token = crypto.randomBytes(12).toString("base64url");
        await sql`UPDATE restaurants SET stripe_onboard_token = ${token} WHERE id = ${r.id}`;
      }
      return NextResponse.json({ ok: true, url: `${origin}/conectar/${token}` });
    }

    if (action === "status") {
      if (!r.stripe_account_id)
        return NextResponse.json({ error: "Sin cuenta de Stripe todavía." }, { status: 400 });
      const account = await stripe().accounts.retrieve(r.stripe_account_id);
      const enabled = !!(account.charges_enabled && account.details_submitted);
      await sql`UPDATE restaurants SET stripe_charges_enabled = ${enabled} WHERE id = ${r.id}`;
      return NextResponse.json({
        ok: true,
        charges_enabled: enabled,
        details_submitted: !!account.details_submitted,
        payouts_enabled: !!account.payouts_enabled,
      });
    }

    return NextResponse.json({ error: "Acción desconocida" }, { status: 400 });
  } catch (e) {
    console.error("stripe admin error:", e.message);
    const hint = String(e.message).includes("STRIPE_SECRET_KEY")
      ? "Falta STRIPE_SECRET_KEY en las variables de entorno de Vercel."
      : e.message;
    return NextResponse.json({ error: hint }, { status: 500 });
  }
}
