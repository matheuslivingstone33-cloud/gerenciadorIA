import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import TabNav from "@/components/TabNav";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "sextafeira — banco de ideias + análise de marketing",
  description:
    "App para anotar, organizar e desenvolver ideias, com uma análise de marketing que lê, resume e diagnostica cada ideia — offline, sem IA e sem serviço externo.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <header className="sticky top-0 z-20 border-b bg-[var(--surface)]/85 backdrop-blur">
          <div className="mx-auto flex w-full max-w-6xl items-center gap-4 px-4 py-3">
            <div className="flex items-center gap-2">
              <span
                className="grid h-8 w-8 place-items-center rounded-lg text-sm font-bold text-white"
                style={{ background: "linear-gradient(135deg,var(--brand),var(--brand-2))" }}
              >
                sf
              </span>
              <span className="text-[15px] font-semibold tracking-tight">sextafeira</span>
            </div>
            <TabNav />
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
        <footer className="border-t px-4 py-4 text-center text-xs text-[var(--muted)]">
          Banco de ideias + análise de marketing · roda 100% no seu computador
        </footer>
      </body>
    </html>
  );
}
