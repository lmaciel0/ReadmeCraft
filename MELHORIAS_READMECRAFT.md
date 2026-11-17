# ReadmeCraft — Proposta de Melhorias Técnicas & Roadmap de Evolução

> Documento gerado com análise arquitetural aprofundada (Front-end & Back-end) para o projeto **ReadmeCraft**.

---

## 📋 Sumário Executivo

O **ReadmeCraft** possui uma excelente arquitetura de base para a versão `v0.1.0`:
- **Front-end**: React 19, Vite 8, Tailwind CSS v4, Lucide React, pipeline Markdown com `react-markdown`, `remark-gfm`, `rehype-sanitize`, realce de sintaxe com `highlight.js`, diagramas Mermaid e suporte a acessibilidade WAI-ARIA com navegação por teclado (`rovingTabIndex`).
- **Back-end**: API com Hono 4, streaming Server-Sent com Claude Opus 5.5, fallback determinístico para geração offline por templates, sessões cifradas em cookie HTTP-Only via AES-256-GCM com derivação de chave HKDF, rate limiting com janela fixa, e integração com GitHub OAuth e PR publisher.
- **Qualidade & Testes**: **181 testes passando com 100% de sucesso** em 13 suítes com Vitest.

Abaixo estão detalhadas todas as oportunidades e recomendações de melhorias técnicas, arquiteturais e de experiência do usuário (UX).

---

## 🎨 1. Front-end: Diagnóstico e Melhorias

### 1.1. Evolução do Editor: Migração para CodeMirror 6
* **Cenário atual (`src/components/editor/MarkdownEditor.tsx`):**
  - Utiliza `<textarea>` nativo com gutter manual calculado via `onScroll`.
  - Manipulação de texto com `document.execCommand("insertText")`, que é uma API obsoleta/deprecated pelo W3C.
* **Limitações:**
  - Não há syntax highlighting no painel de edição (o código é texto puro sem cor).
  - Pode haver descompasso de scroll entre os números de linha e o texto em redimensionamentos ou quebras de linha automáticas.
  - Faltam recursos essenciais (fechamento automático de crases/parênteses, auto-formatação de tabelas, busca & substituição com `Ctrl+F`).
* **Recomendação:**
  - Integrar **CodeMirror 6** (via `@uiw/react-codemirror` ou CodeMirror 6 modular).
  - Pesa apenas ~300 KB gzipped (contra 3 MB+ do Monaco Editor), é mobile-friendly e possui suporte nativo a GFM (GitHub Flavored Markdown).

### 1.2. Scroll Sincronizado (Editor ↔ Preview Sync)
* **Cenário atual:** O scroll do editor e o do preview são 100% desacoplados.
* **Problema:** Em documentos extensos (>150 linhas), o usuário edita uma seção no final e precisa caçar manualmente no preview onde o conteúdo foi renderizado.
* **Recomendação:**
  - Implementar scroll sincronizado bidirecional por percentual de rolagem com debounce ou ancorado nos cabeçalhos (`h1`-`h6`).

### 1.3. Visual Diff no Histórico de Versões (`src/components/editor/HistoryPanel.tsx`)
* **Cenário atual:** O painel de histórico permite restaurar versões salvas, mas o usuário restaura "às cegas".
* **Recomendação:**
  - Adicionar um botão **"Ver Diferenças" (Diff)** no histórico.
  - Exibir visualização side-by-side ou inline (linhas adicionadas em verde `+`, removidas em vermelho `-`) usando uma lib leve como `diff` ou `@uiw/react-diff-view`.

### 1.4. Botão "Copiar Código" nos Blocos do Preview (`src/components/preview/MarkdownPreview.tsx`)
* **Cenário atual:** Os blocos de código (`pre > code`) renderizam com syntax highlighting, mas sem botão de cópia rápida.
* **Recomendação:**
  - Criar um componente customizado para `<pre>` no `react-markdown` que renderiza um botão flutuante no canto superior direito com feedback visual (`Copy` / `Check`).

### 1.5. Mini-TOC / Índice Flutuante no Preview
* **Recomendação:**
  - Adicionar um índice retrátil (Table of Contents) no canto do preview que lista automaticamente as seções (`## Sobre`, `## Instalação`, `## Tech Stack`, etc.) e permite rolar suavemente (`scrollIntoView`) com um clique.

### 1.6. Exportação do Banner em PNG/WebP (`src/components/preview/BannerStudio.tsx`)
* **Cenário atual:** O banner é exportado exclusivamente como `.svg`.
* **Problema:** Muitos clientes do GitHub (apps mobile e leitores externos) possuem restrições para carregar SVGs remotos ou renderizam fontes incorretamente.
* **Recomendação:**
  - Adicionar exportação opcional em **PNG (alta resolução / 2x)** renderizando o SVG em um `<canvas>` via `canvas.toBlob("image/png")`.

### 1.7. Migração de Armazenamento Local para IndexedDB
* **Cenário atual:** Rascunhos e histórico local usam `localStorage` (limite de 5 MB por domínio).
* **Recomendação:**
  - Utilizar **`idb-keyval`** (< 1 KB) para rascunhos e histórico offline, eliminando o risco de estourar a cota com múltiplos READMEs e banners.

---

## ⚙️ 2. Back-end: Diagnóstico e Melhorias

### 2.1. Abstração Multi-Provedor de LLM (`server/claude.ts`)
* **Cenário atual:** O streaming de IA está acoplado exclusivamente ao `@anthropic-ai/sdk` com `claude-opus-5-5`.
* **Problemas:**
  - O **Claude Opus 5.5** com `thinking: { type: "adaptive" }` e `max_tokens: 16000` é extremamente detalhista, mas possui o maior custo e latência.
  - Desenvolvedores que possuem chaves de outros provedores (OpenAI, Google Gemini, Groq, Ollama) ficam restritos ao gerador estático.
