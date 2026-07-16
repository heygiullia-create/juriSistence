/* ==================================================
   PROVIDER: Portal da LegislaÃ§Ã£o (Planalto)
   Fallback usado quando o LexML nÃ£o retorna nada,
   ou quando a fonte pedida Ã© claramente um dos
   principais cÃ³digos/normas federais.

   Planalto nÃ£o expÃµe uma API de busca pÃºblica, entÃ£o
   aqui fazemos scraping DIRETO E PONTUAL do texto oficial
   de normas conhecidas (mapa abaixo), respeitando timeout
   e sem paralelismo agressivo. Novas normas podem ser
   adicionadas ao mapa sem alterar nenhuma outra camada.
================================================== */
const cheerio = require("cheerio");
const { getComRetry } = require("../services/httpClient");

// Mapa de normas conhecidas -> URL oficial no Planalto.
// FÃ¡cil de estender: basta adicionar uma nova entrada.
const NORMAS_CONHECIDAS = {
    "constituicao federal": "https://www.planalto.gov.br/ccivil_03/constituicao/constituicao.htm",
    "clt": "https://www.planalto.gov.br/ccivil_03/decreto-lei/del5452.htm",
    "consolidacao das leis do trabalho": "https://www.planalto.gov.br/ccivil_03/decreto-lei/del5452.htm",
    "codigo civil": "https://www.planalto.gov.br/ccivil_03/leis/2002/l10406compilada.htm",
    "codigo penal": "https://www.planalto.gov.br/ccivil_03/decreto-lei/del2848compilado.htm",
    "codigo de defesa do consumidor": "https://www.planalto.gov.br/ccivil_03/leis/l8078compilado.htm",
    "codigo tributario nacional": "https://www.planalto.gov.br/ccivil_03/leis/l5172compilado.htm",
    "codigo de processo civil": "https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2015/lei/l13105.htm",
    "codigo de processo penal": "https://www.planalto.gov.br/ccivil_03/decreto-lei/del3689compilado.htm",
    "eca": "https://www.planalto.gov.br/ccivil_03/leis/l8069.htm",
    "estatuto da crianca e do adolescente": "https://www.planalto.gov.br/ccivil_03/leis/l8069.htm",
    "lgpd": "https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm",
    "lei geral de protecao de dados": "https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm",
    "marco civil da internet": "https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2014/lei/l12965.htm",
    "estatuto da pessoa idosa": "https://www.planalto.gov.br/ccivil_03/leis/2003/l10.741.htm",
    "estatuto do idoso": "https://www.planalto.gov.br/ccivil_03/leis/2003/l10.741.htm",
    "estatuto da igualdade racial": "https://www.planalto.gov.br/ccivil_03/_ato2007-2010/2010/lei/l12288.htm"
};

function normalizar(texto) {
    return texto
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim();
}
function obterPeriodoAto(ano) {
    if (ano >= 2023 && ano <= 2026) return "_ato2023-2026";
    if (ano >= 2019 && ano <= 2022) return "_ato2019-2022";
    if (ano >= 2015 && ano <= 2018) return "_ato2015-2018";
    if (ano >= 2011 && ano <= 2014) return "_ato2011-2014";
    if (ano >= 2007 && ano <= 2010) return "_ato2007-2010";
    if (ano >= 2004 && ano <= 2006) return "_ato2004-2006";
    return null;
}

function montarUrlLeiFederal(nomeFonte) {
    const texto = normalizar(nomeFonte).replace(/\s+/g, " ");
    const match = texto.match(/\blei(?:\s+n[oº.]*)?\s+(\d{1,3}(?:\.\d{3})*|\d{4,6})\s*(?:\/|,?\s+de\s+)(\d{4})\b/);
    if (!match) return null;

    const numero = match[1].replace(/\D/g, "");
    const ano = Number(match[2]);
    const periodo = obterPeriodoAto(ano);
    if (!periodo) return null;

    return `https://www.planalto.gov.br/ccivil_03/${periodo}/${ano}/lei/L${numero}.htm`;
}

