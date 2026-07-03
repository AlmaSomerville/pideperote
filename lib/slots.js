import { sql } from "@/lib/db";
import { isOpenAtDate, effectiveOpen, madridParts } from "@/lib/hours";

export const SLOT_MS = 30 * 60 * 1000;
const BUFFER_MS = 25 * 60 * 1000; // margen mínimo para preparar
const HORIZON_MS = 48 * 3600 * 1000;

export function slotCapacity(rest) {
  const limit = rest.max_orders_per_hour || 0;
  return limit > 0 ? Math.max(1, Math.round(limit / 2)) : 999;
}

// Lista de huecos candidatos (epoch ms) según horario / estado
export function candidateSlots(rest, now = Date.now()) {
  if (!rest.is_open) return []; // cerrado a mano = ni pedidos ni reservas
  const hasSchedule = !!(rest.schedule && rest.schedule.trim());
  const first = Math.ceil((now + BUFFER_MS) / SLOT_MS) * SLOT_MS;
  const out = [];
  for (let t = first; t < now + HORIZON_MS && out.length < 24; t += SLOT_MS) {
    if (hasSchedule) {
      if (isOpenAtDate(rest.schedule, new Date(t))) out.push(t);
    } else {
      if (t > now + 3 * 3600 * 1000) break; // sin horario: solo próximas 3h
      out.push(t);
    }
  }
  return out;
}

export function slotLabel(t, now = Date.now()) {
  const p = madridParts(new Date(t));
  const today = madridParts(new Date(now)).ymd;
  const tomorrow = madridParts(new Date(now + 24 * 3600 * 1000)).ymd;
  const day = p.ymd === today ? "" : p.ymd === tomorrow ? "mañana " : "";
  return `${day}${p.hhmm}`;
}

async function slotCounts(restaurantId, from, to) {
  const rows = await sql`SELECT scheduled_for, COUNT(*)::int AS n FROM orders
    WHERE restaurant_id = ${restaurantId} AND status != 'rechazado'
    AND scheduled_for IS NOT NULL AND scheduled_for >= ${new Date(from).toISOString()}
    AND scheduled_for < ${new Date(to).toISOString()}
    GROUP BY scheduled_for`;
  const map = {};
  for (const r of rows) map[new Date(r.scheduled_for).getTime()] = r.n;
  return map;
}

// Huecos disponibles con capacidad; y si "lo antes posible" cabe ahora mismo
export async function availability(rest, now = Date.now()) {
  const cap = slotCapacity(rest);
  const cands = candidateSlots(rest, now);
  const counts = cands.length
    ? await slotCounts(rest.id, cands[0], cands[cands.length - 1] + SLOT_MS)
    : {};
  const slots = cands
    .filter((t) => (counts[t] || 0) < cap)
    .map((t) => ({ t, label: slotLabel(t, now) }));

  let asapOk = effectiveOpen(rest);
  if (asapOk && rest.max_orders_per_hour > 0) {
    const [{ n }] = await sql`SELECT COUNT(*)::int AS n FROM orders
      WHERE restaurant_id = ${rest.id} AND status != 'rechazado'
      AND (
        (scheduled_for IS NULL AND created_at > NOW() - INTERVAL '60 minutes')
        OR (scheduled_for IS NOT NULL AND scheduled_for > NOW() - INTERVAL '15 minutes' AND scheduled_for < NOW() + INTERVAL '45 minutes')
      )`;
    if (n >= rest.max_orders_per_hour) asapOk = false;
  }
  return { asapOk, slots, cap };
}
