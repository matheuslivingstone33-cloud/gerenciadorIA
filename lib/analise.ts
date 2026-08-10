// Motor de análise de marketing 100% local.
//
// Roda dentro do próprio app: sem IA, sem chave, sem internet, sem serviço de
// terceiros. É baseado em regras — extrai os termos centrais, mede o texto,
// detecta o que já existe e o que falta (CTA, prova, preço, contato, urgência)
// e monta resumo, diagnóstico e recomendações a partir desses achados.

import type {
  Diagnostico,
  EntradaMarketing,
  ItemDiagnostico,
  Metricas,
  Objetivo,
  ResultadoMarketing,
} from "./types";

// ---------------------------------------------------------------- utilidades

const STOPWORDS = new Set(
  (
    "a o e de da do das dos que em para com por um uma uns umas no na nos nas ao aos " +
    "as os se sua seu suas seus como mais mas ou seja pra pro sobre entre sem ate ja " +
    "isso este esta esse essa aquele aquela nao sim ser foi sao tambem depois antes " +
    "quando onde qual quais quem tem ter muito muita muitos muitas pouco pouca todos " +
    "todas toda todo cada nossa nosso nossas nossos vc voce vcs voces nos eles elas " +
    "ele ela lhe meu minha meus minhas dele dela deles delas esses essas estes estas " +
    "pelo pela pelos pelas nem porque pois qualquer outro outra outros outras mesmo " +
    "mesma assim ainda entao apenas cerca desde durante enquanto embora logo talvez " +
    "aqui ali agora hoje sempre nunca bem melhor pior tudo nada algo alguem alguma " +
    "algum estar esta estao sendo sido foram sera serao havia tinha tinham fazer feito " +
    "faz fez pode podem podera deve devem the of and to in for you your with from this " +
    "that are was our will can have has"
  ).split(/\s+/),
);

