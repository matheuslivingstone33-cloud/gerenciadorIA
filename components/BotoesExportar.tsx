"use client";

import { useState } from "react";
import type { ResultadoMarketing } from "@/lib/types";
import { analiseParaTexto, nomeArquivo } from "@/lib/exportar";

// Botões "Copiar" e "Baixar .md" para levar a análise pra fora do app
// (WhatsApp, e-mail, documento). Tudo no navegador — nada sai para servidor.
export default function BotoesExportar({
  r,
  titulo,
}: {
  r: ResultadoMarketing;
  titulo?: string;
}) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    const txt = analiseParaTexto(r, titulo);
    try {
      await navigator.clipboard.writeText(txt);
    } catch {
      // Fallback para navegadores/contextos sem Clipboard API.
      const ta = document.createElement("textarea");
      ta.value = txt;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
      } catch {
        /* ignora */
      }
      ta.remove();
    }
    setCopiado(true);
    setTimeout(() => setCopiado(false), 1800);
  }

  function baixar() {
    const txt = analiseParaTexto(r, titulo);
    const blob = new Blob([txt], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${nomeArquivo(titulo)}.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex shrink-0 gap-1.5">
      <button type="button" className="btn btn-ghost !px-2.5 !py-1 !text-xs" onClick={copiar}>
        {copiado ? "✓ Copiado" : "Copiar"}
      </button>
      <button type="button" className="btn btn-ghost !px-2.5 !py-1 !text-xs" onClick={baixar}>
        Baixar .md
      </button>
    </div>
  );
}
