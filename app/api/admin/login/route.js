import { NextResponse } from "next/server";
import { setSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req) {
  const { password } = await req.json().catch(() => ({}));
  if (!process.env.ADMIN_PASSWORD)
    return NextResponse.json({ error: "ADMIN_PASSWORD no configurada en Vercel." }, { status: 500 });
  if (password !== process.env.ADMIN_PASSWORD)
    return NextResponse.json({ error: "Contraseña incorrecta." }, { status: 401 });
  setSession({ role: "admin" });
  return NextResponse.json({ ok: true });
}
