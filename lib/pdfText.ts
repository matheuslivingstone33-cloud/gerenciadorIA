// Leitura de texto de PDF sem nenhuma biblioteca externa e sem serviço na nuvem:
// usa só o zlib que já vem no Node.
//
// Cobre o que aparece na prática: streams com FlateDecode, ASCII85Decode e
// ASCIIHexDecode (inclusive em cadeia), texto em WinAnsi e fontes de subconjunto
// (AAAAAA+Fonte), traduzidas pelo mapa /ToUnicode de cada fonte.
//
// Não cobre PDF escaneado (é imagem, não texto) nem PDF protegido por senha —
// nesses casos devolve "" e quem chama avisa o usuário.

import { inflateRawSync, inflateSync } from "node:zlib";

const LIMITE_CHARS = 40000;

// Faixa 0x80–0x9F do Windows-1252 (o resto bate com latin1).
const CP1252: Record<number, string> = {
  0x80: "€", 0x82: "‚", 0x83: "ƒ", 0x84: "„", 0x85: "…", 0x86: "†", 0x87: "‡",
  0x88: "ˆ", 0x89: "‰", 0x8a: "Š", 0x8b: "‹", 0x8c: "Œ", 0x8e: "Ž", 0x91: "‘",
  0x92: "’", 0x93: "“", 0x94: "”", 0x95: "•", 0x96: "–", 0x97: "—", 0x98: "˜",
  0x99: "™", 0x9a: "š", 0x9b: "›", 0x9c: "œ", 0x9e: "ž", 0x9f: "Ÿ",
};

// ------------------------------------------------------------------ filtros

function inflar(bytes: Buffer): Buffer | null {
  for (const fn of [inflateSync, inflateRawSync]) {
    try {
      return fn(bytes);
    } catch {
      // não era este formato — tenta o próximo
    }
  }
  return null;
}

function ascii85(texto: string): Buffer {
  let s = texto.replace(/\s/g, "");
  if (s.startsWith("<~")) s = s.slice(2);
  const fim = s.indexOf("~>");
  if (fim !== -1) s = s.slice(0, fim);

  const saida: number[] = [];
  let grupo: number[] = [];

  const descarregar = (quantos: number) => {
    let valor = 0;
    for (const v of grupo) valor = valor * 85 + v;
    const bytes = [(valor >>> 24) & 0xff, (valor >>> 16) & 0xff, (valor >>> 8) & 0xff, valor & 0xff];
    saida.push(...bytes.slice(0, quantos));
  };

  for (const ch of s) {
    if (ch === "z" && grupo.length === 0) {
      saida.push(0, 0, 0, 0);
      continue;
    }
    const v = ch.charCodeAt(0) - 33;
    if (v < 0 || v > 84) continue;
    grupo.push(v);
    if (grupo.length === 5) {
      descarregar(4);
      grupo = [];
    }
  }
  if (grupo.length > 1) {
    const faltando = grupo.length;
    while (grupo.length < 5) grupo.push(84);
    descarregar(faltando - 1);
  }

  return Buffer.from(saida);
}

function asciiHex(texto: string): Buffer {
  let hex = texto.split(">")[0].replace(/[^0-9a-fA-F]/g, "");
  if (hex.length % 2 === 1) hex += "0";
  return Buffer.from(hex, "hex");
}

function aplicarFiltros(bytes: Buffer, filtros: string[]): Buffer | null {
  let atual: Buffer | null = bytes;
  for (const f of filtros) {
    if (!atual) return null;
    if (f === "FlateDecode" || f === "Fl") atual = inflar(atual);
    else if (f === "ASCII85Decode" || f === "A85") atual = ascii85(atual.toString("latin1"));
    else if (f === "ASCIIHexDecode" || f === "AHx") atual = asciiHex(atual.toString("latin1"));
    else return null; // DCTDecode, JPXDecode, LZW… não é texto que interesse aqui
  }
  return atual;
}

// ------------------------------------------------------------------ objetos

interface ObjetoPdf {
  dict: string;
  dados: Buffer | null;
}

