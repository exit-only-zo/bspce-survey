import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Matera — Indication d'intérêt BSPCE",
  description: "Sondage confidentiel BSPCE",
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <body className="min-h-screen font-sans antialiased">{children}</body>
    </html>
  );
}
