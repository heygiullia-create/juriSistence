/* ==================================================
   PROVIDER: Jurisprudencia via LexML

   Substitui o placeholder anterior por busca real na
   base oficial do LexML, filtrada por Jurisprudencia.
   A busca jurisprudencial do LexML e sensivel a termos
   combinados, entao pesquisamos termos individuais e
   deduplicamos os resultados.
================================================== */
const lexmlProvider = require("./lexmlProvider");

const MAX_RESULTADOS = 4;
const MAX_TERMOS = 2;

function limparTexto(texto = "") {
    return String(texto || "").replace(/\s+/g, " ").trim();
}

function chaveDocumento(doc) {
    return `${doc.url || ""}::${doc.titulo || ""}`.toLowerCase();
}

function deduplicar(documentos) {
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

function termosDeBusca(palavrasChave = []) {
    const termos = palavrasChave.map(limparTexto).filter(Boolean);
    return termos.length > 0 ? termos.slice(0, MAX_TERMOS) : ["jurisprudencia"];
}

async function buscarTermo(termo, nomeFonte = "") {
    const fonteLimpa = limparTexto(nomeFonte);
    const nomeExibicao = fonteLimpa
        ? `LexML Jurisprudencia (${fonteLimpa})`
        : "LexML Jurisprudencia";

    // Primeiro tenta restringir pela fonte solicitada. Se nao vier nada,
    // usa a jurisprudencia ampla para nao deixar a consulta vazia.
    if (fonteLimpa) {
        const especificos = await lexmlProvider.searchPorTipo(
            [termo, fonteLimpa],
            "Jurisprudência",
            nomeExibicao
        );
        if (especificos.length > 0) return especificos;
    }

    return lexmlProvider.searchPorTipo([termo], "Jurisprudência", "LexML Jurisprudencia");
}

async function search(palavrasChave = [], nomesFontes = []) {
    const fontes = nomesFontes.map(limparTexto).filter(Boolean).slice(0, 2);
    const termos = termosDeBusca(palavrasChave);
    const resultados = [];

    if (fontes.length === 0) {
        for (const termo of termos) {
            resultados.push(...await buscarTermo(termo));
            if (deduplicar(resultados).length >= MAX_RESULTADOS) break;
        }
    } else {
        for (const fonte of fontes) {
            for (const termo of termos) {
                resultados.push(...await buscarTermo(termo, fonte));
                if (deduplicar(resultados).length >= MAX_RESULTADOS) break;
            }
            if (deduplicar(resultados).length >= MAX_RESULTADOS) break;
        }
    }

    return deduplicar(resultados).slice(0, MAX_RESULTADOS);
}

module.exports = { nome: "Jurisprudencia via LexML", search };
