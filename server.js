const express = require('express');
const cors = require('cors');
const app = express();

app.use(express.json());
app.use(cors());

// Banco de dados em memória (ou você pode salvar em arquivo/banco real)
// Licenças liberadas automaticamente ou manualmente
const licencasAtivas = new Set();

// Rota para verificar se a licença do aparelho está liberada
app.get('/api/verificar-licenca', (req, res) => {
    const { hwid } = req.query;

    if (!hwid) {
        return res.status(400).json({ erro: 'HWID não informado' });
    }

    const liberado = licencasAtivas.has(hwid);
    res.json({ liberado });
});

// Rota para gerar o pagamento via Pix (Mercado Pago)
app.post('/api/criar-pagamento', async (req, res) => {
    const { hwid, email } = req.body;

    if (!hwid) {
        return res.status(400).json({ erro: 'HWID é obrigatório para vincular a compra.' });
    }

    try {
        const accessToken = process.env.MP_ACCESS_TOKEN;

        if (!accessToken) {
            return res.status(500).json({ erro: 'Token do Mercado Pago não configurado no servidor.' });
        }

        const respostaMP = await fetch('https://api.mercadopago.com/v1/payments', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                'X-Idempotency-Key': `${hwid}-${Date.now()}`
            },
            body: JSON.stringify({
                transaction_amount: 0.01,
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

// Rota Webhook: o Mercado Pago chama esta rota automaticamente quando o
// cliente paga. Consulta o pagamento de verdade (status "approved") antes
// de liberar a licença — não confia apenas na notificação recebida.
app.post('/api/webhook-pagamento', async (req, res) => {
    const evento = req.body;
    res.sendStatus(200); // responde rápido, MP não espera processamento

    if (evento.type === 'payment' || (evento.action && evento.action.includes('payment'))) {
        const paymentId = evento.data?.id || evento.id;
        const accessToken = process.env.MP_ACCESS_TOKEN;

        try {
            const resp = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });
            const pagamento = await resp.json();

            if (pagamento.status === 'approved') {
                const hwid = pagamento.metadata?.hwid;
                if (hwid) {
                    licencasAtivas.add(hwid);
                    console.log(`Licença liberada para HWID ${hwid}`);
                }
            }
        } catch (e) {
            console.error('Erro ao verificar pagamento no webhook:', e.message);
        }
    }
});

// Rota para liberação manual rápida (caso queira liberar pelo painel)
app.post('/api/liberar', (req, res) => {
    const { hwid, senha } = req.body;
    const senhaCorreta = process.env.SENHA_LIBERACAO_MANUAL;
    if (!senhaCorreta || senha !== senhaCorreta) {
        return res.status(401).json({ erro: 'Não autorizado' });
    }
    if (hwid) {
        licencasAtivas.add(hwid);
        return res.json({ sucesso: true, mensagem: `HWID ${hwid} liberado com sucesso!` });
    }
    res.status(400).json({ erro: 'HWID inválido' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
