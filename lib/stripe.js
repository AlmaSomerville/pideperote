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
