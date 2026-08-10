# sextafeira

App web para **gerenciar, controlar e idear projetos**, com uma aba de **Análise de
Marketing** que lê o material, resume, diagnostica o que falta e devolve as
recomendações do objetivo escolhido (vender ou divulgar).

**Roda inteiro na sua máquina.** Não usa IA, não usa API de terceiros, não pede
chave e não manda nada para a internet — nem o texto, nem os arquivos.

## O que já tem

- **Painel de projetos** — crie projetos, mova por status (Ideia → Em andamento →
  Pausado → Concluído), guarde ideias e envie qualquer projeto direto para a
  análise. Os dados ficam salvos no seu navegador (localStorage).
- **Análise de Marketing** — envie um material (texto, oferta, post) e receba:
  - **resumo** do próprio material (as frases que mais carregam o assunto);
  - **diagnóstico com nota de 0 a 100** — checklist do que existe e do que falta
    (CTA, contato, prova, preço, urgência, público, tamanho de frase, abertura,
    hashtags, excesso de maiúsculas), cada item com a dica de correção;
  - **análise estratégica**, títulos sugeridos, trilha de conversão (proposta de
    valor, gatilhos, objeções, CTAs), trilha de alcance (ganchos, canais,
    formatos), ideias de conteúdo, palavras-chave, hashtags e próximos passos.
- **Anexos** — PDF de texto, `.txt`, `.md`, `.csv`, `.json` e `.log` (até 5
  arquivos, 10 MB cada). O texto do PDF é extraído aqui mesmo, sem biblioteca
  externa. PDF escaneado (imagem) e imagens não são lidos — o app avisa.
- **Exportar** — copiar a análise ou baixar em `.md` para mandar por WhatsApp/e-mail.
- **Histórico** — salve qualquer análise, reabra depois e veja a nota. Análises
  ficam vinculadas ao projeto de origem e aparecem dentro dele no Painel.

## Como rodar

1. Instale as dependências (só na primeira vez):

   ```bash
   npm install
   ```

2. Inicie o app:

   ```bash
   npm run dev
   ```

3. Abra no navegador: <http://localhost:3000>

Para a versão de produção: `npm run build` e depois `npm run start`.

## Como funciona a análise (sem IA)

O motor está em `lib/analise.ts` e é baseado em regras:

- extrai os termos centrais por frequência, com bigramas ("válvula industrial")
  valendo mais que palavras soltas;
- monta o resumo escolhendo as frases com maior densidade desses termos;
- detecta sinais de copy no texto (chamada para ação, contato, prova, números,
  preço, urgência, benefício, pergunta, hashtags, excesso de maiúsculas) e o
  perfil da linguagem (B2B, B2C ou misto);
- transforma tudo isso em checklist com nota, e gera as recomendações usando os
  termos do próprio material.

Ou seja: ele mede e confere, não "entende" nem pesquisa. É um checklist rigoroso
de marketing aplicado ao seu texto — use como revisão, não como veredito.

A leitura de PDF (`lib/pdfText.ts`) usa só o `zlib` do Node: descompacta os
streams (Flate, ASCII85, ASCIIHex) e traduz os glifos pelo mapa `/ToUnicode` de
cada fonte.

## Onde os dados ficam

Tudo no `localStorage` do navegador que você usa. Não há banco de dados nem
servidor guardando nada. Limpar os dados do site apaga projetos e análises; abrir
em outro computador ou navegador começa vazio.

## Tecnologia

Next.js 16 · React 19 · TypeScript · Tailwind CSS. Zero dependência de runtime
além do próprio Next/React.
