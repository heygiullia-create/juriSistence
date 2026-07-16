/* ==================================================
   PLANNER
   1a chamada da IA.
   Nao responde a pergunta juridica: apenas decide
   o que pesquisar e onde.
================================================== */
const { z } = require("zod");
const geminiService = require("../services/geminiService");

function normalizarTexto(texto) {
    return String(texto || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim();
}

function normalizarPapel(valor) {
    const papel = normalizarTexto(valor);
    if (!papel) return "central";
    if (["central", "principal", "essencial", "nuclear"].includes(papel)) return "central";
    if (["acessorio", "acessoria", "complementar", "secundario", "secundaria", "lateral"].includes(papel)) {
        return "acessorio";
    }
    return "central";
}

const TemaSchema = z.object({
    descricao: z.string().min(1),
    papel: z.preprocess(normalizarPapel, z.enum(["central", "acessorio"])).optional().default("central"),
    fatosRelevantes: z.array(z.string()).optional().default([]),
    institutosJuridicos: z.array(z.string()).optional().default([]),
    fontes: z.array(z.string()).optional().default([]),
    termosDeBusca: z.array(z.string()).optional().default([])
});

const PlanoSchema = z.object({
    area: z.string().min(1),
    fontes: z.array(z.string()).min(1),
    palavrasChave: z.array(z.string()).min(1),
    termosAlternativos: z.array(z.string()).optional().default([]),
    leisSugeridas: z.array(z.string()).optional().default([]),
    temasJuridicos: z.array(TemaSchema).optional().default([]),
    estrategiaPesquisa: z.string().optional().default("")
});

function unico(lista = []) {
    return [...new Set(
        lista
            .map((item) => String(item || "").trim())
            .filter(Boolean)
    )];
}

function extrairReferenciasNormativas(texto) {
    const bruto = String(texto || "");
    const referencias = [];
    const padraoLeiNumerica = /\b(\d{1,3}[.,]\d{3}|\d{5,6})\s*\/\s*(\d{4})\b/g;
    let match;

    while ((match = padraoLeiNumerica.exec(bruto)) !== null) {
        const numero = match[1].replace(",", ".");
        referencias.push(`Lei ${numero}/${match[2]}`);
    }

    return unico(referencias);
}
function enriquecerPlano(plano, pergunta = "") {
    const fontesDosTemas = plano.temasJuridicos.flatMap((tema) => tema.fontes);
    const termosDosTemas = plano.temasJuridicos.flatMap((tema) => [
        tema.descricao,
        ...tema.institutosJuridicos,
        ...tema.termosDeBusca
    ]);

    return {
        ...plano,
        fontes: unico([...plano.fontes, ...plano.leisSugeridas, ...extrairReferenciasNormativas(pergunta), ...fontesDosTemas]),
        palavrasChave: unico([
            ...plano.palavrasChave,
            ...plano.termosAlternativos,
            ...extrairReferenciasNormativas(pergunta),
            ...termosDosTemas
        ])
    };
}

function montarPrompt(pergunta) {
    return `
Voce e um planejador geral de pesquisa juridica. NAO responda a pergunta do usuario.
Sua unica tarefa e transformar a narrativa do usuario em um plano de pesquisa amplo, estruturado e util para buscar fontes oficiais brasileiras.

Nao especialize o plano em uma area fixa e nao use listas fechadas de assuntos. Identifique livremente a area principal, areas relacionadas, pedidos explicitos, pedidos implicitos, fatos juridicamente relevantes, institutos juridicos possiveis, fontes provaveis e termos alternativos de pesquisa.

O plano deve ampliar a pesquisa, nao afunilar. Se a consulta tiver mais de uma pretensao, fato ou tese juridica, divida em temas juridicos separados. Cada tema deve ter seus proprios termos de busca e fontes provaveis.

Use conhecimento juridico geral apenas para planejar a pesquisa, sugerir termos equivalentes e indicar fontes provaveis. A resposta final sera dada por outro agente, que priorizara o material recuperado e podera complementar lacunas com enquadramento juridico seguro e sugestoes dirigidas de pesquisa em fontes legitimas.

Controle o tamanho do plano: para perguntas simples, use 1 tema; para narrativas medias, 2 a 4 temas; para casos complexos, no maximo 5 temas centrais. Em cada tema, use ate 6 termos de busca e ate 4 fontes provaveis.

As palavras-chave devem combinar linguagem do usuario, termos juridicos equivalentes e institutos tecnicos. Evite termos genericos demais e nao responda a consulta.

Responda SOMENTE com um JSON valido, sem markdown, sem texto extra, no formato exato abaixo. No campo "papel", use somente "central" ou "acessorio"; nao use "complementar", "secundario" ou outros sinonimos.
{
  "area": "area principal do Direito identificada",
  "fontes": ["fontes oficiais prioritarias para a consulta como um todo"],
  "palavrasChave": ["termos gerais de busca da consulta como um todo"],
  "termosAlternativos": ["sinonimos juridicos ou expressoes equivalentes uteis para busca"],
  "leisSugeridas": ["leis, codigos, sumulas, temas ou atos normativos provavelmente aplicaveis"],
  "temasJuridicos": [
    {
      "descricao": "subquestao juridica identificada",
      "papel": "central",
      "fatosRelevantes": ["fatos narrados pelo usuario ligados a este tema"],
      "institutosJuridicos": ["institutos ou categorias juridicas possiveis"],
      "fontes": ["fontes oficiais provaveis para este tema"],
      "termosDeBusca": ["termos especificos para pesquisar este tema"]
    }
  ],
  "estrategiaPesquisa": "criterio breve de priorizacao das buscas"
}

Pergunta do usuario:
"${pergunta}"
`.trim();
}

async function planejar(pergunta) {
    const prompt = montarPrompt(pergunta);
    const bruto = await geminiService.gerarJSON(prompt);

    const validado = PlanoSchema.safeParse(bruto);
    if (!validado.success) {
        throw new Error(
            `[planner] Plano retornado pela IA nao passou na validacao: ${validado.error.message}`
        );
    }

    return enriquecerPlano(validado.data, pergunta);
}

module.exports = { planejar };

