import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { stripe } from "@/lib/stripe";

export const dynamic = "force-dynamic";

// Enlace de alta ESTABLE para enviar por WhatsApp al dueño del bar.
// Los "account links" de Stripe caducan en minutos, así que esta ruta genera
// uno fresco en cada visita y redirige. Al terminar, Stripe vuelve aquí con
// ?done=1 y actualizamos el estado del bar.

const page = (title, body) => new Response(
  `<!doctype html><html lang="es"><head><meta charset="utf-8">
   <meta name="viewport" content="width=device-width,initial-scale=1">
   <meta name="robots" content="noindex"><title>${title} — PidePerote</title>
   <style>body{font-family:system-ui,sans-serif;background:#f3fafa;color:#0e2e2e;display:grid;place-items:center;min-height:100vh;margin:0;padding:20px;text-align:center}
   .box{background:#fff;border:1.5px solid #d2e9e9;border-radius:14px;padding:28px;max-width:420px}
   h1{font-size:22px;margin:0 0 10px}p{color:#4f7f7f;line-height:1.5;margin:0}</style></head>
   <body><div class="box"><h1>${title}</h1><p>${body}</p></div></body></html>`,
  { headers: { "Content-Type": "text/html; charset=utf-8" } }
);

export async function GET(req, { params }) {
  const [r] = await sql`SELECT id, name, stripe_account_id FROM restaurants
    WHERE stripe_onboard_token = ${params.token}`;
  if (!r || !r.stripe_account_id)
    return page("Enlace no válido", "Este enlace de alta ya no vale. Pide uno nuevo a PidePerote.");

  const url = new URL(req.url);

  if (url.searchParams.get("done")) {
    // Vuelta desde Stripe: refrescar el estado del bar
    try {
      const account = await stripe().accounts.retrieve(r.stripe_account_id);
      const enabled = !!(account.charges_enabled && account.details_submitted);
      await sql`UPDATE restaurants SET stripe_charges_enabled = ${enabled} WHERE id = ${r.id}`;
      return page(
        enabled ? "¡Todo listo! ✅" : "Datos enviados ✅",
        enabled
          ? `${r.name} ya puede cobrar online. Activa el interruptor «Pagos online» en tu portal (Ajustes) y a rodar.`
          : "Stripe está verificando los datos (suele tardar poco). En cuanto termine, podrás activar los pagos online en tu portal."
      );
    } catch (e) {
      console.error("conectar done error:", e.message);
      return page("Datos enviados", "Si Stripe te pidió algo más, vuelve a abrir este mismo enlace.");
    }
  }

  try {
    const link = await stripe().accountLinks.create({
      account: r.stripe_account_id,
      type: "account_onboarding",
      refresh_url: `${url.origin}/conectar/${params.token}`,
      return_url: `${url.origin}/conectar/${params.token}?done=1`,
    });
    return NextResponse.redirect(link.url, 303);
  } catch (e) {
    console.error("conectar error:", e.message);
    return page("Uy, algo falló", "No se pudo abrir el alta de Stripe ahora mismo. Prueba otra vez en un minuto.");
  }
}