function montarUrlEmendaConstitucional(nomeFonte) {
    const texto = normalizar(nomeFonte).replace(/\s+/g, " ");
    const match = texto.match(/\b(?:emenda constitucional|ec)\s+n?[oº.]?\s*(\d{1,4})\s*(?:\/|,?\s+de\s+)(\d{4})\b/);
    if (!match) return null;

    const numero = match[1].replace(/\D/g, "");
    const ano = Number(match[2]);
    const periodo = obterPeriodoAto(ano);
    if (!periodo) return null;

    return `https://www.planalto.gov.br/ccivil_03/${periodo}/${ano}/emenda/emc${numero}.htm`;
}


function encontrarUrlDaNorma(nomeFonte) {
    const chave = normalizar(nomeFonte);
    if (NORMAS_CONHECIDAS[chave]) return NORMAS_CONHECIDAS[chave];

    const urlLeiFederal = montarUrlLeiFederal(nomeFonte);
    if (urlLeiFederal) return urlLeiFederal;

    const urlEmendaConstitucional = montarUrlEmendaConstitucional(nomeFonte);
    if (urlEmendaConstitucional) return urlEmendaConstitucional;
    // busca parcial: "constituiÃ§Ã£o" casa com "constituicao federal"
    const encontrada = Object.keys(NORMAS_CONHECIDAS).find(
        (k) => k.includes(chave) || chave.includes(k)
    );
    return encontrada ? NORMAS_CONHECIDAS[encontrada] : null;
}

/**
 * Busca, dentro do HTML da norma, os parÃ¡grafos ("Art. X") que
 * contÃªm pelo menos uma das palavras-chave fornecidas pelo Planner.
 */

function lerHtmlPlanalto(resposta) {
    return resposta.arrayBuffer().then((buffer) => {
        const bytes = new Uint8Array(buffer);
        return new TextDecoder("windows-1252").decode(bytes);
    });
}
function extrairArtigosRelevantes(html, palavrasChave, url) {
    const $ = cheerio.load(html);
    const textoCompleto = $("body").text();

    // O texto oficial normalmente separa artigos por "Art."
    const blocos = textoCompleto.split(/(?=Art\.\s?\d)/g);
    const termos = palavrasChave.map((p) => normalizar(p)).filter(Boolean);

    let relevantes = blocos.filter((bloco) => {
        const blocoNormalizado = normalizar(bloco);
        return termos.some((termo) => blocoNormalizado.includes(termo));
    });

    if (relevantes.length === 0) {
        relevantes = blocos
            .map((bloco) => bloco.trim())
            .filter((bloco) => /^Art\.\s?\d/.test(bloco))
            .slice(0, 3);
    }

    return relevantes.slice(0, 5).map((bloco) => ({
        fonte: "Planalto",
        titulo: bloco.trim().slice(0, 80).replace(/\s+/g, " ") + "...",
        texto: bloco.trim().replace(/\s+/g, " ").slice(0, 2000),
        url,
        tipoDocumento: "Legislacao"
    }));
}

async function search(palavrasChave = [], nomesFontes = []) {
    const resultados = [];

    for (const nomeFonte of nomesFontes) {
        try {
            const url = encontrarUrlDaNorma(nomeFonte);
            if (!url) continue;

            const resposta = await getComRetry(url);
            if (!resposta) continue;

            const html = await lerHtmlPlanalto(resposta);
            if (!html) continue;

            const artigos = extrairArtigosRelevantes(html, palavrasChave, url);
            resultados.push(...artigos);
        } catch (erro) {
            console.error(`[planaltoProvider] Falha ao consultar ${nomeFonte}: ${erro.message}`);
        }
    }

    return resultados;
}

module.exports = { nome: "Planalto", search, encontrarUrlDaNorma };














