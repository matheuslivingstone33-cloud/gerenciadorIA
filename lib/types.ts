// Tipos compartilhados entre o painel de projetos e a análise de marketing.

export type ProjectStatus = "ideia" | "andamento" | "pausado" | "concluido";
export type Objetivo = "vendavel" | "divulgacao" | "ambos";

export interface Ideia {
  id: string;
  texto: string;
  criadoEm: string;
}

export interface Projeto {
  id: string;
  nome: string;
  descricao: string;
  status: ProjectStatus;
  objetivo: Objetivo;
  ideias: Ideia[];
  criadoEm: string;
  atualizadoEm: string;
}

export const STATUS_INFO: Record<ProjectStatus, { label: string; cor: string }> = {
  ideia: { label: "Ideia", cor: "#7c3aed" },
  andamento: { label: "Em andamento", cor: "#0ea5a4" },
  pausado: { label: "Pausado", cor: "#d97706" },
  concluido: { label: "Concluído", cor: "#16a34a" },
};

export const OBJETIVO_INFO: Record<Objetivo, { label: string; descricao: string }> = {
  vendavel: { label: "Vendável", descricao: "Foco em conversão e venda" },
  divulgacao: { label: "Divulgação", descricao: "Foco em alcance e reconhecimento" },
  ambos: { label: "Ambos", descricao: "Vender e divulgar ao mesmo tempo" },
};

// ---- Análise de Marketing ----

export interface EntradaMarketing {
  conteudo: string;
  link?: string;
  objetivo: Objetivo;
  publico?: string;
  tom?: string;
}

export interface FonteMarketing {
  titulo: string;
  url: string;
}

// Diagnóstico: checklist do que o material já tem e do que falta.
export interface ItemDiagnostico {
  ok: boolean;
  titulo: string;
  dica?: string;
}

export interface Diagnostico {
  pontuacao: number; // 0-100
  itens: ItemDiagnostico[];
}

export interface Metricas {
  palavras: number;
  frases: number;
  mediaPalavrasFrase: number;
  tempoLeituraSeg: number;
  legibilidade: "fácil" | "média" | "difícil";
  perfil: "b2b" | "b2c" | "misto";
}

export interface ResultadoMarketing {
  modo: "local";
  resumo: string;
  pontosChave: string[];
  analise: string;
  diagnostico?: Diagnostico;
  metricas?: Metricas;
  titulos?: string[];
  // Trilha "vendável"
  propostaValor?: string;
  gatilhos?: string[];
  objecoes?: string[];
  cta?: string[];
  // Trilha "divulgação"
  ganchos?: string[];
  canais?: string[];
  formatos?: string[];
  // Comum
  ideiasConteudo: string[];
  hashtags: string[];
  palavrasChave: string[];
  proximosPassos: string[];
  fontes?: FonteMarketing[];
  aviso?: string;
}

// ---- Histórico de análises salvas ----

export interface EntradaResumo {
  objetivo: Objetivo;
  publico?: string;
  tom?: string;
  link?: string;
  arquivos?: string[];
}

export interface AnaliseSalva {
  id: string;
  titulo: string;
  criadoEm: string;
  projetoId?: string;
  projetoNome?: string;
  entrada: EntradaResumo;
  resultado: ResultadoMarketing;
}
