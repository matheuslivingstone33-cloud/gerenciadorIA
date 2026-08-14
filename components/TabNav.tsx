"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ABAS = [
  { href: "/", label: "Ideias" },
  { href: "/marketing", label: "Marketing" },
];

export default function TabNav() {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-1">
      {ABAS.map((aba) => {
        const ativo = pathname === aba.href;
        return (
          <Link
            key={aba.href}
            href={aba.href}
            className="rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
            style={
              ativo
                ? { background: "var(--surface-2)", color: "var(--foreground)" }
                : { color: "var(--muted)" }
            }
          >
            {aba.label}
          </Link>
        );
      })}
    </nav>
  );
}
