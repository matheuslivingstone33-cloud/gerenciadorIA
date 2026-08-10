"use client";

import type { Diagnostico, Metricas, ResultadoMarketing } from "@/lib/types";
import BotoesExportar from "@/components/BotoesExportar";

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="card p-4">
      <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
        {titulo}
      </h3>
      {children}
    </section>
  );
}

function Lista({ itens }: { itens: string[] }) {
  return (
    <ul className="space-y-1.5">
      {itens.map((t, i) => (
        <li key={i} className="flex gap-2 text-sm">
          <span className="mt-[3px] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--brand)]" />
          <span>{t}</span>
        </li>
      ))}
    </ul>
  );
}

const PERFIL: Record<Metricas["perfil"], string> = {
  b2b: "B2B / técnico",
  b2c: "B2C / consumo",
  misto: "misto",
};

function corDaNota(n: number): string {
  if (n >= 75) return "var(--ok, #16a34a)";
  if (n >= 45) return "var(--accent)";
  return "var(--danger)";
}

function Painel({ d, m }: { d: Diagnostico; m?: Metricas }) {
  const atendidos = d.itens.filter((i) => i.ok).length;

  return (
    <section className="card p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
            Diagnóstico do material
          </h3>
          <p className="mt-1 text-xs text-[var(--muted)]">
            {atendidos} de {d.itens.length} itens atendidos
            {m
              ? ` · ${m.palavras} palavras · leitura ${m.legibilidade} · linguagem ${PERFIL[m.perfil]}`
              : ""}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <span className="text-2xl font-bold leading-none" style={{ color: corDaNota(d.pontuacao) }}>
            {d.pontuacao}
          </span>
          <span className="text-xs text-[var(--muted)]">/100</span>
        </div>
      </div>

      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-2)]">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${d.pontuacao}%`, background: corDaNota(d.pontuacao) }}
        />
      </div>

      <ul className="mt-3 space-y-2">
        {d.itens.map((i, idx) => (
          <li key={idx} className="flex gap-2 text-sm">
            <span className="mt-[1px] shrink-0" style={{ color: i.ok ? "var(--ok, #16a34a)" : "var(--danger)" }}>
              {i.ok ? "✓" : "✕"}
            </span>
            <span>
              <span className={i.ok ? "" : "font-medium"}>{i.titulo}</span>
              {i.dica && <span className="block text-xs text-[var(--muted)]">→ {i.dica}</span>}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function MarketingResultView({
  r,
  titulo,
}: {
  r: ResultadoMarketing;
  titulo?: string;
}) {
  const temVenda =
    r.propostaValor ||
    (r.gatilhos && r.gatilhos.length) ||
    (r.objecoes && r.objecoes.length) ||
    (r.cta && r.cta.length);
  const temDivulgacao =
    (r.ganchos && r.ganchos.length) ||
    (r.canais && r.canais.length) ||
    (r.formatos && r.formatos.length);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <span className="badge" style={{ borderColor: "var(--brand)", color: "var(--brand)" }}>
          ⚙️ Análise local · offline
        </span>
        <BotoesExportar r={r} titulo={titulo} />
      </div>

      {r.aviso && (
        <div className="card border-l-4 p-3 text-sm" style={{ borderLeftColor: "var(--accent)" }}>
          {r.aviso}
        </div>
      )}

      {r.resumo && (
        <Secao titulo="Resumo">
          <p className="text-sm leading-relaxed">{r.resumo}</p>
        </Secao>
      )}

      {r.diagnostico && <Painel d={r.diagnostico} m={r.metricas} />}

      {r.pontosChave.length > 0 && (
        <Secao titulo="O que o sistema leu">
          <Lista itens={r.pontosChave} />
        </Secao>
      )}

      {r.analise && (
        <Secao titulo="Análise estratégica">
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{r.analise}</p>
        </Secao>
      )}

      {r.titulos && r.titulos.length > 0 && (
        <Secao titulo="Títulos sugeridos">
          <Lista itens={r.titulos} />
        </Secao>
      )}

      {temVenda && (
        <Secao titulo="Trilha vendável (conversão)">
          {r.propostaValor && (
            <p className="mb-3 rounded-lg bg-[var(--surface-2)] p-3 text-sm">
              <strong>Proposta de valor:</strong> {r.propostaValor}
            </p>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            {r.gatilhos && r.gatilhos.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-semibold text-[var(--muted)]">Gatilhos</p>
                <Lista itens={r.gatilhos} />
              </div>
            )}
            {r.objecoes && r.objecoes.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-semibold text-[var(--muted)]">Objeções</p>
                <Lista itens={r.objecoes} />
              </div>
            )}
          </div>
          {r.cta && r.cta.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {r.cta.map((c, i) => (
                <span
                  key={i}
                  className="rounded-lg px-3 py-1.5 text-sm font-medium text-white"
                  style={{ background: "var(--brand)" }}
                >
                  {c}
                </span>
              ))}
            </div>
          )}
        </Secao>
      )}

      {temDivulgacao && (
        <Secao titulo="Trilha de divulgação (alcance)">
          <div className="grid gap-4 sm:grid-cols-2">
            {r.ganchos && r.ganchos.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-semibold text-[var(--muted)]">Ganchos</p>
                <Lista itens={r.ganchos} />
              </div>
            )}
            {r.formatos && r.formatos.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-semibold text-[var(--muted)]">Formatos</p>
                <Lista itens={r.formatos} />
              </div>
            )}
          </div>
          {r.canais && r.canais.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {r.canais.map((c, i) => (
                <span key={i} className="badge">
                  {c}
                </span>
              ))}
            </div>
          )}
        </Secao>
      )}

      {r.ideiasConteudo.length > 0 && (
        <Secao titulo="Ideias de conteúdo">
          <Lista itens={r.ideiasConteudo} />
        </Secao>
      )}

      {r.proximosPassos.length > 0 && (
        <Secao titulo="Próximos passos">
          <ol className="space-y-1.5">
            {r.proximosPassos.map((t, i) => (
              <li key={i} className="flex gap-2 text-sm">
                <span className="font-semibold text-[var(--brand)]">{i + 1}.</span>
                <span>{t}</span>
              </li>
            ))}
          </ol>
        </Secao>
      )}

      {(r.hashtags.length > 0 || r.palavrasChave.length > 0) && (
        <Secao titulo="Palavras-chave & hashtags">
          {r.palavrasChave.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {r.palavrasChave.map((k, i) => (
                <span key={i} className="badge">
                  {k}
                </span>
              ))}
            </div>
          )}
          {r.hashtags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {r.hashtags.map((h, i) => (
                <span key={i} className="badge" style={{ color: "var(--brand)" }}>
                  {h.startsWith("#") ? h : "#" + h}
                </span>
              ))}
            </div>
          )}
        </Secao>
      )}

      {r.fontes && r.fontes.length > 0 && (
        <Secao titulo="Fontes da pesquisa">
          <ul className="space-y-1.5">
            {r.fontes.map((f, i) => (
              <li key={i} className="text-sm">
                <a
                  href={f.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--brand)] underline underline-offset-2"
                >
                  {f.titulo || f.url}
                </a>
              </li>
            ))}
          </ul>
        </Secao>
      )}
    </div>
  );
}
