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
        // Exemplo de integração com a API de Pagamentos do Mercado Pago (Pix)
        // Nota: Você precisará configurar seu ACCESS_TOKEN do Mercado Pago nas variáveis de ambiente do Render.
        const accessToken = process.env.MP_ACCESS_TOKEN;

        if (!accessToken) {
            // Caso o token não esteja configurado ainda, simulamos para teste
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
                transaction_amount: 39.90, // Valor atualizado para R$ 39,90
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

// Rota Webhook: O Mercado Pago chama esta rota automaticamente quando o cliente paga
app.post('/api/webhook-pagamento', (req, res) => {
    const evento = req.body;

    // Verifica se é uma notificação de pagamento
    if (evento.type === 'payment' || (evento.action && evento.action.includes('payment'))) {
        const paymentId = evento.data?.id || evento.id;
        
        // Aqui você consultaria o Mercado Pago para confirmar se o pagamento foi aprovado (status == 'approved')
        // E recuperaria o 'hwid' enviado no metadata para adicionar em 'licencasAtivas.add(hwid)'
        console.log("Notificação de pagamento recebida ID:", paymentId);
    }

    res.sendStatus(200);
});

// Rota para liberação manual rápida (caso queira liberar pelo painel)
app.post('/api/liberar', (req, res) => {
    const { hwid, senha } = req.body;
    // Defina uma senha mestre simples para liberação manual de emergência
    if (senha !== 'reclim123') {
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

