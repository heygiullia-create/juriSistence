/* ==================================================
   IMPORTAÇÕES
================================================== */
const express = require("express");
const path = require("path");
const agentRoutes = require("./src/routes/agent");

/* ==================================================
   EXPRESS
================================================== */
const app = express();
const PORT = process.env.PORT || 3000;

app.disable("x-powered-by");
app.use(express.json({ limit: "32kb" }));

/* ==================================================
   PÁGINA PRINCIPAL
================================================== */
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/style.css", (req, res) => {
    res.sendFile(path.join(__dirname, "style.css"));
});

app.get("/script.js", (req, res) => {
    res.sendFile(path.join(__dirname, "script.js"));
});

app.get("/balança.jpeg", (req, res) => {
    res.sendFile(path.join(__dirname, "balança.jpeg"));
});

app.get("/health", (req, res) => {
    res.json({ ok: true });
});

/* ==================================================
   CONSULTA JURÍDICA
   Toda a lógica (planejamento, busca em fontes oficiais,
   validação e redação do relatório) vive em src/agent.
   Este arquivo só expõe a rota.
================================================== */
app.use("/pergunta", agentRoutes);

/* ==================================================
   SERVIDOR
================================================== */
app.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
});
