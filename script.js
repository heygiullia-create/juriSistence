/* ==================================================
   AUTOAJUSTE DO TEXTAREA
================================================== */

const textarea = document.getElementById("conte");
const chatContainer = document.getElementById("chat-container");
const botaoMenuChat = document.getElementById("btn-menu-chat");
const menuChatOpcoes = document.getElementById("menu-chat-opcoes");
const botaoNovoChat = document.getElementById("btn-novo-chat");

textarea.addEventListener("input", function () {
    this.style.height = "auto";
    this.style.height = this.scrollHeight + "px";
});


/* ==================================================
   MENU DO CHAT
================================================== */

function fecharMenuChat() {

    if (!botaoMenuChat || !menuChatOpcoes) return;

    menuChatOpcoes.classList.remove("aberto");
    botaoMenuChat.classList.remove("menu-aberto");
    botaoMenuChat.setAttribute("aria-expanded", "false");

}

function alternarMenuChat() {

    if (!botaoMenuChat || !menuChatOpcoes) return;

    const menuAberto = menuChatOpcoes.classList.toggle("aberto");

    botaoMenuChat.classList.toggle("menu-aberto", menuAberto);
    botaoMenuChat.setAttribute("aria-expanded", String(menuAberto));

}

if (botaoMenuChat && menuChatOpcoes) {

    botaoMenuChat.addEventListener("click", (evento) => {

        evento.stopPropagation();
        alternarMenuChat();

    });

    menuChatOpcoes.addEventListener("click", (evento) => {
        evento.stopPropagation();
    });

    document.addEventListener("click", fecharMenuChat);

}

if (botaoNovoChat) {

    botaoNovoChat.addEventListener("click", () => {

        if (chatContainer) chatContainer.innerHTML = "";

        textarea.value = "";
        textarea.style.height = "45px";

        esconderStatus();
        fecharMenuChat();
        textarea.focus();

    });

}


/* ==================================================
   STATUS DA CONSULTA
================================================== */

const statusConsulta = document.getElementById("status-consulta");
const statusTexto = document.getElementById("status-texto");
const statusTempo = document.getElementById("status-tempo");
const contador = document.getElementById("contador");

let intervaloCronometro = null;
let segundos = 0;

function mostrarPensando() {

    if (!statusConsulta || !statusTexto || !statusTempo) {
        console.warn("Elementos de status não encontrados no HTML.");
        return;
    }

    statusConsulta.style.display = "flex";
    statusTexto.textContent = " Pensando...";
    statusTempo.style.display = "none";

}

function mostrarConsultando() {

    if (!statusTexto) return;

    statusTexto.textContent = " Consultando fontes...";

}

function iniciarCronometro() {

    if (!contador || !statusTempo) return;

    segundos = 0;
    contador.textContent = segundos;

    statusTempo.style.display = "inline";

    intervaloCronometro = setInterval(() => {

        segundos++;
        contador.textContent = segundos;

    }, 1000);

}

function esconderStatus() {

    clearInterval(intervaloCronometro);

    if (statusConsulta) statusConsulta.style.display = "none";
    if (statusTempo) statusTempo.style.display = "none";

}

function escaparHtml(texto) {

    return texto
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");

}

function renderizarResposta(texto) {

    const textoSeguro = escaparHtml(texto || "");

    return textoSeguro.replace(
        /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
        '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
    );

}


/* ==================================================
   ENVIO DA MENSAGEM (clique no botão ou Enter)
================================================== */

const botaoEnviar = document.getElementById("btn-enviar");
let requisicaoEmAndamento = false;
let controllerRequisicao = null;

function ativarModoResposta() {

    requisicaoEmAndamento = true;
    controllerRequisicao = new AbortController();

    botaoEnviar.classList.add("enviando");
    botaoEnviar.innerHTML = '<span class="icone-quadrado"></span>';
    botaoEnviar.setAttribute("aria-label", "Parar resposta");
    botaoEnviar.title = "Parar resposta";

}

function desativarModoResposta() {

    requisicaoEmAndamento = false;
    controllerRequisicao = null;

    botaoEnviar.classList.remove("enviando");
    botaoEnviar.innerHTML = "➤";
    botaoEnviar.setAttribute("aria-label", "Enviar mensagem");
    botaoEnviar.title = "Enviar mensagem";

}

function cancelarRequisicaoAtual() {

    if (!controllerRequisicao) return;

    controllerRequisicao.abort();
    esconderStatus();

}

async function enviarMensagem() {

    if (requisicaoEmAndamento) {
        cancelarRequisicaoAtual();
        return;
    }

    const mensagem = textarea.value.trim();

    if (!mensagem) return;

    /* ==================================================
       TRAVA O BOTÃO E VIRA QUADRADO
    ================================================== */

    ativarModoResposta();

    /* ==================================================
       MENSAGEM DO USUÁRIO
    ================================================== */

    const mensagemUsuario = document.createElement("div");

    mensagemUsuario.classList.add("mensagem-usuario");
    mensagemUsuario.innerText = mensagem;

    chatContainer.appendChild(mensagemUsuario);

    mensagemUsuario.scrollIntoView({
        behavior: "smooth",
        block: "end"
    });


    /* ==================================================
       LIMPA O CAMPO
    ================================================== */

    textarea.value = "";
    textarea.style.height = "45px";


    /* ==================================================
       MOSTRA STATUS
    ================================================== */

    mostrarPensando();

    const trocaStatus = setTimeout(() => {

        mostrarConsultando();
        iniciarCronometro();

    }, 1200);


    /* ==================================================
       ENVIA PARA O BACKEND
    ================================================== */

    try {

        const resposta = await fetch("/pergunta", {

            method: "POST",

            headers: {
                "Content-Type": "application/json"
            },

            body: JSON.stringify({
                pergunta: mensagem
            }),

            signal: controllerRequisicao.signal

        });

        clearTimeout(trocaStatus);

        const dados = await resposta.json();

        esconderStatus();


        /* ==================================================
           RESPOSTA DO SISTEMA
        ================================================== */

        const mensagemSistema = document.createElement("div");

        mensagemSistema.classList.add("mensagem-sistema");
        mensagemSistema.innerHTML = renderizarResposta(dados.resposta);

        if (dados.fontesSubstituidas) {

            const avisoFontes = document.createElement("div");

            avisoFontes.classList.add("aviso-fontes");
            avisoFontes.textContent = "Algumas fontes foram consultadas por caminhos externos.";

            mensagemSistema.appendChild(avisoFontes);

        }

        chatContainer.appendChild(mensagemSistema);

        mensagemSistema.scrollIntoView({
            behavior: "smooth",
            block: "end"
        });

    }

    catch (erro) {

        clearTimeout(trocaStatus);

        esconderStatus();

        if (erro.name === "AbortError") {
            return;
        }

        console.error(erro);

    }

    finally {

        desativarModoResposta();

    }

}

botaoEnviar.addEventListener("click", enviarMensagem);


/* ==================================================
   ENTER ENVIA A MENSAGEM (mesma função do botão)
================================================== */

textarea.addEventListener("keydown", (evento) => {

    if (evento.key === "Enter" && !evento.shiftKey) {

        evento.preventDefault();

        if (requisicaoEmAndamento) return;

        enviarMensagem();

    }

});
