import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "💸 Finance HQ — Roast Command Center",
  description: "Self-hosted personal finance tracker and AI roast engine",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark bg-black">
      <body className={`${inter.className} bg-black text-white antialiased min-h-screen selection:bg-zinc-800 selection:text-zinc-100`}>
        {children}
      </body>
    </html>
  );
}
