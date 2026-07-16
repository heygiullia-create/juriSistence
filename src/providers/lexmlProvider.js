/* ==================================================
   PROVIDER: LexML Brasil

   O endpoint antigo /busca/SRU passou a retornar 404.
   Este provider usa a busca web oficial atual do LexML
   (/busca/search), que segue disponivel publicamente.
================================================== */
const cheerio = require("cheerio");
const { getComRetry } = require("../services/httpClient");

const BASE_URL = "https://www.lexml.gov.br";
const SEARCH_ENDPOINT = `${BASE_URL}/busca/search`;
const MAX_REGISTROS = 8;

function limparTexto(texto = "") {
    return texto
        .replace(/\s+/g, " ")
        .replace(/\s+([,.;:])/g, "$1")
        .trim();
}

function normalizar(texto = "") {
    return limparTexto(texto)
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
}

function montarQueryWeb(palavrasChave = []) {
    const termos = palavrasChave
        .map((termo) => limparTexto(String(termo || "")))
        .filter(Boolean)
        .slice(0, 6);

    if (termos.length === 0) return null;
    return termos.join(" ");
}

function montarUrlBusca(query, tipoDocumento = null) {
    const keyword = encodeURIComponent(query);
    const filtroTipo = tipoDocumento ? `;f1-tipoDocumento=${encodeURIComponent(tipoDocumento)}` : "";
    return `${SEARCH_ENDPOINT}?keyword=${keyword}${filtroTipo}`;
}

function absolutizarUrl(href) {
    if (!href) return null;
    if (href.startsWith("http://") || href.startsWith("https://")) return href;
    if (href.startsWith("/")) return `${BASE_URL}${href}`;
    return `${BASE_URL}/busca/${href}`;
}

function extrairCampo($, bloco, nomeCampo) {
    const nomeNormalizado = normalizar(nomeCampo);

    let valor = "";
    $(bloco)
        .find("tr")
        .each((_, linha) => {
            const rotulo = normalizar($(linha).find("td.col2 b").first().text());
            if (rotulo === nomeNormalizado) {
                valor = limparTexto($(linha).find("td.col3").first().text());
            }
        });

    return valor || null;
}

function extrairTituloEUrl($, bloco) {
    let titulo = null;
    let url = null;

    $(bloco)
        .find("tr")
        .each((_, linha) => {
            const rotulo = normalizar($(linha).find("td.col2 b").first().text());
            if (rotulo === "titulo") {
                const link = $(linha).find("td.col3 a").first();
                titulo = limparTexto(link.text() || $(linha).find("td.col3").first().text());
                url = absolutizarUrl(link.attr("href"));
            }
        });

    return { titulo, url };
}

function extrairRegistros(html, fonte = "LexML") {
    const $ = cheerio.load(html);
    const registros = [];

    $("div.docHit").each((_, bloco) => {
        const { titulo, url } = extrairTituloEUrl($, bloco);
        const tipoDocumento = extrairCampo($, bloco, "Tipo");
        const data = extrairCampo($, bloco, "Data");
        const autor = extrairCampo($, bloco, "Autor");
        const ementa = extrairCampo($, bloco, "Ementa");
        const assuntos = extrairCampo($, bloco, "Assuntos");
        const classificacao = extrairCampo($, bloco, "Classificacao");

        const partesTexto = [
            tipoDocumento ? `Tipo: ${tipoDocumento}.` : null,
            data ? `Data: ${data}.` : null,
            autor ? `Autor: ${autor}.` : null,
            ementa ? `Ementa: ${ementa}` : null,
            assuntos ? `Assuntos: ${assuntos}` : null,
            classificacao ? `Classificacao: ${classificacao}` : null
        ].filter(Boolean);

        if (!titulo && partesTexto.length === 0) return;

        registros.push({
            fonte,
            titulo: titulo || "Resultado LexML sem titulo",
            texto: limparTexto(partesTexto.join(" ")),
            url,
            tipoDocumento: tipoDocumento || null
        });
    });

    return registros.slice(0, MAX_REGISTROS);
}

async function searchPorTipo(palavrasChave = [], tipoDocumento = null, fonte = "LexML") {
    const query = montarQueryWeb(palavrasChave);
    if (!query) return [];

    const url = montarUrlBusca(query, tipoDocumento);
    try {
        const resposta = await getComRetry(url);
        if (!resposta) return [];

        const html = await resposta.text();
        if (!html || html.trim().length === 0) return [];

        return extrairRegistros(html, fonte);
    } catch (erro) {
        console.error(`[lexmlProvider] Falha ao consultar LexML: ${erro.message}`);
        return [];
    }
}

async function search(palavrasChave = []) {
    return searchPorTipo(palavrasChave, "Legislação", "LexML Legislação");
}

module.exports = { nome: "LexML", search, searchPorTipo };
