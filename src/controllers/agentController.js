/* ==================================================
   AGENT CONTROLLER
   Camada HTTP: valida entrada, chama o orchestrator,
   trata erros de forma amigavel para o front-end.
================================================== */
const orchestrator = require("../agent/orchestrator");

function textoDoErro(erro) {
    return [
        erro?.status,
        erro?.statusText,
        erro?.message,
        erro?.fallbackFrom?.status,
        erro?.fallbackFrom?.statusText,
        erro?.fallbackFrom?.message
    ].join(" ").toLowerCase();
}

function ehErroDeLimiteDaIA(erro) {
    const texto = textoDoErro(erro);

    return (
        texto.includes("429") ||
        texto.includes("quota") ||
        texto.includes("rate limit") ||
        texto.includes("resource_exhausted")
    );
}

function ehErroDeInstabilidadeDaIA(erro) {
    const texto = textoDoErro(erro);

    return (
        texto.includes("500") ||
        texto.includes("502") ||
        texto.includes("503") ||
        texto.includes("504") ||
        texto.includes("high demand") ||
        texto.includes("service unavailable") ||
        texto.includes("timeout")
    );
}

function ehErroDeConfiguracaoDaIA(erro) {
    const texto = textoDoErro(erro);

    return (
        texto.includes("401") ||
        texto.includes("api_key") ||
        texto.includes("api key") ||
        texto.includes("unauthorized")
    );
}

function ehErroDeCreditoOuLicencaDaIA(erro) {
    const texto = textoDoErro(erro);

    return (
        texto.includes("403") &&
        (
            texto.includes("credit") ||
            texto.includes("credits") ||
            texto.includes("license") ||
            texto.includes("licenses") ||
            texto.includes("billing") ||
            texto.includes("purchase") ||
            texto.includes("model permissions") ||
            texto.includes("permission-denied")
        )
    );
}

function mensagemDeErro(erro) {
    if (ehErroDeConfiguracaoDaIA(erro)) {
        return "A IA nao esta configurada corretamente no servidor. Verifique as chaves de API e tente novamente.";
    }

    if (ehErroDeCreditoOuLicencaDaIA(erro)) {
        return (
            "O provedor alternativo de IA esta conectado, mas a conta ainda nao esta liberada para esse modelo. " +
            "Verifique a chave, os limites gratuitos e as permissoes do modelo no console da Groq."
        );
    }

    if (ehErroDeLimiteDaIA(erro)) {
        return (
            "O limite temporario de uso da IA foi atingido. " +
            "O sistema tentou usar o provedor alternativo, mas a consulta ainda nao pode ser concluida agora. " +
            "Tente novamente em instantes."
        );
    }

    if (ehErroDeInstabilidadeDaIA(erro)) {
        return (
            "A IA esta temporariamente instavel ou com alta demanda. " +
            "O sistema tentou redirecionar a consulta para o provedor alternativo, mas nao conseguiu concluir esta resposta. " +
            "Tente novamente em instantes."
        );
    }

    return "Ocorreu um erro ao processar sua consulta juridica. Tente novamente em instantes.";
}

async function handlePergunta(req, res) {
    const pergunta = req.body?.pergunta;

    if (!pergunta || typeof pergunta !== "string" || pergunta.trim().length === 0) {
        return res.status(400).json({
            resposta: "Envie uma pergunta juridica valida."
        });
    }

    try {
        const resultado = await orchestrator.processarPergunta(pergunta.trim());
        return res.json(resultado);
    } catch (erro) {
        console.error("[agentController] Erro no processamento:", erro);
        return res.status(500).json({
            resposta: mensagemDeErro(erro)
        });
    }
}

module.exports = { handlePergunta };
