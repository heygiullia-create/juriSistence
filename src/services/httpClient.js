/* ==================================================
   HTTP CLIENT COM TIMEOUT + RETRY
   Todos os providers passam por aqui.
   Isola a resiliencia (retry/timeout) da logica
   de scraping/parsing de cada fonte.

   Alguns sites oficiais brasileiros podem encerrar
   conexoes feitas por clientes HTTP mais estritos, ou
   apresentar cadeia TLS incompleta. O fallback permissivo
   abaixo fica restrito aos dominios oficiais conhecidos.
================================================== */
const util = require("util");
const { Agent, fetch: undiciFetch } = require("undici");
const { http } = require("../config");

const DOMINIOS_COM_CADEIA_TLS_INCOMPLETA = [".gov.br", ".jus.br", ".leg.br"];
const STATUS_CLIENTE_SEM_RETRY = new Set([400, 401, 403, 404, 405, 406, 410, 422]);
const CODIGOS_TRANSIENTES = new Set([
    "ECONNRESET",
    "ETIMEDOUT",
    "ECONNREFUSED",
    "EAI_AGAIN",
    "UND_ERR_SOCKET",
    "UND_ERR_CONNECT_TIMEOUT",
    "UND_ERR_HEADERS_TIMEOUT",
    "UND_ERR_BODY_TIMEOUT"
]);

const agentePermissivo = new Agent({
    connect: { rejectUnauthorized: false }
});

function ehDominioComCertificadoConhecidoQuebrado(url) {
    return DOMINIOS_COM_CADEIA_TLS_INCOMPLETA.some((sufixo) => url.includes(sufixo));
}

function codigoDoErro(erro) {
    return String(erro?.cause?.code || erro?.code || "");
}

function ehErroDeCertificado(erro) {
    const causa = codigoDoErro(erro);
    const mensagem = `${erro?.cause?.message || erro?.message || ""}`.toLowerCase();
    return (
        causa.includes("CERT") ||
        causa.includes("UNABLE_TO_VERIFY") ||
        mensagem.includes("certificate") ||
        mensagem.includes("self-signed") ||
        mensagem.includes("unable to verify")
    );
}

function ehErroTransienteDeConexao(erro) {
    const causa = codigoDoErro(erro);
    const mensagem = `${erro?.cause?.message || erro?.message || ""}`.toLowerCase();
    return (
        CODIGOS_TRANSIENTES.has(causa) ||
        mensagem.includes("socket") ||
        mensagem.includes("timeout") ||
        mensagem.includes("econnreset")
    );
}

function ehErroClienteSemRetry(erro) {
    return STATUS_CLIENTE_SEM_RETRY.has(erro?.status);
}

function criarErroHttp(resposta, url) {
    const erro = new Error(`HTTP ${resposta.status} em ${url}`);
    erro.status = resposta.status;
    return erro;
}

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function montarHeaders(options = {}) {
    return {
        "User-Agent": http.userAgent,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
        ...(options.headers || {})
    };
}

async function fetchComTimeout(url, options = {}, timeoutMs = http.timeoutMs, usarAgentePermissivo = false) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const resposta = await undiciFetch(url, {
            ...options,
            signal: controller.signal,
            headers: montarHeaders(options),
            ...(usarAgentePermissivo ? { dispatcher: agentePermissivo } : {})
        });
        return resposta;
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Executa uma requisicao HTTP com retry exponencial.
 * Nunca lanca para o chamador em caso de falha final:
 * retorna null para que o agente trate fonte indisponivel
 * como um estado normal do fluxo.
 */
async function getComRetry(url, options = {}) {
    let tentativa = 0;

    while (tentativa <= http.maxRetries) {
        try {
            const resposta = await fetchComTimeout(url, options);

            if (!resposta.ok) {
                throw criarErroHttp(resposta, url);
            }

            return resposta;
        } catch (erro) {
            tentativa++;
            const ultimaTentativa = tentativa > http.maxRetries;

            console.warn(
                `[httpClient] Falha (${tentativa}/${http.maxRetries + 1}) em ${url}`
            );
            console.warn(util.inspect(erro, { depth: 6, colors: false }));

            if (ehErroClienteSemRetry(erro)) {
                console.warn(`[httpClient] HTTP ${erro.status} nao e retentavel. Ignorando fonte: ${url}`);
                return null;
            }

            const podeUsarFallbackOficial =
                ehDominioComCertificadoConhecidoQuebrado(url) &&
                (ehErroDeCertificado(erro) || ehErroTransienteDeConexao(erro));

            if (podeUsarFallbackOficial) {
                console.warn(
                    `[httpClient] Tentando fallback TLS/conexao para fonte oficial: ${url}`
                );
                try {
                    const respostaFallback = await fetchComTimeout(url, options, http.timeoutMs, true);
                    if (respostaFallback.ok) return respostaFallback;
                    if (STATUS_CLIENTE_SEM_RETRY.has(respostaFallback.status)) return null;
                } catch (erroFallback) {
                    console.warn(`[httpClient] Fallback tambem falhou em ${url}: ${erroFallback.message}`);
                }
            }

            if (ultimaTentativa) {
                console.error(`[httpClient] Desistindo de ${url} apos ${tentativa} tentativas.`);
                return null;
            }

            await delay(http.retryDelayMs * tentativa);
        }
    }

    return null;
}

module.exports = { getComRetry };
