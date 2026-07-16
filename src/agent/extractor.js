/* ==================================================
   EXTRACTOR
   Cada provider já devolve dado relativamente limpo.
   Este módulo só garante um formato ÚNICO e previsível
   (DTO) para todos os documentos, seja qual for a fonte.
================================================== */
function normalizar(documentosBrutos = []) {
    return documentosBrutos
        .filter((doc) => doc && (doc.titulo || doc.texto))
        .map((doc) => ({
            fonte: doc.fonte || "Desconhecida",
            titulo: (doc.titulo || "Sem título").trim(),
            texto: (doc.texto || "").trim(),
            url: doc.url || null,
            tipoDocumento: doc.tipoDocumento || null,
            temaPesquisa: doc.temaPesquisa || null,
            coletadoEm: new Date().toISOString()
        }));
}

module.exports = { normalizar };
