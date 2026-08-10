// Persistência simples no navegador (localStorage). Sem banco de dados —
// suficiente para o MVP e zero configuração. Dá pra evoluir pra um backend depois.

import type { AnaliseSalva, Projeto } from "./types";

const CHAVE_PROJETOS = "sextafeira:projetos";
const CHAVE_PREFILL = "sextafeira:marketing-prefill";
const CHAVE_ANALISES = "sextafeira:analises";

export function carregarProjetos(): Projeto[] {
  if (typeof window === "undefined") return [];
  try {
    const bruto = window.localStorage.getItem(CHAVE_PROJETOS);
    if (!bruto) return [];
    const dados = JSON.parse(bruto);
    return Array.isArray(dados) ? (dados as Projeto[]) : [];
  } catch {
    return [];
  }
}

export function salvarProjetos(projetos: Projeto[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CHAVE_PROJETOS, JSON.stringify(projetos));
}

// Handoff do Painel para a aba de Marketing: guarda o que analisar e
// a página de marketing lê ao abrir.
export interface PrefillMarketing {
  conteudo: string;
  objetivo: string;
  projetoId?: string;
  projetoNome?: string;
}

export function definirPrefillMarketing(dados: PrefillMarketing): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CHAVE_PREFILL, JSON.stringify(dados));
}

export function lerEConsumirPrefill(): PrefillMarketing | null {
  if (typeof window === "undefined") return null;
  const bruto = window.localStorage.getItem(CHAVE_PREFILL);
  if (!bruto) return null;
  window.localStorage.removeItem(CHAVE_PREFILL);
  try {
    return JSON.parse(bruto) as PrefillMarketing;
  } catch {
    return null;
  }
}

// ---- Histórico de análises de marketing ----

export function carregarAnalises(): AnaliseSalva[] {
  if (typeof window === "undefined") return [];
  try {
    const bruto = window.localStorage.getItem(CHAVE_ANALISES);
    if (!bruto) return [];
    const dados = JSON.parse(bruto);
    return Array.isArray(dados) ? (dados as AnaliseSalva[]) : [];
  } catch {
    return [];
  }
}

export function salvarAnalises(analises: AnaliseSalva[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CHAVE_ANALISES, JSON.stringify(analises));
}

// ID curto e único o suficiente para uso local.
export function novoId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}
