const controller = require("../src/controllers/agentController");

module.exports = async function handler(req, res) {
    if (req.method !== "POST") {
        res.statusCode = 405;
        res.setHeader("Allow", "POST");
        res.end("Method Not Allowed");
        return;
    }

    return controller.handlePergunta(req, res);
};
