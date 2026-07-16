/* ==================================================
   REPORT GENERATOR
   2a chamada ao Gemini.
   Redige a resposta juridica final ao cliente.
================================================== */
const geminiService = require("../services/geminiService");
const { limiteCaracteresPorDocumento } = require("../config");
const planaltoProvider = require("../providers/planaltoProvider");

const FONTES_REFERENCIA = [
    { termos: ["stf", "supremo"], nome: "STF - Pesquisa de jurisprudencia complementar", url: "https://jurisprudencia.stf.jus.br/" },
    { termos: ["stj", "superior tribunal de justica"], nome: "STJ - Pesquisa de jurisprudencia complementar", url: "https://processo.stj.jus.br/SCON/" },
    { termos: ["tst", "tribunal superior do trabalho"], nome: "TST - Pesquisa de jurisprudencia complementar", url: "https://jurisprudencia.tst.jus.br/" },
    { termos: ["cnj", "conselho nacional de justica"], nome: "CNJ - Pesquisa complementar", url: "https://atos.cnj.jus.br/" },
    { termos: ["lexml", "jurisprudencia", "sumula", "acordao"], nome: "LexML Brasil - Pesquisa complementar", url: "https://www.lexml.gov.br/" }
];

function normalizar(texto) {
    return String(texto || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim();
}

function unicoPorUrl(lista = []) {
    const vistos = new Set();
    const unicos = [];

    for (const item of lista) {
        const chave = `${item.nome}::${item.url}`.toLowerCase();
        if (vistos.has(chave)) continue;
        vistos.add(chave);
        unicos.push(item);
    }

    return unicos;
}

function coletarTermosDoPlano(plano) {
    return [
        plano.area,
        ...(plano.fontes || []),
        ...(plano.leisSugeridas || []),
        ...(plano.palavrasChave || []),
        ...((plano.temasJuridicos || []).flatMap((tema) => [
            tema.descricao,
            ...(tema.fontes || []),
            ...(tema.institutosJuridicos || []),
            ...(tema.termosDeBusca || [])
        ]))
    ].filter(Boolean);
}

function formatarFontesDeReferencia(plano) {
    const termos = coletarTermosDoPlano(plano);
    const textoPlano = normalizar(termos.join(" "));
    const referencias = [];

    for (const termo of termos) {
        const url = planaltoProvider.encontrarUrlDaNorma(termo);
        if (url) referencias.push({ nome: termo, url });
    }

    for (const fonte of FONTES_REFERENCIA) {
        if (fonte.termos.some((termo) => textoPlano.includes(termo))) {
            referencias.push({ nome: fonte.nome, url: fonte.url });
        }
    }

    if (referencias.length === 0) {
        referencias.push(
            { nome: "Portal da Legislacao - Planalto", url: "https://www4.planalto.gov.br/legislacao" },
            { nome: "LexML Brasil", url: "https://www.lexml.gov.br/" }
        );
    }

    return unicoPorUrl(referencias)
        .slice(0, 8)
        .map((fonte) => `- ${fonte.nome}: ${fonte.url}`)
        .join("\n");
}

function formatarDocumentosParaPrompt(documentos) {
    if (!documentos.length) {
        return "Sem trechos adicionais recuperados para fundamentacao direta nesta consulta.";
    }

    return documentos
        .map((doc, indice) => {
            const texto = doc.texto.slice(0, limiteCaracteresPorDocumento);
            return `
[Documento ${indice + 1}]
Fonte: ${doc.fonte}
Titulo: ${doc.titulo}
URL: ${doc.url || "nao disponivel"}
Tema da pesquisa: ${doc.temaPesquisa || "nao especificado"}
Conteudo:
${texto}
`.trim();
        })
        .join("\n\n---\n\n");
}

function formatarPlanoParaPrompt(plano) {
    const temas = (plano.temasJuridicos || [])
        .map((tema, indice) => {
            const partes = [
                `${indice + 1}. ${tema.descricao}`,
                tema.papel ? `Papel: ${tema.papel}` : null,
                tema.fatosRelevantes?.length ? `Fatos relevantes: ${tema.fatosRelevantes.join("; ")}` : null,
                tema.institutosJuridicos?.length ? `Institutos: ${tema.institutosJuridicos.join("; ")}` : null
            ].filter(Boolean);

            return partes.join("\n");
        })
        .join("\n\n");

    return `
Area identificada: ${plano.area}
Estrategia de pesquisa: ${plano.estrategiaPesquisa || "nao informada"}
Temas juridicos identificados:
${temas || "Tema unico ou nao detalhado pelo planejador."}
`.trim();
}

function montarPrompt(pergunta, plano, documentos) {
    const materialColetado = formatarDocumentosParaPrompt(documentos);
    const planoPesquisa = formatarPlanoParaPrompt(plano);
    const fontesReferencia = formatarFontesDeReferencia(plano);
    return `
Voce e um analista juridico brasileiro senior. Redija uma analise juridica informativa e contextual para um cliente, em portugues do Brasil, com linguagem tecnica, natural, sobria e objetiva. A resposta deve soar como explicacao juridica profissional, nao como lista, script, chatbot ou mensagem de sistema.

Saudacao obrigatoria: toda resposta deve comecar exatamente com "Prezado(a) cliente,". Nao coloque qualquer texto antes disso.

Pergunta original do cliente:
"${pergunta}"

Area identificada: ${plano.area}

PLANO DE PESQUISA
${planoPesquisa}

MATERIAL COLETADO PELA BUSCA
${materialColetado}

FONTES OFICIAIS DE REFERENCIA PARA CITACAO OU APROFUNDAMENTO
${fontesReferencia}

Regras centrais de resposta:

Use o material coletado sempre que ele existir e for pertinente. Conecte os artigos, julgados ou documentos recuperados diretamente ao objeto da pergunta, sem apresentar o material como inventario solto.

Se a pergunta envolver plano de crime, violencia, vinganca, trafico de drogas, homicidio, ameaca ou outra conduta ilicita grave, nao forneca orientacao operacional, estrategia de execucao, ocultacao ou reducao de risco pratico. Responda pelo enquadramento juridico informativo, consequencias penais provaveis, inexistencia de justificantes quando cabivel e, somente quando a pergunta pedir providencias, indique caminhos licitos de denuncia/protecao.

Se a busca automatica nao trouxer documento suficiente para algum ponto, seja cauteloso: nao transforme projeto, lei citada ou jurisprudencia nao recuperada em afirmacao confirmada. Quando a pergunta mencionar lei, artigo, sumula, tema ou jurisprudencia especifica e o material coletado nao contiver esse documento, diga de forma natural que a confirmacao exige consulta direta da fonte oficial antes de concluir. Use enquadramento juridico geral apenas como orientacao provisoria e deixe claro quando for pesquisa complementar, nao fonte consultada.

Nao invente numero de artigo, sumula, tema repetitivo, tese, numero de processo, orgao julgador ou link especifico. Cite artigo com numero somente quando ele estiver no material coletado ou quando a fonte primaria direta da norma estiver listada. Para jurisprudencia, cite tribunal, tese, numero de processo ou entendimento especifico somente se houver documento jurisprudencial recuperado no material coletado. Se nao houver julgado recuperado, diga que ha pesquisa jurisprudencial complementar a fazer, sem apresentar a pagina inicial do tribunal como fonte consultada do entendimento.

Para casos narrados pelo cliente, a primeira frase apos a saudacao deve reformular o problema em uma unica frase, demonstrando compreensao sem repetir a narrativa. Em seguida, enquadre juridicamente os fatos conforme o pedido. So inclua orientacao pratica, providencias, estrategia, defesa ou proximo passo quando o usuario pedir isso expressamente ou quando a pergunta usar expressoes como "o que fazer", "como agir", "como processar", "como me defender", "quais medidas", "quais providencias", "quais leis usar" ou equivalentes.

Tamanho proporcional:
- Pergunta simples ou conceitual: 1 a 2 paragrafos diretos antes das fontes.
- Caso narrado com uma unica questao juridica: 2 paragrafos antes das fontes, sendo um de enquadramento juridico e outro de consequencias/limites juridicos; use orientacao pratica apenas se solicitada.
- Caso com multiplas questoes, multiplos artigos, risco penal/civil relevante, ou lei especifica citada: 3 a 5 paragrafos antes das fontes, cada um avancando um ponto diferente.
Nao aumente o texto artificialmente.

Estilo:
Escreva em prosa corrida. Evite topicos no corpo da resposta, transicoes vazias, frases solenes desnecessarias, meta-comentarios sobre limitacoes do sistema e redundancia entre paragrafos. Cada paragrafo deve acrescentar informacao nova.

Incorpore artigos, codigos, sumulas e julgados no momento em que eles resolvem uma parte do raciocinio informativo. Nao escreva sequencias do tipo "o art. X diz..., ja o art. Y diz..., por fim o art. Z diz..." sem conexao com o fato analisado.

Nao use markdown no corpo da resposta. Links em markdown devem aparecer apenas no bloco final de fontes.

Autochecagem obrigatoria antes de finalizar: releia a resposta e remova qualquer numero de processo, REsp, Tema, Sumula, tese jurisprudencial, inciso, paragrafo ou artigo que nao esteja claramente apoiado no MATERIAL COLETADO ou em fonte primaria direta listada. Em caso de duvida, prefira dizer "depende de confirmacao na fonte oficial" em vez de citar o numero.

Nao termine com oferta de ajuda, saudacao final, propaganda, emoji ou recomendacao generica de procurar advogado. A ultima parte deve ser o bloco de fontes.

Bloco final obrigatorio:
Ao final, inclua um bloco separado chamado exatamente "Fontes consultadas". Liste uma fonte por linha, com link quando disponivel. Mantenha esse bloco mesmo em respostas curtas. Inclua como fontes consultadas os documentos efetivamente usados do material coletado. Nao liste pagina inicial de tribunal ou repositorio como fonte consultada de jurisprudencia nao recuperada; nesse caso, mencione no corpo como pesquisa complementar, sem colocar como prova da conclusao. Use links markdown apenas aqui.

Formato do bloco final:
Fontes consultadas
[Nome da fonte](URL)
[Nome da fonte](URL)

Agora redija a resposta final.
`.trim();
}

function limparMarcacaoDeMarkdown(texto) {
    if (!texto) return texto;

    return texto
        .replace(/^#{1,6}\s*/gm, "")
        .replace(/\*\*(.*?)\*\*/g, "$1")
        .replace(/\*(.*?)\*/g, "$1")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

async function gerarRelatorio(pergunta, plano, documentos) {
    const prompt = montarPrompt(pergunta, plano, documentos);
    const relatorio = await geminiService.gerarTexto(prompt);
    return limparMarcacaoDeMarkdown(relatorio);
}

module.exports = { gerarRelatorio };