* **Recomendação:**
  - Criar uma interface unificada de streaming (`AiProviderAdapter`):
    - **Ultra Rápido & Econômico**: Gemini 2.5 Flash / Claude 3.5 Haiku / GPT-4o-mini
    - **Equilibrado (Recomendado)**: Claude 3.7 Sonnet / GPT-4o
    - **Máximo Detalhe**: Claude Opus 5.5
  - Suporte a BYOK (*Bring Your Own Key*) opcional via cabeçalho HTTP (`x-custom-api-key`).

### 2.2. Rate Limiting Distribuído em Ambientes Serverless (Vercel) (`server/rateLimit.ts`)
* **Cenário atual:** O rate limiter e o `dailyBudget` utilizam um `Map` em memória.
* **Vulnerabilidade em Serverless:**
  - Na Vercel, instâncias de Serverless Functions (Lambdas) são efêmeras e isoladas. Elas não compartilham memória. Um usuário mal-intencionado pode disparar requisições concorrentes e contornar os limites diários de custo.
* **Recomendação:**
  - Integrar **Upstash Redis** (`@upstash/ratelimit`) quando `UPSTASH_REDIS_REST_URL` estiver configurado, mantendo o fallback em memória para desenvolvimento local.

### 2.3. Prevenção de Timeouts em Serverless na Vercel
* **Cenário atual:** No plano Hobby da Vercel, o timeout de funções Node.js é de 10 a 15 segundos. Um streaming de IA longo pode ultrapassar esse tempo e retornar erro `504 Gateway Timeout`.
* **Recomendação:**
  - Configurar `maxDuration: 60` no `vercel.json`.
  - Avaliar o uso do **Edge Runtime** da Vercel (`runtime: "edge"`) para a rota de streaming SSE, que não impõe restrição de tempo em conexões ativas.

### 2.4. End-to-End Type Safety com Hono RPC (`hc`)
* **Cenário atual:** O front-end faz requisições com `fetch()` manual e type casting.
* **Recomendação:**
  - Exportar o tipo da API (`export type AppType = typeof app`) e utilizar o cliente nativo do Hono no front:
    ```ts
    import { hc } from "hono/client";
    import type { AppType } from "../server/app";
    export const client = hc<AppType>("/");
    ```
  - Garante autocompletion de rotas, tipagem estrita de parâmetros e payloads sem dependências pesadas.

### 2.5. Enriquecimento da Análise de Repositório (`src/services/githubService.ts` & `techDetector.ts`)
* **Oportunidades de detecção:**
  - **Docker & Compose**: Detectar `Dockerfile` e `docker-compose.yml` para gerar instruções de container automaticamente.
  - **Workflows CI/CD**: Ler `.github/workflows/` para extrair os nomes dos workflows e badges de CI reais.
  - **Suíte de Testes**: Detectar `tests/`, `__tests__/` ou `cypress/` para sugerir comandos exatos (`vitest run`, `pytest -v`, `cargo test`).
  - **Licença Local**: No modo local, ler o arquivo `LICENSE` caso a API do GitHub retorne nulo.

### 2.6. Observabilidade e Logs Estruturados
* **Recomendação:**
  - Adicionar middleware de `X-Request-Id` (UUID gerado por requisição) repassado nos logs e respostas.
  - Substituir `console.error` soltos por logs estruturados em formato JSON para facilitar auditoria.

---

## 🛠️ 3. Developer Experience (DX) & Infraestrutura

### 3.1. Versão do Node.js (`.nvmrc` e `engines`)
* **Problema:** O Vitest 5 / Rolldown exige Node.js >= 20.12.0 devido ao uso de `node:util styleText`. Em Node 18, os testes falham logo na inicialização.
* **Recomendação:**
  - Adicionar arquivo `.nvmrc` com `22` na raiz do projeto.
  - Declarar no `package.json`:
    ```json
    "engines": {
      "node": ">=20.12.0"
    }
    ```

---

## 📊 4. Matriz de Priorização (Impacto vs Esforço)

| Prioridade | Iniciativa | Área | Impacto | Esforço |
| :--- | :--- | :--- | :--- | :--- |
| **P1 (Imediato)** | `.nvmrc` + `engines` no package.json | DX / Infra | Alto (evita quebra de ambiente) | Mínimo |
| **P1 (Imediato)** | Botão "Copiar" nos blocos de código do preview | Front-end | Alto (melhoria imediata de UX) | Baixo |
| **P2 (Curto Prazo)**| Suporte Multi-Modelos (Claude Haiku / Gemini Flash / GPT-4o) | Back-end | Alto (reduz custos e latência) | Médio |
| **P2 (Curto Prazo)**| Migração para CodeMirror 6 + Syntax Highlighting | Front-end | Altíssimo (experiência de edição) | Médio |
| **P2 (Curto Prazo)**| Scroll sincronizado (Editor ↔ Preview) | Front-end | Alto (usabilidade em docs longos)| Médio |
| **P3 (Médio Prazo)**| Rate Limit distribuído via Upstash Redis para Serverless | Back-end | Alto (segurança e robustez) | Baixo |
| **P3 (Médio Prazo)**| Exportação de Banner para PNG/WebP | Front-end | Médio | Baixo |
| **P3 (Médio Prazo)**| Visual Diff no histórico de versões | Front-end | Médio | Médio |
