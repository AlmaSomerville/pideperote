"use client";
import { useState, useMemo } from "react";
import Link from "next/link";

const eur = (c) => (c / 100).toFixed(2).replace(".", ",") + " €";

export default function HomeClient({ restaurants }) {
  const [q, setQ] = useState("");

  const { open, closed } = useMemo(() => {
    const list = (restaurants || []).filter((r) =>
      r.name.toLowerCase().includes(q.trim().toLowerCase())
    );
    return { open: list.filter((r) => r.open), closed: list.filter((r) => !r.open) };
  }, [restaurants, q]);

  return (
    <main>
      <header className="hero">
        <div className="hero-inner">
          <div className="hero-top">
            <span className="wordmark light">pideperote<span className="dot">.</span></span>
            <Link href="/portal" className="hero-link">Restaurantes</Link>
          </div>
          <h1 className="hero-title">
            El sabor de Álora,<br />a tu puerta<span className="dot">.</span>
          </h1>
          <p className="hero-sub">Pide a los bares y restaurantes del pueblo. Sin registros, pagas en efectivo al recibir.</p>
          <div className="hero-search">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2.2" />
              <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Busca un restaurante..."
              aria-label="Buscar restaurante"
            />
          </div>
        </div>
        <div className="hero-wave" aria-hidden="true">
          <svg viewBox="0 0 1440 70" preserveAspectRatio="none">
            <path d="M0,40 C240,75 480,5 720,30 C960,55 1200,15 1440,45 L1440,70 L0,70 Z" fill="var(--bg)" />
          </svg>
        </div>
      </header>

      <div className="wrap" style={{ paddingTop: 6 }}>
        {restaurants === null && (
          <div className="panel">
            <h3>Falta configurar la base de datos</h3>
            <p className="muted">Revisa <code>DATABASE_URL</code> en Vercel y ejecuta <code>/api/setup</code>.</p>
          </div>
        )}

        {restaurants?.length === 0 && (
          <div className="panel">
            <h3>Muy pronto</h3>
            <p className="muted">Estamos añadiendo los primeros restaurantes de Álora.</p>
          </div>
        )}

        {open.length > 0 && (
          <>
            <div className="section-head">
              <h2>Abiertos ahora</h2>
              <span className="count-pill">{open.length}</span>
            </div>
            <div className="card-grid">
              {open.map((r) => <RestCard key={r.id} r={r} />)}
            </div>
          </>
        )}

        {closed.length > 0 && (
          <>
            <div className="section-head" style={{ marginTop: open.length ? 34 : 0 }}>
              <h2>Cerrados ahora</h2>
              <span className="count-pill dim">{closed.length}</span>
            </div>
            <div className="card-grid">
              {closed.map((r) => <RestCard key={r.id} r={r} />)}
            </div>
          </>
        )}

        {restaurants?.length > 0 && open.length + closed.length === 0 && (
          <p className="muted" style={{ textAlign: "center", marginTop: 30 }}>
            Nada que coincida con "{q}".
          </p>
        )}

        <footer className="home-foot">
          <span className="wordmark" style={{ fontSize: 18 }}>pideperote<span className="dot">.</span></span>
          <p className="muted">Hecho en Álora · <Link href="/portal"><u>Acceso restaurantes</u></Link></p>
        </footer>
      </div>
    </main>
  );
}

function RestCard({ r }) {
  return (
    <Link href={`/r/${r.slug}`} className={`rcard ${r.open ? "" : "closed"}`} style={{ "--rc": r.color }}>
      <div className="rcard-cover">
        {r.cover ? (
          <img src={r.cover} alt="" loading="lazy" />
        ) : (
          <div className="rcard-cover-fallback">
            <span>{r.name}</span>
          </div>
        )}
        <span className={`badge float ${r.open ? "open" : "shut"}`}>{r.open ? "Abierto" : "Cerrado"}</span>
      </div>
      <div className="rcard-body">
        <div className="rcard-logo">
          {r.logo ? <img src={r.logo} alt="" /> : r.name.slice(0, 1).toUpperCase()}
        </div>
        <div className="rcard-text">
          <div className="rcard-name">{r.name}</div>
          <div className="rcard-meta">
            {r.hoursText && <span>{r.hoursText}</span>}
            <span className="meta-tags">
              {r.delivery && (r.deliveryFee > 0 ? `🛵 ${eur(r.deliveryFee)}` : "🛵 Gratis")}
              {r.delivery && r.pickup && " · "}
              {r.pickup && "🏃 Recogida"}
              {r.minOrder > 0 && ` · Mín. ${eur(r.minOrder)}`}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
