"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  OBJETIVO_INFO,
  STATUS_INFO,
  type AnaliseSalva,
  type Objetivo,
  type ProjectStatus,
  type Projeto,
} from "@/lib/types";
import {
  carregarAnalises,
  carregarProjetos,
  definirPrefillMarketing,
  novoId,
  salvarAnalises,
  salvarProjetos,
} from "@/lib/storage";
import MarketingResultView from "@/components/MarketingResultView";

const ORDEM_STATUS: ProjectStatus[] = ["ideia", "andamento", "pausado", "concluido"];

// minúsculas e sem acento, para a busca casar "válvula" com "valvula".
function normBusca(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export default function PainelPage() {
  const router = useRouter();
  const [projetos, setProjetos] = useState<Projeto[]>([]);
  const [analises, setAnalises] = useState<AnaliseSalva[]>([]);
  const [carregado, setCarregado] = useState(false);
  const [aberto, setAberto] = useState<string | null>(null);
  const [analiseAberta, setAnaliseAberta] = useState<AnaliseSalva | null>(null);
  const [buscaProj, setBuscaProj] = useState("");
  const [filtroObj, setFiltroObj] = useState<Objetivo | "todos">("todos");

  // formulário de novo projeto
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [objetivo, setObjetivo] = useState<Objetivo>("ambos");

  useEffect(() => {
    setProjetos(carregarProjetos());
    setAnalises(carregarAnalises());
    setCarregado(true);
  }, []);

  useEffect(() => {
    if (carregado) salvarProjetos(projetos);
  }, [projetos, carregado]);

  function atualizar(id: string, patch: Partial<Projeto>) {
    setProjetos((atual) =>
      atual.map((p) =>
        p.id === id ? { ...p, ...patch, atualizadoEm: new Date().toISOString() } : p,
      ),
    );
  }

  function adicionarProjeto(e: React.FormEvent) {
    e.preventDefault();
    if (!nome.trim()) return;
    const agora = new Date().toISOString();
    setProjetos((atual) => [
      {
        id: novoId(),
        nome: nome.trim(),
        descricao: descricao.trim(),
        status: "ideia",
        objetivo,
        ideias: [],
        criadoEm: agora,
        atualizadoEm: agora,
      },
      ...atual,
    ]);
    setNome("");
    setDescricao("");
    setObjetivo("ambos");
  }

  function excluir(id: string) {
    setProjetos((atual) => atual.filter((p) => p.id !== id));
    if (aberto === id) setAberto(null);
  }

  function excluirAnalise(id: string) {
    setAnalises((atual) => {
      const nova = atual.filter((a) => a.id !== id);
      salvarAnalises(nova);
      return nova;
    });
    if (analiseAberta?.id === id) setAnaliseAberta(null);
  }

  function renomearAnalise(id: string, novoTitulo: string) {
    const t = novoTitulo.trim();
    if (!t) return;
    setAnalises((atual) => {
      const nova = atual.map((a) => (a.id === id ? { ...a, titulo: t } : a));
      salvarAnalises(nova);
      return nova;
    });
    setAnaliseAberta((cur) => (cur && cur.id === id ? { ...cur, titulo: t } : cur));
  }

  function analisarNoMarketing(p: Projeto) {
    const conteudo = `Ideia: ${p.nome}\n\n${p.descricao}${
      p.ideias.length ? "\n\nIdeias:\n- " + p.ideias.map((i) => i.texto).join("\n- ") : ""
    }`;
    definirPrefillMarketing({
      conteudo,
      objetivo: p.objetivo,
      projetoId: p.id,
      projetoNome: p.nome,
    });
    router.push("/marketing");
  }

  const projetosFiltrados = useMemo(() => {
    const termo = normBusca(buscaProj.trim());
    return projetos.filter((p) => {
      if (filtroObj !== "todos" && p.objetivo !== filtroObj) return false;
      if (!termo) return true;
      return normBusca(`${p.nome} ${p.descricao}`).includes(termo);
    });
  }, [projetos, buscaProj, filtroObj]);

  const porStatus = useMemo(() => {
    const mapa: Record<ProjectStatus, Projeto[]> = {
      ideia: [],
      andamento: [],
      pausado: [],
      concluido: [],
    };
    for (const p of projetosFiltrados) mapa[p.status].push(p);
    return mapa;
  }, [projetosFiltrados]);

  const analisesPorProjeto = useMemo(() => {
    const mapa: Record<string, AnaliseSalva[]> = {};
    for (const a of analises) {
      if (!a.projetoId) continue;
      (mapa[a.projetoId] ??= []).push(a);
    }
    return mapa;
  }, [analises]);

  const projetoAberto = projetos.find((p) => p.id === aberto) ?? null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Minhas ideias</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Anote, organize e desenvolva suas ideias. Mova pelo status e envie qualquer uma
          para a Análise de Marketing.
        </p>
      </div>

      {/* novo projeto */}
      <form onSubmit={adicionarProjeto} className="card p-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
          <input
            className="input"
            placeholder="Nome da ideia (ex.: Lançamento linha X)"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
          />
          <select
            className="input"
            value={objetivo}
            onChange={(e) => setObjetivo(e.target.value as Objetivo)}
          >
            {(Object.keys(OBJETIVO_INFO) as Objetivo[]).map((o) => (
              <option key={o} value={o}>
                {OBJETIVO_INFO[o].label}
              </option>
            ))}
          </select>
        </div>
        <textarea
          className="input mt-3 min-h-[70px] resize-y"
          placeholder="Descrição da ideia (opcional)"
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
        />
        <div className="mt-3 flex justify-end">
          <button type="submit" className="btn btn-primary" disabled={!nome.trim()}>
            + Adicionar ideia
          </button>
        </div>
      </form>

      {/* busca e filtro */}
      {projetos.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            className="input max-w-xs !py-1.5 !text-sm"
            placeholder="Buscar ideia por nome ou descrição..."
            value={buscaProj}
            onChange={(e) => setBuscaProj(e.target.value)}
          />
          <select
            className="input !w-auto !py-1.5 !text-sm"
            value={filtroObj}
            onChange={(e) => setFiltroObj(e.target.value as Objetivo | "todos")}
          >
            <option value="todos">Todos os objetivos</option>
            {(Object.keys(OBJETIVO_INFO) as Objetivo[]).map((o) => (
              <option key={o} value={o}>
                {OBJETIVO_INFO[o].label}
              </option>
            ))}
          </select>
          {(buscaProj.trim() || filtroObj !== "todos") && (
            <span className="text-xs text-[var(--muted)]">
              {projetosFiltrados.length} de {projetos.length}
            </span>
          )}
        </div>
      )}

      {/* quadro */}
      {carregado && projetos.length === 0 ? (
        <div className="card grid place-items-center p-10 text-center text-sm text-[var(--muted)]">
          Nenhuma ideia ainda. Adicione a primeira acima 👆
        </div>
      ) : projetosFiltrados.length === 0 ? (
        <div className="card grid place-items-center p-10 text-center text-sm text-[var(--muted)]">
          Nenhuma ideia encontrada para a busca ou filtro.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {ORDEM_STATUS.map((status) => (
            <div key={status} className="flex flex-col gap-3">
              <div className="flex items-center justify-between px-1">
                <span className="flex items-center gap-2 text-sm font-semibold">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ background: STATUS_INFO[status].cor }}
                  />
                  {STATUS_INFO[status].label}
                </span>
                <span className="text-xs text-[var(--muted)]">
                  {porStatus[status].length}
                </span>
              </div>

              {porStatus[status].map((p) => {
                const qtdAnalises = analisesPorProjeto[p.id]?.length ?? 0;
                return (
                  <div key={p.id} className="card p-3">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-sm font-semibold leading-snug">{p.nome}</h3>
                      <span className="badge shrink-0">{OBJETIVO_INFO[p.objetivo].label}</span>
                    </div>
                    {p.descricao && (
                      <p className="mt-1.5 line-clamp-3 text-xs text-[var(--muted)]">
                        {p.descricao}
                      </p>
                    )}

                    <div className="mt-2.5 flex items-center gap-2">
                      <select
                        className="input !py-1 !text-xs"
                        value={p.status}
                        onChange={(e) => atualizar(p.id, { status: e.target.value as ProjectStatus })}
                      >
                        {ORDEM_STATUS.map((s) => (
                          <option key={s} value={s}>
                            {STATUS_INFO[s].label}
                          </option>
                        ))}
                      </select>
                      {p.ideias.length > 0 && (
                        <span className="badge shrink-0" title="Ideias">
                          💡 {p.ideias.length}
                        </span>
                      )}
                      {qtdAnalises > 0 && (
                        <span className="badge shrink-0" title="Análises de marketing">
                          📊 {qtdAnalises}
                        </span>
                      )}
                    </div>

                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      <button className="btn btn-ghost !px-2 !py-1 !text-xs" onClick={() => setAberto(p.id)}>
                        Abrir
                      </button>
                      <button
                        className="btn btn-primary !px-2 !py-1 !text-xs"
                        onClick={() => analisarNoMarketing(p)}
                      >
                        Analisar 🔎
                      </button>
                      <button
                        className="btn btn-ghost !px-2 !py-1 !text-xs"
                        style={{ color: "var(--danger)" }}
                        onClick={() => excluir(p.id)}
                      >
                        Excluir
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {projetoAberto && (
        <DetalheProjeto
          projeto={projetoAberto}
          analises={analisesPorProjeto[projetoAberto.id] ?? []}
          onFechar={() => setAberto(null)}
          onAtualizar={atualizar}
          onAnalisar={analisarNoMarketing}
          onVerAnalise={setAnaliseAberta}
          onExcluirAnalise={excluirAnalise}
          onRenomearAnalise={renomearAnalise}
        />
      )}

      {analiseAberta && (
        <AnaliseViewer analise={analiseAberta} onFechar={() => setAnaliseAberta(null)} />
      )}
    </div>
  );
}

function DetalheProjeto({
  projeto,
  analises,
  onFechar,
  onAtualizar,
  onAnalisar,
  onVerAnalise,
  onExcluirAnalise,
  onRenomearAnalise,
}: {
  projeto: Projeto;
  analises: AnaliseSalva[];
  onFechar: () => void;
  onAtualizar: (id: string, patch: Partial<Projeto>) => void;
  onAnalisar: (p: Projeto) => void;
  onVerAnalise: (a: AnaliseSalva) => void;
  onExcluirAnalise: (id: string) => void;
  onRenomearAnalise: (id: string, novoTitulo: string) => void;
}) {
  const [novaIdeia, setNovaIdeia] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editTit, setEditTit] = useState("");

  function addIdeia(e: React.FormEvent) {
    e.preventDefault();
    if (!novaIdeia.trim()) return;
    onAtualizar(projeto.id, {
      ideias: [
        ...projeto.ideias,
        { id: novoId(), texto: novaIdeia.trim(), criadoEm: new Date().toISOString() },
      ],
    });
    setNovaIdeia("");
  }

  function removerIdeia(id: string) {
    onAtualizar(projeto.id, { ideias: projeto.ideias.filter((i) => i.id !== id) });
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      onClick={onFechar}
    >
      <div
        className="card max-h-[90vh] w-full max-w-lg overflow-y-auto p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <input
            className="input !text-base !font-semibold"
            value={projeto.nome}
            onChange={(e) => onAtualizar(projeto.id, { nome: e.target.value })}
          />
          <button className="btn btn-ghost !px-2.5 !py-1.5" onClick={onFechar}>
            ✕
          </button>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-medium text-[var(--muted)]">
            Objetivo
            <select
              className="input mt-1"
              value={projeto.objetivo}
              onChange={(e) => onAtualizar(projeto.id, { objetivo: e.target.value as Objetivo })}
            >
              {(Object.keys(OBJETIVO_INFO) as Objetivo[]).map((o) => (
                <option key={o} value={o}>
                  {OBJETIVO_INFO[o].label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-[var(--muted)]">
            Status
            <select
              className="input mt-1"
              value={projeto.status}
              onChange={(e) => onAtualizar(projeto.id, { status: e.target.value as ProjectStatus })}
            >
              {ORDEM_STATUS.map((s) => (
                <option key={s} value={s}>
                  {STATUS_INFO[s].label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="mt-3 block text-xs font-medium text-[var(--muted)]">
          Descrição
          <textarea
            className="input mt-1 min-h-[90px] resize-y"
            value={projeto.descricao}
            onChange={(e) => onAtualizar(projeto.id, { descricao: e.target.value })}
          />
        </label>

        <div className="mt-4">
          <h4 className="text-sm font-semibold">Anotações & detalhes</h4>
          <form onSubmit={addIdeia} className="mt-2 flex gap-2">
            <input
              className="input"
              placeholder="Anote um detalhe, um próximo passo, uma referência..."
              value={novaIdeia}
              onChange={(e) => setNovaIdeia(e.target.value)}
            />
            <button className="btn btn-primary shrink-0" disabled={!novaIdeia.trim()}>
              + Nota
            </button>
          </form>
          <ul className="mt-2 space-y-1.5">
            {projeto.ideias.map((i) => (
              <li
                key={i.id}
                className="flex items-start justify-between gap-2 rounded-lg bg-[var(--surface-2)] px-3 py-2 text-sm"
              >
                <span>💡 {i.texto}</span>
                <button
                  className="shrink-0 text-xs text-[var(--muted)] hover:text-[var(--danger)]"
                  onClick={() => removerIdeia(i.id)}
                >
                  remover
                </button>
              </li>
            ))}
            {projeto.ideias.length === 0 && (
              <li className="px-1 text-xs text-[var(--muted)]">Nenhuma anotação ainda.</li>
            )}
          </ul>
        </div>

        {/* análises vinculadas */}
        <div className="mt-4">
          <h4 className="text-sm font-semibold">Análises de marketing</h4>
          <ul className="mt-2 space-y-1.5">
            {analises.map((a) => (
              <li
                key={a.id}
                className="flex items-center justify-between gap-2 rounded-lg bg-[var(--surface-2)] px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  {editId === a.id ? (
                    <input
                      autoFocus
                      className="input !py-1 !text-sm"
                      value={editTit}
                      onChange={(e) => setEditTit(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          onRenomearAnalise(a.id, editTit);
                          setEditId(null);
                        }
                        if (e.key === "Escape") setEditId(null);
                      }}
                    />
                  ) : (
                    <>
                      <p className="truncate text-sm font-medium">{a.titulo}</p>
                      <p className="text-[11px] text-[var(--muted)]">
                        {new Date(a.criadoEm).toLocaleString("pt-BR")}
                        {typeof a.resultado.diagnostico?.pontuacao === "number"
                          ? ` · ${a.resultado.diagnostico.pontuacao}/100`
                          : ""}
                      </p>
                    </>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1.5 text-xs text-[var(--muted)]">
                  {editId === a.id ? (
                    <>
                      <button
                        className="hover:text-[var(--brand)]"
                        onClick={() => {
                          onRenomearAnalise(a.id, editTit);
                          setEditId(null);
                        }}
                      >
                        salvar
                      </button>
                      <button className="hover:text-[var(--foreground)]" onClick={() => setEditId(null)}>
                        cancelar
                      </button>
                    </>
                  ) : (
                    <>
                      <button className="btn btn-ghost !px-2 !py-1 !text-xs" onClick={() => onVerAnalise(a)}>
                        Ver
                      </button>
                      <button
                        className="hover:text-[var(--foreground)]"
                        onClick={() => {
                          setEditId(a.id);
                          setEditTit(a.titulo);
                        }}
                      >
                        renomear
                      </button>
                      <button
                        className="hover:text-[var(--danger)]"
                        onClick={() => onExcluirAnalise(a.id)}
                      >
                        excluir
                      </button>
                    </>
                  )}
                </div>
              </li>
            ))}
            {analises.length === 0 && (
              <li className="px-1 text-xs text-[var(--muted)]">
                Nenhuma análise salva para esta ideia ainda.
              </li>
            )}
          </ul>
        </div>

        <div className="mt-5 flex justify-end">
          <button className="btn btn-primary" onClick={() => onAnalisar(projeto)}>
            Nova análise de marketing 🔎
          </button>
        </div>
      </div>
    </div>
  );
}

function AnaliseViewer({ analise, onFechar }: { analise: AnaliseSalva; onFechar: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      onClick={onFechar}
    >
      <div
        className="card max-h-[92vh] w-full max-w-2xl overflow-y-auto p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-lg font-semibold">{analise.titulo}</h3>
            {analise.projetoNome && (
              <p className="text-xs text-[var(--muted)]">Ideia: {analise.projetoNome}</p>
            )}
          </div>
          <button className="btn btn-ghost !px-2.5 !py-1.5" onClick={onFechar}>
            ✕
          </button>
        </div>
        <MarketingResultView r={analise.resultado} titulo={analise.titulo} />
      </div>
    </div>
  );
}