function semAcento(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function normalizar(s: string): string {
  return semAcento(s.toLowerCase());
}

function contarPalavras(texto: string): number {
  return texto.trim().split(/\s+/).filter(Boolean).length;
}

function separarFrases(texto: string): string[] {
  return texto
    .split(/(?<=[.!?…])\s+|\n+/)
    .map((f) => f.replace(/\s+/g, " ").trim())
    .filter((f) => f.length > 1);
}

function unico(lista: string[]): string[] {
  return [...new Set(lista.filter(Boolean))];
}

function maiuscula(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Forma para usar no meio de uma frase. Um termo que só apareceu no começo de
 * uma frase vem capitalizado ("Lançamento") e ficaria estranho no meio; siglas
 * e nomes com maiúscula interna (GML, X-200, iPhone) são preservados.
 */
function paraMeio(s: string): string {
  if (s === s.toUpperCase()) return s;
  if (/.[A-ZÀ-Ú0-9]/.test(s.slice(1))) return s;
  return s.charAt(0).toLowerCase() + s.slice(1);
}

// ------------------------------------------------------------ termos centrais

interface Termos {
  /** Termos na grafia original do material, do mais relevante para o menos. */
  lista: string[];
  /** Frequência por termo normalizado — usada para pontuar as frases. */
  pesos: Map<string, number>;
}

function extrairTermos(texto: string, limite = 10): Termos {
  const brutas = texto.split(/[^\p{L}\p{N}#]+/u).filter(Boolean);
  const norm = brutas.map(normalizar);

  const uni = new Map<string, { n: number; formas: Map<string, number> }>();
  const registrar = (chave: string, forma: string, mapa: typeof uni) => {
    const atual = mapa.get(chave) ?? { n: 0, formas: new Map<string, number>() };
    atual.n++;
    atual.formas.set(forma, (atual.formas.get(forma) ?? 0) + 1);
    mapa.set(chave, atual);
  };

  const relevante = (t: string) => t.length >= 4 && !STOPWORDS.has(t) && !/^\d+$/.test(t);

  for (let i = 0; i < norm.length; i++) {
    if (!relevante(norm[i])) continue;
    registrar(norm[i], brutas[i], uni);
  }

  // Bigramas: duas palavras relevantes seguidas ("válvula industrial").
  const bi = new Map<string, { n: number; formas: Map<string, number> }>();
  for (let i = 0; i < norm.length - 1; i++) {
    if (!relevante(norm[i]) || !relevante(norm[i + 1])) continue;
    registrar(`${norm[i]} ${norm[i + 1]}`, `${brutas[i]} ${brutas[i + 1]}`, bi);
  }

  const pesos = new Map<string, number>();
  for (const [chave, { n }] of uni) pesos.set(chave, n);

  const melhorForma = (formas: Map<string, number>): string =>
    [...formas.entries()].sort((a, b) => b[1] - a[1])[0][0];

  // Bigrama repetido vale mais que a soma das partes: ele carrega o assunto.
  // O comprimento entra como desempate — em texto curto tudo aparece 1x, e aí
  // "pressão" diz mais sobre o assunto do que "nova".
  const candidatos = [
    ...[...bi.entries()]
      .filter(([, v]) => v.n >= 2)
      .map(([chave, v]) => ({ chave, score: v.n * 2.4, forma: melhorForma(v.formas) })),
    ...[...uni.entries()].map(([chave, v]) => ({
      chave,
      score: v.n + Math.min(chave.length, 14) / 30,
      forma: melhorForma(v.formas),
    })),
  ].sort((a, b) => b.score - a.score);

  const escolhidos: string[] = [];
  const consumidos = new Set<string>();
  for (const c of candidatos) {
    if (escolhidos.length >= limite) break;
    const partes = c.chave.split(" ");
    if (partes.some((p) => consumidos.has(p))) continue;
    partes.forEach((p) => consumidos.add(p));
    escolhidos.push(c.forma);
  }

  return { lista: escolhidos, pesos };
}

// ------------------------------------------------------- resumo (extrativo)

function resumir(frases: string[], pesos: Map<string, number>, max = 3): string {
  if (frases.length === 0) return "";
  if (frases.length <= max) return frases.join(" ");

  const notas = frases.map((f, i) => {
    const tokens = normalizar(f).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
    const soma = tokens.reduce((acc, t) => acc + (pesos.get(t) ?? 0), 0);
    const densidade = soma / Math.sqrt(Math.max(tokens.length, 1));
    // A abertura costuma anunciar o assunto; frases muito curtas raramente resumem.
    const bonus = i === 0 ? 1.35 : i === 1 ? 1.1 : 1;
    const penalidade = tokens.length < 5 ? 0.5 : 1;
    return { i, nota: densidade * bonus * penalidade };
  });

  return notas
    .sort((a, b) => b.nota - a.nota)
    .slice(0, max)
    .sort((a, b) => a.i - b.i)
    .map((n) => frases[n.i])
    .join(" ");
}

// ------------------------------------------------------------------- sinais

interface Sinais {
  cta: boolean;
  contato: boolean;
  prova: boolean;
  numeros: boolean;
  preco: boolean;
  urgencia: boolean;
  beneficio: boolean;
  pergunta: boolean;
  hashtags: string[];
  excessoCaps: boolean;
  perfil: "b2b" | "b2c" | "misto";
}

const RE = {
  cta: /\b(compre|comprar|adquira|fale|falar|solicite|solicitar|pe[cç]a|pedir|agende|agendar|clique|acesse|garanta|chame|contate|cadastre|assine|baixe|inscreva|or[cç]amento|saiba mais|entre em contato)\b/,
  contato: /(whatsapp|whats|zap|telefone|\(\d{2}\)|\b\d{4,5}-?\d{4}\b|@[a-z0-9._-]+\.[a-z]{2,}|https?:\/\/|www\.)/,
  prova: /\b(cliente|clientes|depoimento|caso de|estudo de caso|resultado|resultados|anos de|desde \d{4}|certificad\w*|iso\s?\d+|garantia|refer[eê]ncia|parceir\w*|atendemos|entregamos|j[aá] ajudamos)\b/,
  numeros: /(\d+\s?%|r\$\s?\d|\b\d{2,}\b)/,
  // "orçamento" fica de fora de propósito: é chamada para ação, não preço.
  preco: /(r\$|\bpre[cç]o\b|\bvalores?\b|\binvestimento\b|\bcusta\b|\bcusto\b|\bparcel\w*|\bgr[aá]tis\b|\ba partir de\b)/,
  urgencia: /\b(hoje|agora|[uú]ltim\w+|prazo|limitad\w+|s[oó] at[eé]|termina|vagas|lote|promo[cç][aã]o|desconto|corra)\b/,
  beneficio:
    /\b(economi\w+|reduz\w*|aumenta\w*|ganha\w*|evita\w*|melhora\w*|r[aá]pid\w+|seguran[cç]a|durabilidade|produtividade|facilita\w*|resolve\w*|sem dor|sem risco)\b/,
  b2b: /\b(ind[uú]stria\w*|industrial|f[aá]brica|fabricante|fornecedor\w*|engenharia|manuten[cç][aã]o|equipamento\w*|especifica[cç][aã]o|t[eé]cnic\w+|licita[cç][aã]o|contrato|empresa\w*|corporativ\w+|b2b|revenda\w*|distribuidor\w*|projeto\w*|montagem|inox|a[cç]o\b|v[aá]lvula\w*)\b/,
  b2c: /\b(loja|delivery|moda|beleza|est[eé]tica|curso|aula|receita|casa|fam[ií]lia|crian[cç]a\w*|pet|academia|viagem|festa|presente|frete|cupom|assinatura|app)\b/,
};

function detectarSinais(texto: string): Sinais {
  const n = normalizar(texto);
  const palavras = texto.split(/\s+/).filter(Boolean);
  const caps = palavras.filter((p) => p.length > 3 && p === p.toUpperCase() && /[A-ZÀ-Ú]/.test(p));

  const pontosB2b = (n.match(new RegExp(RE.b2b, "g")) ?? []).length;
  const pontosB2c = (n.match(new RegExp(RE.b2c, "g")) ?? []).length;
  const perfil: Sinais["perfil"] =
    pontosB2b >= pontosB2c * 2 && pontosB2b > 0
      ? "b2b"
      : pontosB2c >= pontosB2b * 2 && pontosB2c > 0
        ? "b2c"
        : "misto";

  return {
    cta: RE.cta.test(n),
    contato: RE.contato.test(n),
    prova: RE.prova.test(n),
    numeros: RE.numeros.test(n),
    preco: RE.preco.test(n),
    urgencia: RE.urgencia.test(n),
    beneficio: RE.beneficio.test(n),
    pergunta: texto.includes("?"),
    hashtags: unico((texto.match(/#[\p{L}\p{N}_]+/gu) ?? []).map((h) => h.toLowerCase())),
    excessoCaps: palavras.length > 12 && caps.length / palavras.length > 0.15,
    perfil,
  };
}

// ---------------------------------------------------------------- diagnóstico

function montarDiagnostico(
  s: Sinais,
  m: Metricas,
  e: EntradaMarketing,
  querVender: boolean,
  querDivulgar: boolean,
  primeiraFrase: string,
): Diagnostico {
  const itens: ItemDiagnostico[] = [];

  itens.push({
    ok: m.palavras >= 40,
    titulo:
      m.palavras >= 40
        ? `Material com conteúdo suficiente para analisar (${m.palavras} palavras)`
        : `Material curto (${m.palavras} palavras)`,
    dica:
      m.palavras >= 40
        ? undefined
        : "Descreva o que é, para quem serve e o que a pessoa ganha — com isso a leitura fica muito mais precisa.",
  });

  itens.push({
    ok: !!e.publico,
    titulo: e.publico ? `Público definido: ${e.publico}` : "Público-alvo não informado",
    dica: e.publico
      ? undefined
      : "Preencha o campo de público. Toda a mensagem muda quando você sabe para quem está falando.",
  });

  itens.push({
    ok: s.beneficio,
    titulo: s.beneficio
      ? "Fala em benefício (o que a pessoa ganha), não só em características"
      : "Só descreve características — falta o benefício",
    dica: s.beneficio
      ? undefined
      : "Para cada característica, escreva o \"…isso significa que você…\" correspondente.",
  });

  itens.push({
    ok: m.mediaPalavrasFrase <= 24,
    titulo:
      m.mediaPalavrasFrase <= 24
        ? `Frases em tamanho confortável (média de ${m.mediaPalavrasFrase} palavras)`
        : `Frases longas demais (média de ${m.mediaPalavrasFrase} palavras)`,
    dica:
      m.mediaPalavrasFrase <= 24
        ? undefined
        : "Quebre as frases: uma ideia por frase, no máximo ~20 palavras.",
  });

  if (querVender) {
    itens.push({
      ok: s.cta,
      titulo: s.cta ? "Tem chamada para ação (CTA)" : "Sem chamada para ação",
      dica: s.cta ? undefined : "Termine dizendo exatamente o que fazer: pedir orçamento, chamar no WhatsApp, agendar.",
    });
    itens.push({
      ok: s.contato || !!e.link,
      titulo: s.contato || e.link ? "Tem caminho de contato (telefone, link ou perfil)" : "Não mostra como entrar em contato",
      dica: s.contato || e.link ? undefined : "Deixe WhatsApp, telefone ou link visível no final — e repita no começo.",
    });
    itens.push({
      ok: s.prova || s.numeros,
      titulo: s.prova || s.numeros ? "Traz prova (casos, números ou tempo de mercado)" : "Sem nenhuma prova concreta",
      dica: s.prova || s.numeros ? undefined : "Inclua um número, um cliente atendido ou um resultado real. Prova vale mais que adjetivo.",
    });
    itens.push({
      ok: s.preco,
      titulo: s.preco ? "Toca no assunto preço/investimento" : "Não fala nada sobre preço",
      dica: s.preco
        ? undefined
        : 'Dê pelo menos uma faixa ("a partir de…") ou explique o que define o valor. Silêncio total sobre preço afasta.',
    });
    itens.push({
      ok: s.urgencia,
      titulo: s.urgencia ? "Dá um motivo para agir agora" : "Sem motivo para decidir agora",
      dica: s.urgencia ? undefined : "Um prazo, um lote, uma condição do mês — algo concreto, sem inventar escassez falsa.",
    });
  }

  if (querDivulgar) {
    const abertura = contarPalavras(primeiraFrase);
    itens.push({
      ok: abertura > 0 && abertura <= 14,
      titulo:
        abertura > 0 && abertura <= 14
          ? `Abertura curta e direta (${abertura} palavras)`
          : "A primeira frase não segura a atenção",
      dica:
        abertura > 0 && abertura <= 14
          ? undefined
          : "Comece com uma frase de até ~12 palavras: um dado, uma pergunta ou o problema do público.",
    });
    itens.push({
      ok: s.pergunta,
      titulo: s.pergunta ? "Conversa com o leitor (faz pergunta)" : "Não convida o leitor a responder",
      dica: s.pergunta ? undefined : "Uma pergunta bem colocada aumenta comentário e resposta — e alcance vem daí.",
    });
    itens.push({
      ok: s.hashtags.length > 0,
      titulo: s.hashtags.length > 0 ? `Já usa hashtags (${s.hashtags.length})` : "Sem hashtags",
      dica: s.hashtags.length > 0 ? undefined : "Use 3 a 6 hashtags do assunto — as sugeridas abaixo servem de ponto de partida.",
    });
    itens.push({
      ok: !s.excessoCaps,
      titulo: s.excessoCaps ? "Excesso de MAIÚSCULAS" : "Uso equilibrado de maiúsculas",
      dica: s.excessoCaps ? "Caixa alta demais cansa e parece spam. Destaque com quebra de linha e emoji, não gritando." : undefined,
    });
  }

  const ok = itens.filter((i) => i.ok).length;
  return { pontuacao: Math.round((ok / itens.length) * 100), itens };
}

// ---------------------------------------------------------------- sugestões

function gerarTitulos(termos: string[], publico: string | undefined, querVender: boolean): string[] {
  const t1 = termos[0] ? paraMeio(termos[0]) : undefined;
  if (!t1) return [];
  const t2 = termos[1] ? paraMeio(termos[1]) : undefined;
  const alvo = publico?.trim();
  const paraQuem = alvo ? ` para ${alvo}` : "";

  const base = [
    `Como escolher ${t1} sem errar: o que olhar antes de fechar`,
    `3 erros comuns em ${t1} — e como evitar`,
    t2 ? `${maiuscula(t1)} e ${t2}: o que realmente muda no resultado` : `${maiuscula(t1)} na prática: o que muda no resultado`,
    `Checklist rápido de ${t1}${paraQuem}`,
  ];

  const venda = [
    `${maiuscula(t1)}${paraQuem}: peça seu orçamento hoje`,
    `Quanto custa ${t1}? O que entra no preço (e o que não entra)`,
  ];

  const alcance = [
    `Bastidores: como fazemos ${t1} por aqui`,
    `Antes e depois: ${t1} resolvendo um problema real`,
  ];

  return unico([...base, ...(querVender ? venda : alcance)]).slice(0, 6);
}

function gerarIdeias(termos: string[], s: Sinais, publico?: string): string[] {
  const t1 = termos[0] ? paraMeio(termos[0]) : "o seu produto";
  const t2 = termos[1] ? paraMeio(termos[1]) : t1;
  const alvo = publico?.trim() || (s.perfil === "b2b" ? "quem compra na empresa" : "seu público");

  const ideias = [
    `Carrossel: "3 coisas que ${alvo} sempre pergunta sobre ${t1}" — uma tela por pergunta, resposta curta.`,
    `Vídeo de 45s mostrando ${t1} em uso real, com a legenda dizendo o problema que ele resolve.`,
    `Post comparativo: ${t1} vs. a solução improvisada que ${alvo} usa hoje — o custo escondido da segunda.`,
    `Estudo de caso curto: problema → o que foi feito com ${t2} → resultado em número.`,
    `Perguntas & respostas: junte as 5 dúvidas mais frequentes de ${alvo} e responda em texto direto.`,
  ];

  if (!s.prova) {
    ideias.push(`Depoimento de cliente em formato de história (situação, dúvida, decisão, resultado) sobre ${t1}.`);
  }
  if (s.perfil === "b2b") {
    ideias.push(`Ficha técnica de 1 página de ${t1}: especificação, prazo, garantia e contato — pronta para enviar por e-mail.`);
  } else {
    ideias.push(`Story com enquete: "qual sua maior dificuldade com ${t1}?" e responda cada voto no dia seguinte.`);
  }

  return ideias.slice(0, 6);
}

function dominio(link?: string): string | null {
  if (!link) return null;
  try {
    return new URL(link.startsWith("http") ? link : `https://${link}`).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

// -------------------------------------------------------------------- motor

export function analisar(entrada: EntradaMarketing): ResultadoMarketing {
  const { conteudo, objetivo, publico, tom, link } = entrada;
  const texto = conteudo.trim();

  const frases = separarFrases(texto);
  const { lista: termos, pesos } = extrairTermos(texto);
  const sinais = detectarSinais(texto);

  const numPalavras = contarPalavras(texto);
  const mediaPalavrasFrase = frases.length ? Math.round(numPalavras / frases.length) : numPalavras;
  const tempoLeituraSeg = Math.max(5, Math.round((numPalavras / 200) * 60));
  const legibilidade: Metricas["legibilidade"] =
    mediaPalavrasFrase <= 16 ? "fácil" : mediaPalavrasFrase <= 24 ? "média" : "difícil";

  const metricas: Metricas = {
    palavras: numPalavras,
    frases: frases.length,
    mediaPalavrasFrase,
    tempoLeituraSeg,
    legibilidade,
    perfil: sinais.perfil,
  };

  const querVender = objetivo === "vendavel" || objetivo === "ambos";
  const querDivulgar = objetivo === "divulgacao" || objetivo === "ambos";
  const diagnostico = montarDiagnostico(sinais, metricas, entrada, querVender, querDivulgar, frases[0] ?? "");

  const t1 = termos[0] ? paraMeio(termos[0]) : undefined;
  const t2 = termos[1] ? paraMeio(termos[1]) : undefined;
  const dom = dominio(link);

  // ---- resumo e leitura ----
  const resumo =
    resumir(frases, pesos, numPalavras > 350 ? 3 : 2) ||
    "O material enviado é curto demais para um resumo — a análise abaixo usa o que foi possível extrair.";

  const pontosChave = [
    `Tamanho: ${numPalavras} palavras em ${frases.length} frase(s) — cerca de ${
      tempoLeituraSeg < 60 ? `${tempoLeituraSeg}s` : `${Math.round(tempoLeituraSeg / 60)} min`
    } de leitura (leitura ${legibilidade}).`,
    termos.length
      ? `Assunto central pelos termos que mais aparecem: ${termos.slice(0, 5).join(", ")}.`
      : "Nenhum termo se repete o bastante para indicar um assunto central — o texto está disperso.",
    `Perfil da linguagem: ${
      sinais.perfil === "b2b"
        ? "técnica / B2B (empresa vendendo para empresa)"
        : sinais.perfil === "b2c"
          ? "consumo direto / B2C (falando com o cliente final)"
          : "misto — nem claramente técnico, nem claramente popular"
    }.`,
    `O texto ${sinais.cta ? "tem" : "não tem"} chamada para ação, ${
      sinais.prova || sinais.numeros ? "traz" : "não traz"
    } prova concreta e ${sinais.preco ? "menciona" : "não menciona"} preço.`,
    publico ? `Público informado: ${publico}.` : "Público-alvo não informado no formulário.",
    tom ? `Tom pedido: ${tom}.` : `Tom não informado — as sugestões seguem o tom do próprio material.`,
  ];
  if (dom) pontosChave.push(`Link registrado: ${dom} (não é aberto — o sistema não acessa a internet).`);
  if (sinais.hashtags.length) pontosChave.push(`Hashtags já presentes: ${sinais.hashtags.join(" ")}.`);

  // ---- análise ----
  const falhas = diagnostico.itens.filter((i) => !i.ok);
  const analise = [
    termos.length
      ? `O material gira em torno de ${termos.slice(0, 3).join(", ")}, com linguagem ${
          sinais.perfil === "b2b" ? "técnica" : sinais.perfil === "b2c" ? "de consumo" : "mista"
        } e leitura ${legibilidade}.`
      : `O material não tem um assunto que se repita — o primeiro trabalho é decidir sobre o que ele fala.`,
    querVender && querDivulgar
      ? "Como o objetivo é vender e divulgar ao mesmo tempo, vale separar duas peças: uma de alcance (topo) e outra de conversão (fundo). Tentar fazer as duas no mesmo texto costuma enfraquecer as duas."
      : querVender
        ? "Com o objetivo de venda, o texto precisa de uma linha só sobre o benefício principal, uma prova, e um único pedido claro no final."
        : "Com o objetivo de alcance, o que decide é a primeira frase e o formato — a pessoa precisa parar antes de ler o resto.",
    falhas.length
      ? `Os pontos mais frágeis hoje: ${falhas
          .slice(0, 3)
          .map((f) => f.titulo.toLowerCase())
          .join("; ")}.`
      : "O material cobre os pontos básicos do checklist — o próximo ganho vem de testar variações, não de reescrever.",
    `Pontuação do checklist: ${diagnostico.pontuacao}/100 (${
      diagnostico.itens.filter((i) => i.ok).length
    } de ${diagnostico.itens.length} itens atendidos).`,
    "Esta leitura é automática e feita por regras dentro do próprio app — ela conta termos, mede frases e checa sinais de copy. Não interpreta contexto nem pesquisa na internet: use como checklist, não como veredito.",
  ].join("\n\n");

  const resultado: ResultadoMarketing = {
    modo: "local",
    resumo,
    pontosChave,
    analise,
    diagnostico,
    metricas,
    titulos: gerarTitulos(termos, publico, querVender),
    ideiasConteudo: gerarIdeias(termos, sinais, publico),
    hashtags: unico([
      ...sinais.hashtags,
      ...termos.map((t) => "#" + normalizar(t).replace(/[^a-z0-9]/g, "")),
    ])
      .filter((h) => h.length > 3)
      .slice(0, 8),
    palavrasChave: termos,
    proximosPassos: [],
  };

  // ---- trilha de conversão ----
  if (querVender) {
    resultado.propostaValor = t1
      ? `${maiuscula(t1)}${publico ? ` para ${publico}` : ""} — em uma frase, diga o que ${
          publico || "o cliente"
        } ganha${sinais.beneficio ? " (o material já aponta o ganho; deixe-o na primeira linha)" : " e por que agora"}.`
      : "Defina em uma frase o principal ganho de quem compra — e coloque essa frase na abertura.";

    resultado.gatilhos = [
      sinais.prova || sinais.numeros
        ? "Prova — já existe no material; transforme em número destacado logo no início."
        : "Prova — falta. Um caso, um número ou um cliente atendido vale mais que qualquer adjetivo.",
      sinais.urgencia
        ? "Urgência — presente. Mantenha concreta (prazo/lote), nunca inventada."
        : "Urgência — ausente. Dê um motivo real para decidir esta semana.",
      sinais.perfil === "b2b"
        ? "Autoridade — tempo de mercado, certificações e clientes do mesmo setor."
        : "Pertencimento — mostre gente parecida com o público usando e aprovando.",
      "Redução de risco — garantia, teste, suporte ou devolução declarados em uma linha.",
    ];

    resultado.objecoes = [
      sinais.preco
        ? '"Está caro" — compare com o custo de não resolver (parada, retrabalho, perda).'
        : '"Quanto custa?" — sem faixa nenhuma, muita gente desiste antes de perguntar. Dê um "a partir de".',
      sinais.prova
        ? '"Funciona para o meu caso?" — cite um caso do mesmo segmento do público.'
        : '"Será que funciona?" — não há prova no material; inclua resultado ou depoimento.',
      sinais.contato || dom
        ? '"Como falo com vocês?" — resolvido; repita o contato no começo e no fim.'
        : '"Como falo com vocês?" — não há contato visível no texto. Isso derruba conversão sozinho.',
      sinais.perfil === "b2b"
        ? '"Preciso comparar fornecedores" — facilite: ficha técnica, prazo de entrega e garantia em um PDF de 1 página.'
        : '"Depois eu vejo" — ofereça um primeiro passo pequeno e sem compromisso.',
    ];

    resultado.cta = unico([
      t1 ? `Peça um orçamento de ${t1}` : "Peça um orçamento",
      sinais.perfil === "b2b" ? "Fale com um especialista" : "Chame no WhatsApp",
      dom ? `Acesse ${dom}` : "Receba a proposta em 24h",
      sinais.perfil === "b2b" ? "Agende uma visita técnica" : "Garanta a condição desta semana",
    ]);
  }

  // ---- trilha de alcance ----
  if (querDivulgar) {
    resultado.ganchos = unico([
      t1 ? `O erro mais comum quando o assunto é ${t1} (e o preço de errar)` : "O erro mais comum nesse assunto",
      sinais.numeros
        ? "Abra com o número que já está no material — dado na primeira linha segura a rolagem."
        : "Comece com um número real do seu dia a dia (prazo, economia, quantidade).",
      publico ? `"Se você trabalha com ${publico}, isso muda seu mês."` : "Fale direto com quem sofre o problema, na segunda pessoa.",
      t2 ? `Antes e depois envolvendo ${t2}` : "Um antes e depois curto, com foto ou vídeo.",
    ]);

    resultado.canais =
      sinais.perfil === "b2b"
        ? ["LinkedIn", "E-mail para a base", "WhatsApp Business", "Google (busca pelo termo)", "Catálogo/site"]
        : sinais.perfil === "b2c"
          ? ["Instagram (Reels)", "WhatsApp Status", "TikTok", "Google Meu Negócio"]
          : ["Instagram", "WhatsApp", "LinkedIn", "E-mail"];

    resultado.formatos =
      sinais.perfil === "b2b"
        ? [
            "Estudo de caso curto (problema → solução → número)",
            "Carrossel com o passo a passo técnico",
            "Vídeo de 60s do produto em operação",
            "Ficha técnica de 1 página para enviar por e-mail",
          ]
        : [
            "Reels de 15–30s",
            "Carrossel de 5 telas",
            "Antes/depois",
            "Story com enquete",
          ];
  }

  // ---- próximos passos: saem do que falhou no checklist ----
  const passos = falhas
    .filter((f) => f.dica)
    .slice(0, 3)
    .map((f) => f.dica!);
  passos.push(
    querDivulgar
      ? `Escolher 1 canal principal (${(resultado.canais ?? ["Instagram"])[0]}) e publicar 1 peça de teste esta semana.`
      : "Reescrever a abertura com o benefício principal e publicar/enviar uma versão de teste.",
  );
  passos.push("Voltar aqui com a nova versão e comparar a pontuação do checklist.");
  resultado.proximosPassos = unico(passos).slice(0, 5);

  return resultado;
}