function indexar(dados: Buffer): Map<number, ObjetoPdf> {
  const bruto = dados.toString("latin1");
  const objetos = new Map<number, ObjetoPdf>();
  const re = /(\d+)\s+\d+\s+obj\b/g;
  let m: RegExpExecArray | null;

  while ((m = re.exec(bruto))) {
    const numero = parseInt(m[1], 10);
    const inicioCorpo = m.index + m[0].length;
    const fimObj = bruto.indexOf("endobj", inicioCorpo);
    const limite = fimObj === -1 ? bruto.length : fimObj;

    const marcaStream = bruto.indexOf("stream", inicioCorpo);
    const temStream = marcaStream !== -1 && marcaStream < limite;
    const dict = bruto.slice(inicioCorpo, temStream ? marcaStream : limite);

    let conteudo: Buffer | null = null;
    if (temStream) {
      let inicio = marcaStream + 6;
      if (bruto[inicio] === "\r") inicio++;
      if (bruto[inicio] === "\n") inicio++;
      let fim = bruto.indexOf("endstream", inicio);
      if (fim === -1) fim = limite;
      while (fim > inicio && /[\r\n]/.test(bruto[fim - 1])) fim--;

      const filtros = (dict.match(/\/Filter\s*(\[[^\]]*\]|\/[A-Za-z0-9]+)/)?.[1] ?? "")
        .match(/\/([A-Za-z0-9]+)/g)
        ?.map((f) => f.slice(1)) ?? [];

      conteudo = aplicarFiltros(dados.subarray(inicio, fim), filtros);
    }

    objetos.set(numero, { dict, dados: conteudo });
  }

  return objetos;
}

// --------------------------------------------------------- mapa /ToUnicode

interface CMap {
  largura: number; // bytes por código
  mapa: Map<number, string>;
}

function hexParaTexto(hex: string): string {
  let s = "";
  for (let i = 0; i + 3 < hex.length + 1; i += 4) {
    const parte = hex.slice(i, i + 4);
    if (parte.length < 4) break;
    s += String.fromCharCode(parseInt(parte, 16));
  }
  return s;
}

function lerCMap(texto: string): CMap {
  const mapa = new Map<number, string>();

  const faixa = texto.match(/begincodespacerange([\s\S]*?)endcodespacerange/)?.[1];
  const primeiroCodigo = faixa?.match(/<([0-9a-fA-F]+)>/)?.[1];
  const largura = primeiroCodigo ? Math.max(1, Math.ceil(primeiroCodigo.length / 2)) : 1;

  for (const bloco of texto.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const par of bloco[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g)) {
      mapa.set(parseInt(par[1], 16), hexParaTexto(par[2]));
    }
  }

  for (const bloco of texto.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    // <ini> <fim> <destino>
    for (const linha of bloco[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g)) {
      const ini = parseInt(linha[1], 16);
      const fim = parseInt(linha[2], 16);
      const destino = parseInt(linha[3], 16);
      for (let c = ini; c <= fim && c - ini < 512; c++) {
        mapa.set(c, String.fromCharCode(destino + (c - ini)));
      }
    }
    // <ini> <fim> [ <d1> <d2> ... ]
    for (const linha of bloco[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*\[([\s\S]*?)\]/g)) {
      const ini = parseInt(linha[1], 16);
      const destinos = [...linha[3].matchAll(/<([0-9a-fA-F]+)>/g)].map((d) => hexParaTexto(d[1]));
      destinos.forEach((d, i) => mapa.set(ini + i, d));
    }
  }

  return { largura, mapa };
}

