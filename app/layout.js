import "./globals.css";

export const metadata = {
  // Cambiar cuando haya dominio propio: hace absolutas las URLs de las imágenes
  // para las vistas previas de WhatsApp y redes (og:image).
  metadataBase: new URL("https://pideperote.vercel.app"),
  title: "PidePerote — Comida a domicilio en Álora",
  description: "Pide a los bares y restaurantes de Álora: a domicilio, para recoger o desde tu mesa.",
  openGraph: {
    title: "PidePerote",
    description: "Los bares de Álora, en tu móvil. A domicilio, para recoger o desde tu mesa.",
    siteName: "PidePerote",
    locale: "es_ES",
    type: "website",
  },
};

export const viewport = { width: "device-width", initialScale: 1, themeColor: "#007F80" };

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,600;12..96,800&family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
