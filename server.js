

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
