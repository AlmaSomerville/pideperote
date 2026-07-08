import Stripe from "stripe";

// Cliente de Stripe (plataforma). La clave vive SOLO en variables de entorno.
let _stripe = null;
export function stripe() {
  if (!_stripe) {
    if (!process.env.STRIPE_SECRET_KEY) throw new Error("STRIPE_SECRET_KEY no está configurada");
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  }
  return _stripe;
}

// ¿Puede este restaurante cobrar online? Cuenta conectada + verificada + interruptor del bar
export function onlineOk(rest) {
  return !!(rest?.stripe_account_id && rest?.stripe_charges_enabled && rest?.online_payments);
}

// Comisión de PidePerote para un importe dado (nunca mayor que el propio importe)
export function commissionCents(rest, totalCents) {
  const fee =
    Math.round((totalCents * (rest.commission_bps || 0)) / 10000) +
    (rest.commission_fixed_cents || 0);
  return Math.max(0, Math.min(totalCents, fee));
}

// Sesión de Stripe Checkout como CARGO DIRECTO en la cuenta del bar:
// el bar es el comercio (su nombre en el extracto, sus comisiones de Stripe)
// y PidePerote cobra su comisión como application fee.
export async function createCheckout({ rest, amountCents, productName, metadata, successUrl, cancelUrl }) {
  const fee = commissionCents(rest, amountCents);
  return stripe().checkout.sessions.create(
    {
      mode: "payment",
      locale: "es",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "eur",
            unit_amount: amountCents,
            product_data: { name: productName },
          },
        },
      ],
      payment_intent_data: {
        ...(fee > 0 ? { application_fee_amount: fee } : {}),
        metadata,
      },
      metadata,
      success_url: successUrl,
      cancel_url: cancelUrl,
    },
    { stripeAccount: rest.stripe_account_id }
  );
}

// Devuelve el dinero de un pedido pagado online (o el importe de una ronda dentro
// de una cuenta de mesa ya pagada — devolución parcial). Devuelve también la
// comisión de PidePerote: no cobramos por ventas que no ocurrieron.
export async function refundOrder(rest, order, amountCents) {
  const session = await stripe().checkout.sessions.retrieve(order.stripe_session_id, {
    expand: ["payment_intent"],
    stripeAccount: rest.stripe_account_id,
  });
  const pi = session?.payment_intent;
  if (!pi) throw new Error("No se encontró el pago original.");
  // Solo se puede devolver la application fee si el pago la tuvo (comisión > 0 en su momento).
  // Con comisión 0, pedir refund_application_fee haría fallar TODA la devolución.
  const hasFee = typeof pi === "object" && !!pi.application_fee_amount;
  return stripe().refunds.create(
    {
      payment_intent: typeof pi === "string" ? pi : pi.id,
      amount: amountCents,
      ...(hasFee ? { refund_application_fee: true } : {}),
      metadata: { order_code: order.code },
    },
    { stripeAccount: rest.stripe_account_id }
  );
}
