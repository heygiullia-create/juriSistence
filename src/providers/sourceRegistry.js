/* ==================================================
   SOURCE REGISTRY
   Ponto único que sabe traduzir o nome de uma fonte
   (string vinda do Planner/Gemini) para o provider
   concreto que sabe buscar naquela fonte.

   Adicionar uma nova fonte = adicionar uma entrada aqui.
   Nenhum outro módulo precisa mudar.
================================================== */
const lexmlProvider = require("./lexmlProvider");
const planaltoProvider = require("./planaltoProvider");
const jurisprudenciaProvider = require("./jurisprudenciaProvider");

const LIMITE_TEMAS_PESQUISA = 5;

const FONTES_OFICIAIS_FALLBACK = [
    {
        fonte: "Portal da Legislacao - Planalto",
        titulo: "Portal da Legislacao - Planalto",
        texto: "Fonte oficial para consulta da legislacao federal brasileira, incluindo Constituicao, codigos e leis federais.",
        url: "https://www4.planalto.gov.br/legislacao",
        tipoDocumento: "Fonte oficial de referencia"
    },
    {
        fonte: "LexML Brasil",
        titulo: "LexML Brasil",
        texto: "Rede de informacao legislativa e juridica que permite pesquisar legislacao, jurisprudencia e outros documentos oficiais brasileiros.",
        url: "https://www.lexml.gov.br/",
        tipoDocumento: "Fonte oficial de referencia"
    }
];

function normalizar(texto) {
    return texto
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim();
}

const MAPA_TRIBUNAIS = ["stf", "stj", "tst", "cnj", "supremo", "superior tribunal"];

function classificarFonte(nomeFonte) {
    const chave = normalizar(nomeFonte);
    if (MAPA_TRIBUNAIS.some((t) => chave.includes(t))) return "jurisprudencia";
    return "legislacao";
}

function unico(lista = []) {
    return [...new Set(
        lista
            .map((item) => String(item || "").trim())
            .filter(Boolean)
    )];
}

function montarConsultas(planoOuFontes = [], palavrasChave = []) {
    if (!planoOuFontes || Array.isArray(planoOuFontes)) {
        return [{
            fontes: unico(planoOuFontes),
            palavrasChave: unico(palavrasChave),
            tema: "consulta geral"
        }];
    }

    const plano = planoOuFontes;
    const consultas = [];

    consultas.push({
        fontes: unico([...(plano.fontes || []), ...(plano.leisSugeridas || [])]),
        palavrasChave: unico([...(plano.palavrasChave || []), ...(plano.termosAlternativos || [])]),
        tema: "consulta geral"
    });

    const temas = (plano.temasJuridicos || [])
        .filter((tema) => tema && tema.descricao)
        .slice(0, LIMITE_TEMAS_PESQUISA);

    for (const tema of temas) {
        consultas.push({
            fontes: unico([...(tema.fontes || []), ...(plano.fontes || [])]),
            palavrasChave: unico([
                tema.descricao,
                ...(tema.institutosJuridicos || []),
                ...(tema.termosDeBusca || []),
                ...(tema.fatosRelevantes || [])
            ]),
            tema: tema.descricao
        });
    }

    return consultas.filter(
        (consulta) => consulta.fontes.length > 0 || consulta.palavrasChave.length > 0
    );
}

function chaveDocumento(doc) {
    return `${doc.url || ""}::${doc.fonte || ""}::${doc.titulo || ""}`.toLowerCase();
}

function deduplicar(documentos = []) {
    const vistos = new Set();
    const unicos = [];

    for (const doc of documentos) {
        const chave = chaveDocumento(doc);
        if (vistos.has(chave)) continue;
        vistos.add(chave);
        unicos.push(doc);
    }

    return unicos;
}

function coletarPossiveisNormas(planoOuFontes = []) {
    if (!planoOuFontes || Array.isArray(planoOuFontes)) return planoOuFontes || [];

    return unico([
        ...(planoOuFontes.fontes || []),
        ...(planoOuFontes.leisSugeridas || []),
        ...((planoOuFontes.temasJuridicos || []).flatMap((tema) => [
            ...(tema.fontes || []),
            ...(tema.institutosJuridicos || [])
        ]))
    ]);
}

function montarFontesFallback(planoOuFontes = []) {
    const normas = coletarPossiveisNormas(planoOuFontes)
        .map((nome) => ({
            nome,
            url: planaltoProvider.encontrarUrlDaNorma(nome)
        }))
        .filter((item) => item.url);

    const documentosNormas = normas.map((item) => ({
        fonte: "Planalto",
        titulo: item.nome,
        texto: `Fonte oficial de referencia para consulta da norma "${item.nome}" no Portal do Planalto.`,
        url: item.url,
        tipoDocumento: "Legislacao"
    }));

    return deduplicar([...documentosNormas, ...FONTES_OFICIAIS_FALLBACK]);
}

async function buscarConsulta(consulta) {
    const fontesLegislacao = consulta.fontes.filter((f) => classificarFonte(f) === "legislacao");
    const fontesJurisprudencia = consulta.fontes.filter((f) => classificarFonte(f) === "jurisprudencia");
    let fontesIndisponiveis = false;

    const tarefas = [
        () => lexmlProvider.search(consulta.palavrasChave),
        () => planaltoProvider.search(consulta.palavrasChave, fontesLegislacao),
        () => jurisprudenciaProvider.search(consulta.palavrasChave, fontesJurisprudencia)
    ].map((tarefa) => Promise.resolve().then(tarefa));

    const resultados = await Promise.allSettled(tarefas);
    const documentos = [];

    resultados.forEach((resultado, indice) => {
        if (resultado.status === "fulfilled") {
            documentos.push(...resultado.value.map((doc) => ({
                ...doc,
                temaPesquisa: consulta.tema
            })));
        } else {
            fontesIndisponiveis = true;
            console.error(
                `[sourceRegistry] Provider ${indice} falhou em "${consulta.tema}": ${resultado.reason?.message || resultado.reason}`
            );
        }
    });

    documentos.fontesIndisponiveis = fontesIndisponiveis;
    return documentos;
}

/**
 * Executa a busca em todas as fontes sugeridas pelo Planner,
 * em paralelo (Promise.allSettled), sem deixar uma fonte lenta
 * ou fora do ar travar as demais.
 */
async function buscarEmTodasAsFontes(planoOuFontes = [], palavrasChave = []) {
    const consultas = montarConsultas(planoOuFontes, palavrasChave);
    const resultados = await Promise.allSettled(consultas.map(buscarConsulta));
    const documentos = [];
    let fontesIndisponiveis = false;

    resultados.forEach((resultado, indice) => {
        if (resultado.status === "fulfilled") {
            if (resultado.value.fontesIndisponiveis) fontesIndisponiveis = true;
            documentos.push(...resultado.value);
        } else {
            fontesIndisponiveis = true;
            console.error(
                `[sourceRegistry] Consulta ${indice} falhou: ${resultado.reason?.message || resultado.reason}`
            );
        }
    });

    const documentosUnicos = deduplicar(documentos);

    if (documentosUnicos.length > 0) {
        documentosUnicos.fontesIndisponiveis = fontesIndisponiveis;
        return documentosUnicos;
    }

    console.warn("[sourceRegistry] Nenhuma fonte retornou documentos. Usando fontes oficiais de referencia.");
    const fallback = montarFontesFallback(planoOuFontes);
    fallback.fontesIndisponiveis = true;
    fallback.fontesSubstituidas = true;
    return fallback;
}

module.exports = { buscarEmTodasAsFontes };
