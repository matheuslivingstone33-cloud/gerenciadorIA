// Rota interna do próprio app: recebe o material, lê os anexos que dá para ler
// aqui mesmo (texto e PDF de texto) e devolve a análise do motor local.
// Não existe chamada para fora — nenhuma API, nenhuma chave, nenhuma internet.

import { analisar } from "@/lib/analise";
import { extrairTextoPdf } from "@/lib/pdfText";
import type { EntradaMarketing, Objetivo } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 4 MB por arquivo: hospedado, o corpo da requisição é limitado a ~4,5 MB.
const MAX_ARQUIVO_BYTES = 4 * 1024 * 1024;
const MAX_ARQUIVOS = 5;
const MAX_CHARS_ARQUIVO = 40000;

interface Anexos {
  textos: string[];
  lidos: string[];
  ignorados: string[];
  grandes: string[];
  pdfsSemTexto: string[];
}

function ehTexto(nome: string, mime: string): boolean {
  if (mime.startsWith("text/") || mime === "application/json") return true;
  return /\.(txt|md|markdown|csv|tsv|json|log|html?)$/i.test(nome);
}

function ehPdf(nome: string, mime: string): boolean {
  return mime === "application/pdf" || /\.pdf$/i.test(nome);
}

async function processarArquivos(arquivos: File[]): Promise<Anexos> {
  const out: Anexos = { textos: [], lidos: [], ignorados: [], grandes: [], pdfsSemTexto: [] };

  for (const f of arquivos.slice(0, MAX_ARQUIVOS)) {
    if (!f || f.size === 0) continue;
    if (f.size > MAX_ARQUIVO_BYTES) {
      out.grandes.push(f.name || "arquivo");
      continue;
    }
    const nome = f.name || "arquivo";
    const mime = (f.type || "").toLowerCase();
    const buf = Buffer.from(await f.arrayBuffer());

    if (ehPdf(nome, mime)) {
      const texto = extrairTextoPdf(buf);
      if (texto.trim().length > 40) {
        out.textos.push(texto.slice(0, MAX_CHARS_ARQUIVO));
        out.lidos.push(nome);
      } else {
        out.pdfsSemTexto.push(nome);
      }
      continue;
    }

    if (ehTexto(nome, mime)) {
      out.textos.push(buf.toString("utf8").slice(0, MAX_CHARS_ARQUIVO));
      out.lidos.push(nome);
      continue;
    }

    out.ignorados.push(nome);
  }

  return out;
}

function montarAviso(a: Anexos): string | undefined {
  const partes: string[] = [];
  if (a.grandes.length) {
    partes.push(`${a.grandes.join(", ")}: passa de 4 MB e não foi enviado.`);
  }
  if (a.pdfsSemTexto.length) {
    partes.push(
      `Não consegui extrair texto de ${a.pdfsSemTexto.join(", ")} — provavelmente é um PDF ` +
        "escaneado (imagem). Copie o texto e cole no campo acima.",
    );
  }
  if (a.ignorados.length) {
    partes.push(
      `${a.ignorados.join(", ")}: imagens e formatos binários não são lidos (o sistema não usa ` +
        "IA nem serviço externo). Descreva o conteúdo no campo de texto.",
    );
  }
  return partes.length ? partes.join(" ") : undefined;
}

export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ erro: "Envio inválido." }, { status: 400 });
  }

  const objetivoBruto = String(form.get("objetivo") ?? "ambos");
  const objetivo: Objetivo = ["vendavel", "divulgacao", "ambos"].includes(objetivoBruto)
    ? (objetivoBruto as Objetivo)
    : "ambos";

  const entrada: EntradaMarketing = {
    conteudo: String(form.get("conteudo") ?? "").trim(),
    link: String(form.get("link") ?? "").trim() || undefined,
    objetivo,
    publico: String(form.get("publico") ?? "").trim() || undefined,
    tom: String(form.get("tom") ?? "").trim() || undefined,
  };

  const arquivos = form.getAll("arquivos").filter((v): v is File => v instanceof File);
  const anexos = await processarArquivos(arquivos);

  const material = [entrada.conteudo, ...anexos.textos].filter(Boolean).join("\n\n");
  if (material.trim().length < 3) {
    return Response.json(
      {
        erro:
          anexos.pdfsSemTexto.length || anexos.ignorados.length || anexos.grandes.length
            ? montarAviso(anexos) + " Cole o texto no campo para analisar."
            : "Escreva ou cole um conteúdo para analisar.",
      },
      { status: 400 },
    );
  }

  const resultado = analisar({ ...entrada, conteudo: material });

  if (anexos.lidos.length) {
    resultado.pontosChave.push(`Anexos lidos: ${anexos.lidos.join(", ")}.`);
  }
  const aviso = montarAviso(anexos);
  if (aviso) resultado.aviso = aviso;

  return Response.json(resultado);
}
