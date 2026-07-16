/* ==================================================
   AI SERVICE
   Camada usada por Planner e ReportGenerator.
   Tenta Gemini primeiro e usa Groq como fallback
   para falhas temporarias.
================================================== */
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { gemini } = require("../config");
const groqService = require("./groqService");
const openrouterService = require("./openrouterService");

if (!gemini.apiKey) {
    console.warn("[geminiService] GEMINI_API_KEY nao definida. As chamadas ao Gemini vao falhar.");
}

const genAI = new GoogleGenerativeAI(gemini.apiKey);
const model = genAI.getGenerativeModel({
    model: gemini.model,
    generationConfig: { temperature: 0.1 }
});

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function textoDoErro(erro) {
    return [
        erro?.status,
        erro?.statusText,
        erro?.message,
        erro?.cause?.code,
        erro?.cause?.message
    ].join(" ").toLowerCase();
}

function ehErroTransienteDaIA(erro) {
    const texto = textoDoErro(erro);

    return (
        texto.includes("429") ||
        texto.includes("500") ||
        texto.includes("502") ||
        texto.includes("503") ||
        texto.includes("504") ||
        texto.includes("quota") ||
        texto.includes("rate limit") ||
        texto.includes("resource_exhausted") ||
        texto.includes("high demand") ||
        texto.includes("service unavailable") ||
        texto.includes("timeout") ||
        texto.includes("eai_again") ||
        texto.includes("econnreset")
    );
}

async function gerarTextoGemini(prompt) {
    const resultado = await model.generateContent(prompt);
    return resultado.response.text();
}

async function gerarTextoComFallback(prompt) {
    let ultimoErro = null;

    for (let tentativa = 0; tentativa <= gemini.maxRetries; tentativa++) {
        try {
            return await gerarTextoGemini(prompt);
        } catch (erro) {
            ultimoErro = erro;

            if (!ehErroTransienteDaIA(erro) || tentativa >= gemini.maxRetries) {
                break;
            }

            console.warn(
                `[geminiService] Gemini falhou temporariamente (${tentativa + 1}/${gemini.maxRetries + 1}). Tentando novamente...`
            );
            await delay(gemini.retryDelayMs * (tentativa + 1));
        }
    }

    if (ehErroTransienteDaIA(ultimoErro)) {
        console.warn("[geminiService] Acionando fallback Groq.");
        try {
            return await groqService.gerarTexto(prompt);
        } catch (erroFallback) {
            console.warn("[geminiService] Groq falhou. Acionando fallback OpenRouter.");
            try {
                return await openrouterService.gerarTexto(prompt);
            } catch (erroOpenRouter) {
                erroOpenRouter.fallbackFrom = ultimoErro;
                erroOpenRouter.groqError = erroFallback;
                throw erroOpenRouter;
            }
        }
    }

    throw ultimoErro;
}

function limparCercasMarkdown(texto) {
    return texto
        .replace(/```json/gi, "")
        .replace(/```/g, "")
        .trim();
}

function parsearJSON(texto, origem) {
    const textoLimpo = limparCercasMarkdown(texto);

    try {
        return JSON.parse(textoLimpo);
    } catch (erro) {
        const erroJSON = new Error(
            `[geminiService] Resposta da IA nao e um JSON valido (${origem}): ${erro.message}\nConteudo: ${textoLimpo.slice(0, 300)}`
        );
        erroJSON.cause = erro;
        erroJSON.conteudo = textoLimpo;
        throw erroJSON;
    }
}

async function tentarGerarJSONComFallback(prompt, erroOriginal) {
    const promptJSON = `
Responda SOMENTE com JSON valido.
Nao use markdown, comentarios, texto antes ou depois do JSON.
Corrija qualquer problema de aspas, virgulas, colchetes ou chaves.

${prompt}
`.trim();

    try {
        console.warn("[geminiService] JSON invalido. Tentando gerar JSON pela Groq.");
        const textoGroq = await groqService.gerarTexto(promptJSON);
        return parsearJSON(textoGroq, "groq");
    } catch (erroGroq) {
        console.warn("[geminiService] Groq nao retornou JSON valido. Tentando OpenRouter.");

        try {
            const textoOpenRouter = await openrouterService.gerarTexto(promptJSON);
            return parsearJSON(textoOpenRouter, "openrouter");
        } catch (erroOpenRouter) {
            erroOpenRouter.fallbackFrom = erroOriginal;
            erroOpenRouter.groqError = erroGroq;
            throw erroOpenRouter;
        }
    }
}

async function gerarJSON(prompt) {
    const textoBruto = await gerarTextoComFallback(prompt);

    try {
        return parsearJSON(textoBruto, "principal");
    } catch (erro) {
        return tentarGerarJSONComFallback(prompt, erro);
    }
}

async function gerarTexto(prompt) {
    return gerarTextoComFallback(prompt);
}

module.exports = { gerarJSON, gerarTexto };

