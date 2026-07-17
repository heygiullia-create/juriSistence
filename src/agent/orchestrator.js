/* ==================================================
   ORCHESTRATOR
   Ponto de entrada do agente.
   Coordena: Planner -> Providers -> Extractor -> Validator
             -> ReportGenerator.
================================================== */
const planner = require("./planner");
const sourceRegistry = require("../providers/sourceRegistry");
const extractor = require("./extractor");
const validator = require("./validator");
const reportGenerator = require("./reportGenerator");
const { modoRapido } = require("../config");

function montarPlanoRapido(pergunta) {
    return {
        area: "Direito brasileiro",
        fontes: ["Planalto", "LexML Brasil"],
        palavrasChave: [pergunta],
        termosAlternativos: [],
        leisSugeridas: [],
        temasJuridicos: [{
            descricao: pergunta,
            papel: "central",
            fatosRelevantes: [],
            institutosJuridicos: [],
            fontes: ["Planalto", "LexML Brasil"],
            termosDeBusca: [pergunta]
        }],
        estrategiaPesquisa: "Modo rapido: resposta preliminar sem busca automatica extensa."
    };
}

async function processarPergunta(pergunta) {
    if (modoRapido) {
        const plano = montarPlanoRapido(pergunta);
        const relatorio = await reportGenerator.gerarRelatorio(pergunta, plano, []);

        return {
            resposta: relatorio,
            plano,
            fontesConsultadas: [],
            semResultados: true,
            fontesIndisponiveis: false,
            fontesSubstituidas: true
        };
    }

    // 1) Planejamento: decide o que pesquisar e onde.
    const plano = await planner.planejar(pergunta);

    // 2) Busca nas fontes oficiais.
    const documentosBrutos = await sourceRegistry.buscarEmTodasAsFontes(plano);
    const fontesIndisponiveis = Boolean(documentosBrutos.fontesIndisponiveis);
    const fontesSubstituidas = Boolean(documentosBrutos.fontesSubstituidas);

    // 3) Normalizacao.
    const documentosExtraidos = extractor.normalizar(documentosBrutos);

    // 4) Validacao: dominio oficial, duplicidade e conteudo minimo.
    const documentosValidados = validator.validar(documentosExtraidos);

    // 5) Interpretacao e redacao.
    // Mesmo quando a busca automatica vier vazia, o relatorio nao deve
    // devolver uma mensagem de falha ao cliente; ele deve enquadrar a questao,
    // usar fontes de referencia e sugerir pesquisa complementar quando util.
    const relatorio = await reportGenerator.gerarRelatorio(pergunta, plano, documentosValidados);

    return {
        resposta: relatorio,
        plano,
        fontesConsultadas: documentosValidados.map((doc) => ({
            fonte: doc.fonte,
            titulo: doc.titulo,
            url: doc.url
        })),
        semResultados: documentosValidados.length === 0,
        fontesIndisponiveis,
        fontesSubstituidas: fontesIndisponiveis || fontesSubstituidas
    };
}

module.exports = { processarPergunta };
