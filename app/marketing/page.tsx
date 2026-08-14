"use client";

import { useEffect, useRef, useState } from "react";
import {
  OBJETIVO_INFO,
  type AnaliseSalva,
  type EntradaResumo,
  type Objetivo,
  type ResultadoMarketing,
} from "@/lib/types";
import {
  carregarAnalises,
  lerEConsumirPrefill,
  novoId,
  salvarAnalises,
} from "@/lib/storage";
import MarketingResultView from "@/components/MarketingResultView";

const MAX_ARQUIVOS = 5;
const MAX_ARQUIVO_BYTES = 4 * 1024 * 1024;
// Teto do total somado dos anexos. Mantém o envio abaixo do limite da função
// serverless do Vercel (~4,5 MB por requisição), evitando erro em produção.
const MAX_TOTAL_BYTES = 4 * 1024 * 1024;
const ACEITA = ".pdf,.txt,.md,.markdown,.csv,.tsv,.json,.log,.html";

function formatarBytes(b: number): string {
  if (b < 1024) return b + " B";
  if (b < 1024 * 1024) return (b / 1024).toFixed(0) + " KB";
  return (b / (1024 * 1024)).toFixed(1) + " MB";
}

// minúsculas e sem acento, para a busca do histórico casar "válvula" com "valvula".
function normBusca(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

interface Snapshot {
  titulo: string;
  entrada: EntradaResumo;
}

export default function MarketingPage() {
  const [conteudo, setConteudo] = useState("");
  const [link, setLink] = useState("");
  const [objetivo, setObjetivo] = useState<Objetivo>("ambos");
  const [publico, setPublico] = useState("");
  const [tom, setTom] = useState("");
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [avisoArquivo, setAvisoArquivo] = useState<string | null>(null);
  const inputArquivo = useRef<HTMLInputElement>(null);

  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoMarketing | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [jaSalva, setJaSalva] = useState(false);

  const [salvas, setSalvas] = useState<AnaliseSalva[]>([]);
  const [carregadoSalvas, setCarregadoSalvas] = useState(false);
  const [origemProjeto, setOrigemProjeto] = useState<{ id: string; nome: string } | null>(null);
  const [buscaHist, setBuscaHist] = useState("");
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [tituloEdit, setTituloEdit] = useState("");

  // prefill vindo do Painel + carregar histórico
  useEffect(() => {
    const prefill = lerEConsumirPrefill();
    if (prefill) {
      setConteudo(prefill.conteudo);
      if (["vendavel", "divulgacao", "ambos"].includes(prefill.objetivo)) {
        setObjetivo(prefill.objetivo as Objetivo);
      }
      if (prefill.projetoId && prefill.projetoNome) {
        setOrigemProjeto({ id: prefill.projetoId, nome: prefill.projetoNome });
      }
    }
    setSalvas(carregarAnalises());
    setCarregadoSalvas(true);
  }, []);

  useEffect(() => {
    if (carregadoSalvas) salvarAnalises(salvas);
  }, [salvas, carregadoSalvas]);

  function adicionarArquivos(lista: FileList | null) {
    if (!lista || lista.length === 0) return;
    setAvisoArquivo(null);
    setArquivos((atual) => {
      const combinados = [...atual];
      let total = combinados.reduce((s, f) => s + f.size, 0);
      for (const f of Array.from(lista)) {
        if (combinados.length >= MAX_ARQUIVOS) {
          setAvisoArquivo(`Máximo de ${MAX_ARQUIVOS} arquivos.`);
          break;
        }
        if (f.size > MAX_ARQUIVO_BYTES) {
          setAvisoArquivo(`"${f.name}" passa de 4 MB e foi ignorado.`);
          continue;
        }
        if (combinados.some((x) => x.name === f.name && x.size === f.size)) continue;
        if (total + f.size > MAX_TOTAL_BYTES) {
          setAvisoArquivo(
            `Limite de 4 MB somando os anexos (evita erro no envio). "${f.name}" ficou de fora.`,
          );
          continue;
        }
        combinados.push(f);
        total += f.size;
      }
      return combinados;
    });
    if (inputArquivo.current) inputArquivo.current.value = "";
  }

  function removerArquivo(i: number) {
    setArquivos((atual) => atual.filter((_, idx) => idx !== i));
  }

  async function analisar(e: React.FormEvent) {
    e.preventDefault();
    if (conteudo.trim().length < 3 && arquivos.length === 0) return;

    const nomes = arquivos.map((a) => a.name);
    const primeiraLinha = conteudo.trim().split("\n").find(Boolean);
    const titulo = (primeiraLinha || nomes[0] || "Análise").slice(0, 60);

    setCarregando(true);
    setErro(null);
    setResultado(null);
    setJaSalva(false);

    try {
      const fd = new FormData();
      fd.append("conteudo", conteudo);
      if (link.trim()) fd.append("link", link.trim());
      fd.append("objetivo", objetivo);
      if (publico.trim()) fd.append("publico", publico.trim());
      if (tom.trim()) fd.append("tom", tom.trim());
      for (const f of arquivos) fd.append("arquivos", f);

      const resp = await fetch("/api/marketing", { method: "POST", body: fd });
      const dados = await resp.json();
      if (!resp.ok) {
        setErro(dados?.erro || "Não foi possível analisar agora.");
      } else {
        setResultado(dados as ResultadoMarketing);
        setSnapshot({
          titulo,
          entrada: {
            objetivo,
            publico: publico.trim() || undefined,
            tom: tom.trim() || undefined,
            link: link.trim() || undefined,
            arquivos: nomes.length ? nomes : undefined,
          },
        });
      }
    } catch {
      setErro("Falha de conexão. Tente novamente.");
    } finally {
      setCarregando(false);
    }
  }

  function salvarAtual() {
    if (!resultado || !snapshot || jaSalva) return;
    const nova: AnaliseSalva = {
      id: novoId(),
      titulo: snapshot.titulo,
      criadoEm: new Date().toISOString(),
      projetoId: origemProjeto?.id,
      projetoNome: origemProjeto?.nome,
      entrada: snapshot.entrada,
      resultado,
    };
    setSalvas((atual) => [nova, ...atual]);
    setJaSalva(true);
  }

  function abrirSalva(a: AnaliseSalva) {
    setResultado(a.resultado);
    setSnapshot({ titulo: a.titulo, entrada: a.entrada });
    setJaSalva(true);
    setErro(null);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function excluirSalva(id: string) {
    setSalvas((atual) => atual.filter((a) => a.id !== id));
    if (editandoId === id) setEditandoId(null);
  }

  function iniciarRenome(a: AnaliseSalva) {
    setEditandoId(a.id);
    setTituloEdit(a.titulo);
  }

  function confirmarRenome(id: string) {
    const novo = tituloEdit.trim();
    if (novo) {
      setSalvas((atual) => atual.map((a) => (a.id === id ? { ...a, titulo: novo } : a)));
    }
    setEditandoId(null);
  }

  const termoBusca = normBusca(buscaHist.trim());
  const salvasFiltradas = termoBusca
    ? salvas.filter((a) => {
        const alvo = normBusca(
          [a.titulo, a.projetoNome ?? "", OBJETIVO_INFO[a.entrada.objetivo].label].join(" "),
        );
        return alvo.includes(termoBusca);
      })
    : salvas;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,380px)_1fr]">
      {/* coluna esquerda: formulário + histórico */}
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Análise de Marketing</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Envie um material (texto, ideia, oferta, post ou arquivo). O sistema lê, resume,
            diagnostica o que falta e devolve as recomendações do seu objetivo — tudo dentro
            do app, sem IA e sem enviar nada para fora.
          </p>
          {origemProjeto && (
            <div className="mt-2 flex items-center gap-2">
              <span className="badge" style={{ borderColor: "var(--brand)", color: "var(--brand)" }}>
                🔗 Vinculada à ideia: {origemProjeto.nome}
              </span>
              <button
                type="button"
                className="text-xs text-[var(--muted)] hover:text-[var(--danger)]"
                onClick={() => setOrigemProjeto(null)}
                title="Desvincular da ideia"
              >
                desvincular
              </button>
            </div>
          )}
        </div>

        <form onSubmit={analisar} className="card space-y-3 p-4">
          <label className="block text-xs font-medium text-[var(--muted)]">
            O que você quer analisar?
            <textarea
              className="input mt-1 min-h-[130px] resize-y"
              placeholder="Cole ou escreva aqui: uma oferta, um texto, a descrição de um produto, um roteiro de post... (ou envie só um arquivo)"
              value={conteudo}
              onChange={(e) => setConteudo(e.target.value)}
            />
          </label>

          {/* anexos */}
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[var(--muted)]">
                Anexos (PDF de texto, .txt, .md, .csv)
              </span>
              <button
                type="button"
                className="btn btn-ghost !px-2.5 !py-1 !text-xs"
                onClick={() => inputArquivo.current?.click()}
              >
                + Anexar
              </button>
            </div>
            <input
              ref={inputArquivo}
              type="file"
              multiple
              accept={ACEITA}
              className="hidden"
              onChange={(e) => adicionarArquivos(e.target.files)}
            />
            {arquivos.length > 0 && (
              <ul className="mt-2 space-y-1.5">
                {arquivos.map((f, i) => (
                  <li
                    key={i}
                    className="flex items-center justify-between gap-2 rounded-lg bg-[var(--surface-2)] px-2.5 py-1.5 text-xs"
                  >
                    <span className="truncate">
                      📎 {f.name}{" "}
                      <span className="text-[var(--muted)]">({formatarBytes(f.size)})</span>
                    </span>
                    <button
                      type="button"
                      className="shrink-0 text-[var(--muted)] hover:text-[var(--danger)]"
                      onClick={() => removerArquivo(i)}
                    >
                      remover
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {avisoArquivo && (
              <p className="mt-1 text-xs" style={{ color: "var(--danger)" }}>
                {avisoArquivo}
              </p>
            )}
          </div>

          <label className="block text-xs font-medium text-[var(--muted)]">
            Link (opcional — fica registrado e vira destino de CTA; não é aberto)
            <input
              className="input mt-1"
              placeholder="https://..."
              value={link}
              onChange={(e) => setLink(e.target.value)}
            />
          </label>

          <label className="block text-xs font-medium text-[var(--muted)]">
            Qual é o objetivo?
            <select
              className="input mt-1"
              value={objetivo}
              onChange={(e) => setObjetivo(e.target.value as Objetivo)}
            >
              {(Object.keys(OBJETIVO_INFO) as Objetivo[]).map((o) => (
                <option key={o} value={o}>
                  {OBJETIVO_INFO[o].label} — {OBJETIVO_INFO[o].descricao}
                </option>
              ))}
            </select>
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-medium text-[var(--muted)]">
              Público-alvo (opcional)
              <input
                className="input mt-1"
                placeholder="ex.: indústrias, revendas..."
                value={publico}
                onChange={(e) => setPublico(e.target.value)}
              />
            </label>
            <label className="block text-xs font-medium text-[var(--muted)]">
              Tom (opcional)
              <input
                className="input mt-1"
                placeholder="ex.: técnico, próximo..."
                value={tom}
                onChange={(e) => setTom(e.target.value)}
              />
            </label>
          </div>

          <button
            type="submit"
            className="btn btn-primary w-full"
            disabled={carregando || (conteudo.trim().length < 3 && arquivos.length === 0)}
          >
            {carregando ? "Analisando…" : "Analisar 🔎"}
          </button>
        </form>

        {erro && (
          <div className="card border-l-4 p-3 text-sm" style={{ borderLeftColor: "var(--danger)" }}>
            {erro}
          </div>
        )}

        {/* histórico */}
        <div className="card p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Histórico de análises</h2>
            {salvas.length > 0 && (
              <span className="text-[11px] text-[var(--muted)]">
                {termoBusca ? `${salvasFiltradas.length}/${salvas.length}` : salvas.length}
              </span>
            )}
          </div>
          {salvas.length > 0 && (
            <input
              className="input mt-2 !py-1.5 !text-xs"
              placeholder="Buscar por título, ideia ou objetivo..."
              value={buscaHist}
              onChange={(e) => setBuscaHist(e.target.value)}
            />
          )}
          {salvas.length === 0 ? (
            <p className="mt-2 text-xs text-[var(--muted)]">
              Nenhuma análise salva ainda. Ao analisar, use “Salvar” para guardar aqui.
            </p>
          ) : salvasFiltradas.length === 0 ? (
            <p className="mt-2 text-xs text-[var(--muted)]">
              Nada encontrado para “{buscaHist.trim()}”.
            </p>
          ) : (
            <ul className="mt-2 space-y-2">
              {salvasFiltradas.map((a) => (
                <li key={a.id} className="rounded-lg bg-[var(--surface-2)] p-2.5">
                  <div className="flex items-start justify-between gap-2">
                    {editandoId === a.id ? (
                      <input
                        autoFocus
                        className="input !py-1 !text-sm"
                        value={tituloEdit}
                        onChange={(e) => setTituloEdit(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") confirmarRenome(a.id);
                          if (e.key === "Escape") setEditandoId(null);
                        }}
                      />
                    ) : (
                      <button
                        className="text-left text-sm font-medium leading-snug hover:underline"
                        onClick={() => abrirSalva(a)}
                      >
                        {a.titulo || "Análise"}
                      </button>
                    )}
                    <div className="flex shrink-0 gap-1.5 text-xs text-[var(--muted)]">
                      {editandoId === a.id ? (
                        <>
                          <button
                            className="hover:text-[var(--brand)]"
                            onClick={() => confirmarRenome(a.id)}
                          >
                            salvar
                          </button>
                          <button className="hover:text-[var(--foreground)]" onClick={() => setEditandoId(null)}>
                            cancelar
                          </button>
                        </>
                      ) : (
                        <>
                          <button className="hover:text-[var(--foreground)]" onClick={() => iniciarRenome(a)}>
                            renomear
                          </button>
                          <button
                            className="hover:text-[var(--danger)]"
                            onClick={() => excluirSalva(a.id)}
                          >
                            excluir
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-[var(--muted)]">
                    <span className="badge !py-0">{OBJETIVO_INFO[a.entrada.objetivo].label}</span>
                    <span>{new Date(a.criadoEm).toLocaleString("pt-BR")}</span>
                    {a.entrada.arquivos?.length ? (
                      <span>· 📎 {a.entrada.arquivos.length}</span>
                    ) : null}
                    {typeof a.resultado.diagnostico?.pontuacao === "number" && (
                      <span className="badge !py-0">{a.resultado.diagnostico.pontuacao}/100</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* coluna direita: resultado */}
      <div>
        {carregando && (
          <div className="card grid place-items-center gap-3 p-10 text-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--brand)]" />
            <p className="text-sm text-[var(--muted)]">Lendo e analisando o material…</p>
          </div>
        )}

        {!carregando && !resultado && (
          <div className="card grid h-full min-h-[220px] place-items-center p-10 text-center text-sm text-[var(--muted)]">
            A análise vai aparecer aqui.
          </div>
        )}

        {!carregando && resultado && (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="truncate text-lg font-semibold">
                {snapshot?.titulo || "Análise"}
              </h2>
              <button
                className="btn btn-primary shrink-0 !py-1.5"
                onClick={salvarAtual}
                disabled={jaSalva}
              >
                {jaSalva ? "✓ Salva" : "Salvar"}
              </button>
            </div>
            <MarketingResultView r={resultado} titulo={snapshot?.titulo} />
          </div>
        )}
      </div>
    </div>
  );
}
