const express = require('express');
const app = express();
app.use(express.json());

// Banco de dados simulado (substitua depois por Firebase ou MongoDB)
const licencasAtivas = {
    "HW-EXEMPLO123": { ativo: true, plano: "Anual" }
};

// Rota de verificação que o seu app NTC vai consultar
app.get('/api/verificar-licenca', (req, res) => {
    const hwid = req.query.hwid;

    if (!hwid) {
        return res.status(400).json({ liberado: false, mensagem: "HWID não informado." });
    }

    const licenca = licencasAtivas[hwid];

    if (licenca && licenca.ativo) {
        return res.json({ liberado: true, mensagem: "Acesso liberado!" });
    } else {
        return res.json({ liberado: false, mensagem: "Licença não encontrada ou expirada." });
    }
});

// Porta automática fornecida pela nuvem ou porta 3000 local
const PORTA = process.env.PORT || 3000;
app.listen(PORTA, () => {
    console.log(`Servidor rodando na porta ${PORTA}`);
});
