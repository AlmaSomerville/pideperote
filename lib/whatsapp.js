// Envío de WhatsApp vía Meta Cloud API.
// Si no hay credenciales configuradas, no falla: el pedido sigue funcionando
// y el restaurante lo ve en su panel (que suena al llegar pedidos nuevos).
//
// Variables de entorno:
//   WHATSAPP_TOKEN     - token permanente de la app de Meta
//   WHATSAPP_PHONE_ID  - ID del número de teléfono (no el número en sí)
//   WHATSAPP_TEMPLATE  - (opcional) nombre de plantilla aprobada con 1 variable {{1}}
//
// Nota: Meta solo permite mensajes de texto libre dentro de una "ventana de 24h"
// (si el restaurante ha escrito al número en las últimas 24h). Para producción,
// crea una plantilla tipo "nuevo_pedido" y ponla en WHATSAPP_TEMPLATE.

export async function sendWhatsApp(to, body) {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_ID;
  const template = process.env.WHATSAPP_TEMPLATE;
  if (!token || !phoneId || !to) return { skipped: true };

  const clean = to.replace(/[^0-9]/g, "");
  const num = clean.length === 9 ? "34" + clean : clean; // España por defecto

  const payload = template
    ? {
        messaging_product: "whatsapp",
        to: num,
        type: "template",
        template: {
          name: template,
          language: { code: "es" },
          components: [{ type: "body", parameters: [{ type: "text", text: body.slice(0, 1000) }] }],
        },
      }
    : { messaging_product: "whatsapp", to: num, type: "text", text: { body } };

  try {
    const res = await fetch(`https://graph.facebook.com/v19.0/${phoneId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) console.error("WhatsApp error:", JSON.stringify(data));
    return { ok: res.ok, data };
  } catch (e) {
    console.error("WhatsApp fetch failed:", e.message);
    return { ok: false };
  }
}

export function orderMessage(order, items, feeCents) {
  const lines = items.map((it) => {
    const mods = it.modifiers ? `\n   · ${it.modifiers.split(" | ").join("\n   · ")}` : "";
    return `${it.qty}x ${it.name} — ${((it.unit_price_cents * it.qty) / 100).toFixed(2)}€${mods}`;
  });
  const fee = feeCents ? `\nReparto: ${(feeCents / 100).toFixed(2)}€` : "";
  return (
    `🛎️ NUEVO PEDIDO ${order.code}\n\n` +
    lines.join("\n") +
    fee +
    `\n\nTOTAL: ${(order.total_cents / 100).toFixed(2)}€ (efectivo)` +
    `\n\n${order.type === "reparto" ? "🛵 Reparto a: " + order.address : "🏃 Para recoger"}` +
    `\nCliente: ${order.customer_name}\nTel: ${order.phone}` +
    (order.notes ? `\nNotas: ${order.notes}` : "")
  );
}
