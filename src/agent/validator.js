/* ==================================================
   VALIDATOR
   Última linha de defesa antes de mandar qualquer coisa
   para o Gemini interpretar. Garante que só passam
   documentos íntegros e de fontes oficiais.
================================================== */
const { dominiosOficiais, limiteDocumentosRelatorio } = require("../config");

function dominioEhOficial(url) {
    if (!url) return true; // documentos sem URL (ex.: trecho do Planalto) já vêm de fonte confiável conhecida
    return dominiosOficiais.some((dominio) => url.includes(dominio));
}

function chaveDeDuplicidade(doc) {
    return `${doc.fonte}::${doc.titulo}`.toLowerCase();
}

function validar(documentos = []) {
    const vistos = new Set();
    const validos = [];

    for (const doc of documentos) {
        if (!doc.titulo && !doc.texto) continue;
        if (doc.texto && doc.texto.length < 10) continue;
        if (!dominioEhOficial(doc.url)) {
            console.warn(`[validator] Documento descartado por domínio não oficial: ${doc.url}`);
            continue;
        }

        const chave = chaveDeDuplicidade(doc);
        if (vistos.has(chave)) continue;
        vistos.add(chave);

        validos.push(doc);
    }

    return validos.slice(0, limiteDocumentosRelatorio);
}

module.exports = { validar };
