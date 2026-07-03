import "./globals.css";

export const metadata = {
  title: "PidePerote — Comida a domicilio en Álora",
  description: "Pide a los restaurantes de Álora. Reparto y recogida.",
};

export const viewport = { width: "device-width", initialScale: 1, themeColor: "#0A544D" };

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
