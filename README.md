# JuriSistence — Agente de Pesquisa Jurídica

## O que mudou em relação ao seu projeto

- `server.js` agora só sobe o Express e monta a rota `/pergunta`. Toda a lógica
  jurídica saiu daqui e foi para `src/`.
- Antes, a pergunta ia direto pro Gemini. Agora o fluxo é:
  `Planner (Gemini 1)` → `Providers (LexML/Planalto)` → `Extractor` →
  `Validator` → `ReportGenerator (Gemini 2)`.
- O arquivo `search.js` da raiz era código morto (referenciava um
  `controllers/searchController` que não existia e não estava plugado no
  `server.js`). Foi substituído por `src/routes/agent.js` +
  `src/controllers/agentController.js`. Pode apagar o `search.js` antigo.
- `index.html`, `script.js`, `style.css` e `balança.jpeg` não mudaram — o
  contrato do front-end (`POST /pergunta` com `{ pergunta }`, resposta
  `{ resposta }`) continua o mesmo, então nada quebra na tela.

## Instalação

```bash
npm install
```

Isso vai instalar as duas novas dependências gratuitas usadas pelo agente:
- `cheerio` — parsing de HTML (scraping do Planalto)
- `zod` — validação do JSON que o Gemini devolve no planejamento

## Configuração

Copie `.env.example` para `.env` e preencha com sua chave:

```bash
cp .env.example .env
```

**Importante sobre sua chave atual**: o arquivo `_env` que você me enviou
tinha a `GEMINI_API_KEY` em texto puro, e ela passou por esta conversa.
Por segurança, recomendo gerar uma nova chave no Google AI Studio e
substituir a antiga — é rápido e evita deixar uma chave "vista" circulando.

## Rodando

```bash
npm start
```

Acesse `http://localhost:3000` — a interface é a mesma de antes.

## Fontes usadas (todas gratuitas)

- **LexML Brasil** (`lexmlProvider.js`): API oficial SRU do governo,
  cobre legislação federal e parte da jurisprudência (súmulas/acórdãos).
  Fonte primária.
- **Planalto** (`planaltoProvider.js`): fallback por scraping pontual,
  usado só para normas conhecidas (CF, CLT, Código Civil, Código Penal,
  CDC, CTN, CPC, CPP). Fácil de estender — basta adicionar uma entrada no
  mapa `NORMAS_CONHECIDAS`.
- **STF/STJ/TST/CNJ** (`jurisprudenciaProvider.js`): ainda **não
  implementado de verdade** — esses portais dependem de JavaScript pesado
  e não têm API pública estável e gratuita para busca textual simples.
  Por honestidade, o provider retorna vazio e loga o motivo, em vez de
  fingir uma cobertura que não existe. O LexML já cobre uma parte disso.
  Fica como próximo passo natural (ex.: integrar com o DataJud do CNJ,
  que é gratuito e tem API oficial).

## Extensão futura

- **Nova fonte de legislação**: crie um provider em `src/providers/` com
  um método `search(palavrasChave)` e registre em `sourceRegistry.js`.
- **Cache**: pode entrar como um decorator em volta de qualquer provider,
  sem mudar a interface.
- **Banco vetorial**: entraria como mais uma "fonte" no
  `sourceRegistry.js`, consultada em paralelo às demais.
- **Múltiplos agentes especializados**: o `planner.js` pode evoluir para
  rotear para sub-planners por área do Direito.