/** Liga o apelido usado no conteúdo (/F1) ao mapa ToUnicode da fonte. */
function mapearFontes(objetos: Map<number, ObjetoPdf>): Map<string, CMap> {
  const cmapPorObjeto = new Map<number, CMap>();
  const fontes = new Map<string, CMap>();

  for (const [numero, obj] of objetos) {
    const ref = obj.dict.match(/\/ToUnicode\s+(\d+)\s+\d+\s+R/)?.[1];
    if (!ref) continue;
    const cmapObj = objetos.get(parseInt(ref, 10));
    if (!cmapObj?.dados) continue;
    cmapPorObjeto.set(numero, lerCMap(cmapObj.dados.toString("latin1")));
  }

  const registrarEntradas = (texto: string) => {
    for (const entrada of texto.matchAll(/\/([A-Za-z0-9#+._-]+)\s+(\d+)\s+\d+\s+R/g)) {
      const cmap = cmapPorObjeto.get(parseInt(entrada[2], 10));
      if (cmap) fontes.set(entrada[1], cmap);
    }
  };

  for (const obj of objetos.values()) {
    // /Resources << /Font << /F1 7 0 R >> >>
    for (const bloco of obj.dict.matchAll(/\/Font\s*<<([\s\S]*?)>>/g)) registrarEntradas(bloco[1]);
    // /Resources << /Font 1 0 R >> — o dicionário de fontes é outro objeto
    for (const ref of obj.dict.matchAll(/\/Font\s+(\d+)\s+\d+\s+R/g)) {
      const alvo = objetos.get(parseInt(ref[1], 10));
      if (alvo) registrarEntradas(alvo.dict);
    }
  }

  return fontes;
}

// ----------------------------------------------------------------- conteúdo

function decodificar(bytes: number[], cmap?: CMap): string {
  if (cmap && cmap.mapa.size > 0) {
    let s = "";
    for (let i = 0; i < bytes.length; i += cmap.largura) {
      let codigo = 0;
      for (let k = 0; k < cmap.largura; k++) codigo = (codigo << 8) | (bytes[i + k] ?? 0);
      const achado = cmap.mapa.get(codigo);
      if (achado !== undefined) s += achado;
      else if (cmap.largura === 1) s += CP1252[codigo] ?? String.fromCharCode(codigo);
    }
    return s;
  }

  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    let s = "";
    for (let i = 2; i + 1 < bytes.length; i += 2) s += String.fromCharCode((bytes[i] << 8) | bytes[i + 1]);
    return s;
  }

  return bytes.map((b) => CP1252[b] ?? String.fromCharCode(b)).join("");
}

/** Lê uma string literal (texto\(escapado\)) a partir de `i` (no "("). */
function lerLiteral(s: string, i: number): { bytes: number[]; fim: number } {
  const bytes: number[] = [];
  let profundidade = 1;
  let p = i + 1;

  while (p < s.length && profundidade > 0) {
    const c = s[p];
    if (c === "\\") {
      const prox = s[p + 1];
      if (/[0-7]/.test(prox ?? "")) {
        let digitos = "";
        while (digitos.length < 3 && /[0-7]/.test(s[p + 1] ?? "")) digitos += s[++p];
        bytes.push(parseInt(digitos, 8) & 0xff);
        p++;
        continue;
      }
      const mapa: Record<string, number> = { n: 10, r: 13, t: 9, b: 8, f: 12 };
      if (prox in mapa) bytes.push(mapa[prox]);
      else if (prox === "\n" || prox === "\r") {
        // barra invertida no fim da linha = continuação
      } else if (prox !== undefined) bytes.push(prox.charCodeAt(0));
      p += 2;
      continue;
    }
    if (c === "(") profundidade++;
    if (c === ")") {
      profundidade--;
      if (profundidade === 0) break;
    }
    bytes.push(c.charCodeAt(0));
    p++;
  }

  return { bytes, fim: p + 1 };
}

/** Lê uma string hexadecimal (<48656C6C6F>) a partir de `i` (no "<"). */
function lerHex(s: string, i: number): { bytes: number[]; fim: number } {
  const fimTag = s.indexOf(">", i);
  if (fimTag === -1) return { bytes: [], fim: s.length };
  let hex = s.slice(i + 1, fimTag).replace(/[^0-9a-fA-F]/g, "");
  if (hex.length % 2 === 1) hex += "0";
  const bytes: number[] = [];
  for (let p = 0; p < hex.length; p += 2) bytes.push(parseInt(hex.slice(p, p + 2), 16));
  return { bytes, fim: fimTag + 1 };
}

/** Percorre um content stream e junta o texto dos operadores Tj / TJ / ' / ". */
function textoDoConteudo(conteudo: string, fontes: Map<string, CMap>): string {
  let saida = "";
  let emArray = false;
  let ultimoNome = "";
  let fonte: CMap | undefined;
  let operandos: number[] = [];
  let ultimoY: number | null = null;
  let i = 0;

  const quebrar = () => {
    if (!saida.endsWith("\n")) saida += "\n";
  };

  while (i < conteudo.length && saida.length < LIMITE_CHARS) {
    const c = conteudo[i];

    if (c === "(") {
      const { bytes, fim } = lerLiteral(conteudo, i);
      saida += decodificar(bytes, fonte);
      i = fim;
      continue;
    }
    if (c === "<" && conteudo[i + 1] !== "<") {
      const { bytes, fim } = lerHex(conteudo, i);
      saida += decodificar(bytes, fonte);
      i = fim;
      continue;
    }
    if (c === "/") {
      let nome = "";
      i++;
      while (i < conteudo.length && /[A-Za-z0-9#+._-]/.test(conteudo[i])) nome += conteudo[i++];
      ultimoNome = nome;
      continue;
    }
    if (c === "[") {
      emArray = true;
      i++;
      continue;
    }
    if (c === "]") {
      emArray = false;
      i++;
      continue;
    }
    if (c === "-" || c === "." || (c >= "0" && c <= "9")) {
      let n = "";
      while (i < conteudo.length && /[-0-9.]/.test(conteudo[i])) n += conteudo[i++];
      const valor = parseFloat(n);
      if (emArray) {
        // Dentro de [ ] TJ, um número bem negativo é o espaço entre palavras.
        if (valor <= -120 && !saida.endsWith(" ")) saida += " ";
      } else if (Number.isFinite(valor)) {
        operandos.push(valor);
      }
      continue;
    }
    if (/[A-Za-z'"*]/.test(c)) {
      let op = "";
      while (i < conteudo.length && /[A-Za-z0-9'"*]/.test(conteudo[i])) op += conteudo[i++];

      if (op === "Tf") {
        fonte = fontes.get(ultimoNome);
      } else if (op === "Td" || op === "TD") {
        // Só é linha nova quando o deslocamento é vertical. O avanço horizontal
        // é a largura do próprio glifo (muitos PDFs posicionam letra a letra) —
        // o espaço entre palavras vem do glifo de espaço ou do kerning do TJ.
        const ty = operandos[operandos.length - 1] ?? 0;
        if (Math.abs(ty) > 0.5) quebrar();
      } else if (op === "Tm") {
        const y = operandos[operandos.length - 1];
        if (ultimoY !== null && Number.isFinite(y) && Math.abs(y - ultimoY) > 0.5) quebrar();
        if (Number.isFinite(y)) ultimoY = y;
      } else if (op === "T*" || op === "ET" || op === "'" || op === '"') {
        quebrar();
      }

      operandos = [];
      continue;
    }
    i++;
  }

  return saida;
}

/** Proporção de caracteres plausíveis: filtra saída de fonte sem ToUnicode. */
function pareceTexto(s: string): boolean {
  const amostra = s.slice(0, 4000);
  if (amostra.trim().length < 20) return false;
  const bons = amostra.match(/[\p{L}\p{N}\s.,;:!?()'"%/@#$&+*=°ºª–—-]/gu)?.length ?? 0;
  return bons / amostra.length >= 0.75;
}

/** Devolve o texto do PDF, ou "" quando não é possível extrair. */
export function extrairTextoPdf(dados: Buffer): string {
  let objetos: Map<number, ObjetoPdf>;
  try {
    objetos = indexar(dados);
  } catch {
    return "";
  }

  const fontes = mapearFontes(objetos);
  const pedacos: string[] = [];
  let total = 0;

  for (const obj of objetos.values()) {
    if (total >= LIMITE_CHARS || !obj.dados) continue;
    const conteudo = obj.dados.toString("latin1");
    if (!/\bBT\b/.test(conteudo) || !/\bTJ?\b/.test(conteudo)) continue;

    const texto = textoDoConteudo(conteudo, fontes);
    if (!texto.trim()) continue;
    pedacos.push(texto);
    total += texto.length;
  }

  const completo = pedacos
    .join("\n")
    // Sobras de fonte sem ToUnicode viram caracteres de controle invisíveis.
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return pareceTexto(completo) ? completo.slice(0, LIMITE_CHARS) : "";
}
