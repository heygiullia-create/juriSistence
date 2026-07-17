/* ==================================================
   CONFIGURAÃ‡ÃƒO CENTRAL
   Ãšnico lugar que conhece variÃ¡veis de ambiente,
   timeouts e a lista de fontes oficiais habilitadas.
================================================== */
require("dotenv").config({ quiet: true });

function limparValorEnv(valor) {
    return String(valor || "").trim();
}

function limparModeloOpenRouter(valor) {
    const modelo = limparValorEnv(valor);
    return modelo.replace(/^OPENROUTER_MODEL\s*=\s*/i, "");
}
module.exports = {
    gemini: {
        apiKey: process.env.GEMINI_API_KEY,
        model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
        maxRetries: Number(process.env.GEMINI_MAX_RETRIES || 1),
        retryDelayMs: Number(process.env.GEMINI_RETRY_DELAY_MS || 800)
    },

    groq: {
        apiKey: process.env.GROQ_API_KEY,
        model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
        baseUrl: process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1",
        timeoutMs: Number(process.env.GROQ_TIMEOUT_MS || 30000)
    },

    openrouter: {
        apiKey: process.env.OPENROUTER_API_KEY,
        model: limparModeloOpenRouter(process.env.OPENROUTER_MODEL),
        baseUrl: process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1",
        timeoutMs: Number(process.env.OPENROUTER_TIMEOUT_MS || 30000),
        appName: process.env.OPENROUTER_APP_NAME || "JuriSistence"
    },

    http: {
        timeoutMs: Number(process.env.HTTP_TIMEOUT_MS || 3500),
        maxRetries: Number(process.env.HTTP_MAX_RETRIES || 0),
        retryDelayMs: Number(process.env.HTTP_RETRY_DELAY_MS || 300),
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
    },

    // DomÃ­nios que o Validator aceita como "fonte oficial".
    // Qualquer resultado fora desta lista Ã© descartado.
    dominiosOficiais: [
        "planalto.gov.br",
        "lexml.gov.br",
        "senado.leg.br",
        "camara.leg.br",
        "stf.jus.br",
        "stj.jus.br",
        "tst.jus.br",
        "cnj.jus.br"
    ],

    // Tamanho mÃ¡ximo (em caracteres) de cada trecho de documento
    // enviado ao Gemini na 2Âª chamada, para controlar custo/latÃªncia.
    limiteCaracteresPorDocumento: Number(process.env.LIMITE_CARACTERES_POR_DOCUMENTO || 1800),

    // Quantidade mÃ¡xima de documentos que seguem para o relatÃ³rio final.
    limiteDocumentosRelatorio: Number(process.env.LIMITE_DOCUMENTOS_RELATORIO || 6),

    pesquisa: {
        limiteTemas: Number(process.env.LIMITE_TEMAS_PESQUISA || 2)
    }
};


