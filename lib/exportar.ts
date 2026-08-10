// Converte um resultado de análise em texto (Markdown, que também lê bem como
// texto puro) — para copiar no WhatsApp/e-mail ou baixar como arquivo.
// Puro e sem efeitos colaterais; roda no cliente.

import type { ResultadoMarketing } from "./types";

const PERFIL: Record<string, string> = {
  b2b: "B2B / técnico",
  b2c: "B2C / consumo",
  misto: "misto",
};

function secao(titulo: string, corpo: string): string {
  return corpo.trim() ? `## ${titulo}\n\n${corpo.trim()}\n` : "";
}

function lista(itens?: string[]): string {
  return (itens ?? []).map((i) => `- ${i}`).join("\n");
}

export function analiseParaTexto(r: ResultadoMarketing, titulo?: string): string {
  const partes: string[] = [];
  partes.push(`# ${titulo?.trim() || "Análise de marketing"}\n`);

  if (r.diagnostico) {
    const d = r.diagnostico;
    const ok = d.itens.filter((i) => i.ok).length;
    partes.push(`**Diagnóstico:** ${d.pontuacao}/100 — ${ok} de ${d.itens.length} itens atendidos`);
  }
  if (r.metricas) {
    const m = r.metricas;
    partes.push(`_${m.palavras} palavras · leitura ${m.legibilidade} · linguagem ${PERFIL[m.perfil] ?? m.perfil}_\n`);
  }

  partes.push(secao("Resumo", r.resumo));

  if (r.diagnostico) {
    const check = r.diagnostico.itens
      .map((i) => `- [${i.ok ? "x" : " "}] ${i.titulo}${i.dica ? `\n  → ${i.dica}` : ""}`)
      .join("\n");
    partes.push(secao("Diagnóstico do material", check));
  }

  partes.push(secao("O que o sistema leu", lista(r.pontosChave)));
  partes.push(secao("Análise estratégica", r.analise));
  partes.push(secao("Títulos sugeridos", lista(r.titulos)));

  if (r.propostaValor) partes.push(secao("Proposta de valor", r.propostaValor));
  partes.push(secao("Gatilhos", lista(r.gatilhos)));
  partes.push(secao("Objeções", lista(r.objecoes)));
  partes.push(secao("Chamadas para ação (CTA)", lista(r.cta)));

  partes.push(secao("Ganchos", lista(r.ganchos)));
  partes.push(secao("Canais", lista(r.canais)));
  partes.push(secao("Formatos", lista(r.formatos)));

  partes.push(secao("Ideias de conteúdo", lista(r.ideiasConteudo)));
  partes.push(
    secao(
      "Próximos passos",
      (r.proximosPassos ?? []).map((p, i) => `${i + 1}. ${p}`).join("\n"),
    ),
  );

  const kw = [...(r.palavrasChave ?? []), ...(r.hashtags ?? [])];
  partes.push(secao("Palavras-chave & hashtags", kw.join(" · ")));

  return partes.filter(Boolean).join("\n");
}

// Nome de arquivo seguro a partir de um título.
export function nomeArquivo(titulo?: string): string {
  const base = (titulo ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return base || "analise-marketing";
}
