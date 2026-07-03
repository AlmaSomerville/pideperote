// Horario semanal real. Se guarda como JSON en restaurants.schedule:
// { "mon": "12:00-16:00, 19:00-23:30", "tue": "", ... }  ("" = cerrado ese día)
// Soporta rangos que cruzan medianoche: "20:00-01:30".

const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
export const DAY_LABEL = { mon: "Lunes", tue: "Martes", wed: "Miércoles", thu: "Jueves", fri: "Viernes", sat: "Sábado", sun: "Domingo" };
export const DAY_ORDER = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

export function parseRanges(str) {
  if (!str || !str.trim()) return [];
  const out = [];
  for (const part of String(str).split(",")) {
    const m = part.trim().match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/);
    if (!m) continue;
    const start = Number(m[1]) * 60 + Number(m[2]);
    const end = Number(m[3]) * 60 + Number(m[4]);
    if (start >= 0 && start < 1440 && end >= 0 && end <= 1440) out.push([start, end]);
  }
  return out;
}

function parseSchedule(scheduleStr) {
  if (!scheduleStr) return null;
  try {
    const s = JSON.parse(scheduleStr);
    if (!s || typeof s !== "object") return null;
    const hasAny = DAY_ORDER.some((d) => parseRanges(s[d]).length > 0);
    return hasAny ? s : null;
  } catch {
    return null;
  }
}

export function madridParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Madrid",
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (t) => parts.find((p) => p.type === t)?.value;
  const dayIdx = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[get("weekday")] ?? 0;
  const minutes = Number(get("hour")) % 24 * 60 + Number(get("minute"));
  const ymd = `${get("year")}-${get("month")}-${get("day")}`;
  return { dayIdx, minutes, ymd, hhmm: `${get("hour")}:${get("minute")}` };
}

function nowInMadrid() {
  return madridParts(new Date());
}

// ¿El horario dice abierto en un momento concreto?
export function isOpenAtDate(scheduleStr, date) {
  const s = parseSchedule(scheduleStr);
  if (!s) return null;
  const { dayIdx, minutes } = madridParts(date);
  const today = DAYS[dayIdx];
  const yesterday = DAYS[(dayIdx + 6) % 7];

  for (const [start, end] of parseRanges(s[today])) {
    if (end > start && minutes >= start && minutes < end) return true;
    if (end <= start && minutes >= start) return true; // tramo nocturno, parte de hoy
  }
  for (const [start, end] of parseRanges(s[yesterday])) {
    if (end <= start && minutes < end) return true; // cola del tramo nocturno de ayer
  }
  return false;
}

// null = sin horario configurado (se usa solo el interruptor manual)
export function scheduleSaysOpen(scheduleStr) {
  return isOpenAtDate(scheduleStr, new Date());
}

// Abierto de verdad = interruptor manual encendido Y (sin horario, o el horario dice abierto)
export function effectiveOpen(restaurant) {
  if (!restaurant.is_open) return false;
  const bySchedule = scheduleSaysOpen(restaurant.schedule);
  return bySchedule === null ? true : bySchedule;
}

// Texto para el cliente: "Hoy: 12:00-16:00, 19:00-23:30" o el campo hours de siempre
export function hoursText(restaurant) {
  const s = parseSchedule(restaurant.schedule);
  if (!s) return restaurant.hours || "";
  const { dayIdx } = nowInMadrid();
  const today = s[DAYS[dayIdx]];
  const ranges = parseRanges(today);
  if (!ranges.length) return "Hoy cerrado";
  return "Hoy: " + today.split(",").map((r) => r.trim()).join(", ");
}

// "Abre hoy a las 19:00" / "Abre mañana a las 12:00" / "Abre el viernes a las 12:00" / ""
export function nextOpeningText(restaurant) {
  if (!restaurant.is_open) return ""; // cerrado a mano: no prometemos nada
  const s = parseSchedule(restaurant.schedule);
  if (!s) return "";
  const { dayIdx, minutes } = nowInMadrid();
  const fmt = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  const DIA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

  for (let off = 0; off < 7; off++) {
    const day = DAYS[(dayIdx + off) % 7];
    const ranges = parseRanges(s[day]).sort((a, b) => a[0] - b[0]);
    for (const [start] of ranges) {
      if (off === 0 && start <= minutes) continue;
      const when = off === 0 ? "hoy" : off === 1 ? "mañana" : `el ${DIA[(dayIdx + off) % 7]}`;
      return `Abre ${when} a las ${fmt(start)}`;
    }
  }
  return "";
}
