/* ==================================================
   OPENROUTER SERVICE
   Fallback OpenAI-compatible para modelos gratuitos
   escolhidos no painel da OpenRouter.
================================================== */
const { fetch: undiciFetch } = require("undici");
const { openrouter } = require("../config");

if (!openrouter.apiKey) {
    console.warn("[openrouterService] OPENROUTER_API_KEY nao definida. Fallback OpenRouter desabilitado.");
}

if (!openrouter.model) {
    console.warn("[openrouterService] OPENROUTER_MODEL nao definido. Escolha um modelo :free no OpenRouter.");
}

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function criarErroOpenRouter(status, statusText, detalhe) {
    const mensagem = detalhe ? `OpenRouter HTTP ${status}: ${detalhe}` : `OpenRouter HTTP ${status} ${statusText}`;
    const erro = new Error(mensagem);
    erro.status = status;
    erro.statusText = statusText;
    erro.provider = "openrouter";
    return erro;
}

async function postChatCompletion(prompt) {
    if (!openrouter.apiKey) {
        const erro = new Error("OPENROUTER_API_KEY nao configurada.");
        erro.status = 401;
        erro.provider = "openrouter";
        throw erro;
    }

    if (!openrouter.model) {
        const erro = new Error("OPENROUTER_MODEL nao configurado.");
        erro.status = 400;
        erro.provider = "openrouter";
        throw erro;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), openrouter.timeoutMs);

    try {
        const resposta = await undiciFetch(`${openrouter.baseUrl}/chat/completions`, {
            method: "POST",
            signal: controller.signal,
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${openrouter.apiKey}`,
                "HTTP-Referer": "http://localhost:3000",
                "X-Title": openrouter.appName
            },
            body: JSON.stringify({
                model: openrouter.model,
                temperature: 0.1,
                messages: [{ role: "user", content: prompt }]
            })
        });

        const corpo = await resposta.text();
        let json = null;

        try {
            json = corpo ? JSON.parse(corpo) : null;
        } catch (_) {
            json = null;
        }

        if (!resposta.ok) {
            const detalhe = json?.error?.message || json?.error || json?.message || corpo.slice(0, 300);
            throw criarErroOpenRouter(resposta.status, resposta.statusText, detalhe);
        }

        const texto = json?.choices?.[0]?.message?.content;
        if (!texto) {
            throw criarErroOpenRouter(502, "Bad Gateway", "Resposta sem conteudo textual.");
        }

        return texto;
    } catch (erro) {
        if (erro.name === "AbortError") {
            const timeout = new Error(`Timeout na OpenRouter apos ${openrouter.timeoutMs}ms.`);
            timeout.status = 504;
            timeout.provider = "openrouter";
            throw timeout;
        }

        throw erro;
    } finally {
        clearTimeout(timer);
    }
}

async function gerarTexto(prompt) {
    await delay(100);
    return postChatCompletion(prompt);
}

module.exports = { gerarTexto };

