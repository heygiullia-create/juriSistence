/* ==================================================
   GROQ SERVICE
   Fallback OpenAI-compatible para modelos da Groq.
================================================== */
const { fetch: undiciFetch } = require("undici");
const { groq } = require("../config");

if (!groq.apiKey) {
    console.warn("[groqService] GROQ_API_KEY nao definida. Fallback Groq desabilitado.");
}

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function criarErroGroq(status, statusText, detalhe) {
    const mensagem = detalhe ? `Groq HTTP ${status}: ${detalhe}` : `Groq HTTP ${status} ${statusText}`;
    const erro = new Error(mensagem);
    erro.status = status;
    erro.statusText = statusText;
    erro.provider = "groq";
    return erro;
}

async function postChatCompletion(prompt) {
    if (!groq.apiKey) {
        const erro = new Error("GROQ_API_KEY nao configurada.");
        erro.status = 401;
        erro.provider = "groq";
        throw erro;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), groq.timeoutMs);

    try {
        const resposta = await undiciFetch(`${groq.baseUrl}/chat/completions`, {
            method: "POST",
            signal: controller.signal,
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${groq.apiKey}`
            },
            body: JSON.stringify({
                model: groq.model,
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
            throw criarErroGroq(resposta.status, resposta.statusText, detalhe);
        }

        const texto = json?.choices?.[0]?.message?.content;
        if (!texto) {
            throw criarErroGroq(502, "Bad Gateway", "Resposta sem conteudo textual.");
        }

        return texto;
    } catch (erro) {
        if (erro.name === "AbortError") {
            const timeout = new Error(`Timeout na Groq apos ${groq.timeoutMs}ms.`);
            timeout.status = 504;
            timeout.provider = "groq";
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

