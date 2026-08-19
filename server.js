const express = require('express');
const cors = require('cors');
const app = express();

app.use(express.json());
app.use(cors());

const accessToken = process.env.MP_ACCESS_TOKEN;
const JSONBIN_ID = process.env.JSONBIN_ID;
const JSONBIN_KEY = process.env.JSONBIN_KEY;
const SENHA_MESTRE = process.env.SENHA_MESTRE;
const JSONBIN_URL = `https://api.jsonbin.io/v3/b/${JSONBIN_ID}`;

// Valor da licença - único lugar do código onde o preço é definido
const PRECO_LICENCA = 39.90;

// Lê a lista de licenças liberadas guardada no jsonbin.io
async function lerLicencas() {
    const resp = await fetch(`${JSONBIN_URL}/latest`, {
        headers: { 'X-Master-Key': JSONBIN_KEY }
    });
    const data = await resp.json();
    return new Set(data.record.licencas || []);
}

// Salva a lista atualizada de volta no jsonbin.io
async function salvarLicencas(licencasSet) {
    await fetch(JSONBIN_URL, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'X-Master-Key': JSONBIN_KEY
        },
        body: JSON.stringify({ licencas: Array.from(licencasSet) })
    });
}

// Rota para o front-end consultar o valor atual da licença
app.get('/api/preco', (req, res) => {
    res.json({ valor: PRECO_LICENCA });
});

// Rota para verificar se a licença do aparelho está liberada
app.get('/api/verificar-licenca', async (req, res) => {
    const { hwid } = req.query;

    if (!hwid) {
        return res.status(400).json({ erro: 'HWID não informado' });
    }

    try {
        const licencas = await lerLicencas();
        res.json({ liberado: licencas.has(hwid) });
    } catch (e) {
        res.status(500).json({ erro: 'Erro ao consultar licenças', detalhe: e.message });
    }
});

// Rota para gerar o pagamento via Pix (Mercado Pago)
app.post('/api/criar-pagamento', async (req, res) => {
    const { hwid, email } = req.body;

    if (!hwid) {
        return res.status(400).json({ erro: 'HWID é obrigatório para vincular a compra.' });
    }

    if (!accessToken) {
        return res.status(500).json({ erro: 'Token do Mercado Pago não configurado no servidor.' });
    }

    try {
        const respostaMP = await fetch('https://api.mercadopago.com/v1/payments', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                'X-Idempotency-Key': `${hwid}-${Date.now()}`
            },
            body: JSON.stringify({
                transaction_amount: PRECO_LICENCA,
                description: `Licença App Analisador NTC - HWID: ${hwid}`,
                payment_method_id: 'pix',
                payer: {
                    email: email || 'cliente@reclim.com'
                },
                metadata: {
                    hwid: hwid
                }
            })
        });

        const dadosPagamento = await respostaMP.json();

        if (dadosPagamento.id) {
            res.json({
                sucesso: true,
                payment_id: dadosPagamento.id,
                qr_code: dadosPagamento.point_of_interaction.transaction_data.qr_code,
                qr_code_base64: dadosPagamento.point_of_interaction.transaction_data.qr_code_base64
            });
        } else {
            res.status(400).json({ erro: 'Erro ao gerar Pix no Mercado Pago', detalhes: dadosPagamento });
        }

    } catch (e) {
        res.status(500).json({ erro: 'Erro interno ao processar pagamento', detalhe: e.message });
    }
});

// Rota Webhook: o Mercado Pago chama esta rota automaticamente quando o cliente paga
app.post('/api/webhook-pagamento', async (req, res) => {
    const evento = req.body;

    // Responde rápido — o Mercado Pago não espera o processamento terminar
    res.sendStatus(200);

    if (evento.type === 'payment' || (evento.action && evento.action.includes('payment'))) {
        const paymentId = evento.data?.id || evento.id;

        try {
            const resp = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });
            const pagamento = await resp.json();

            if (pagamento.status === 'approved') {
                const hwid = pagamento.metadata?.hwid;
                if (hwid) {
                    const licencas = await lerLicencas();
                    licencas.add(hwid);
                    await salvarLicencas(licencas);
                    console.log(`Licença liberada para HWID ${hwid} (payment ${paymentId})`);
                } else {
                    console.warn(`Pagamento ${paymentId} aprovado mas sem HWID no metadata`);
                }
            } else {
                console.log(`Pagamento ${paymentId} com status: ${pagamento.status}`);
            }
        } catch (e) {
            console.error('Erro ao verificar pagamento no webhook:', e.message);
        }
    }
});

// Rota para liberação manual de emergência (ex: cliente pagou por outro meio)
app.post('/api/liberar', async (req, res) => {
    const { hwid, senha } = req.body;

    if (!SENHA_MESTRE || senha !== SENHA_MESTRE) {
        return res.status(401).json({ erro: 'Não autorizado' });
    }

    if (!hwid) {
        return res.status(400).json({ erro: 'HWID inválido' });
    }

    try {
        const licencas = await lerLicencas();
        licencas.add(hwid);
        await salvarLicencas(licencas);
        res.json({ sucesso: true, mensagem: `HWID ${hwid} liberado com sucesso!` });
    } catch (e) {
        res.status(500).json({ erro: 'Erro ao salvar licença', detalhe: e.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});

