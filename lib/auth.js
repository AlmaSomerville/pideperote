import crypto from "crypto";
import { cookies } from "next/headers";

const COOKIE = "pp_session";

function secret() {
  return process.env.AUTH_SECRET || process.env.ADMIN_PASSWORD || "cambiame";
}

function sign(payload) {
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", secret()).update(data).digest("base64url");
  return `${data}.${sig}`;
}

function verify(token) {
  if (!token || !token.includes(".")) return null;
  const [data, sig] = token.split(".");
  const expected = crypto.createHmac("sha256", secret()).update(data).digest("base64url");
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    const payload = JSON.parse(Buffer.from(data, "base64url").toString());
    if (payload.exp && payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export function setSession(payload) {
  const token = sign({ ...payload, exp: Date.now() + 1000 * 60 * 60 * 24 * 30 });
  cookies().set(COOKIE, token, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
}

export function getSession() {
  return verify(cookies().get(COOKIE)?.value);
}

export function clearSession() {
  cookies().delete(COOKIE);
}

// role: 'admin' | 'restaurant' (admin can act on any restaurant)
export function requireRestaurant(restaurantId) {
  const s = getSession();
  if (!s) return null;
  if (s.role === "admin") return s;
  if (s.role === "restaurant" && Number(s.rid) === Number(restaurantId)) return s;
  return null;
}

export function requireAdmin() {
  const s = getSession();
  return s && s.role === "admin" ? s : null;
}
