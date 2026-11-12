require('dotenv').config();
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const https = require('https');

// 🔥 FORZAR DNS DE GOOGLE Y PREFERIR IPV4 A NIVEL DE SISTEMA 🔥
const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);
dns.setDefaultResultOrder('ipv4first');

const app = express();
app.use(cors());
app.use(express.json());

const BOLD_IDENTITY_KEY = process.env.BOLD_IDENTITY_KEY; 
const BOLD_SECRET_KEY = process.env.BOLD_SECRET_KEY;

// 🔥 AGENTE HTTPS QUE FUERZA IPV4 EN LA CONEXIÓN 🔥
const ipv4Agent = new https.Agent({
    family: 4,
    keepAlive: true
});

app.post('/crear-pago-bold', async (req, res) => {
    try {
        const { monto, documento, nombre } = req.body;

        if (!monto || !documento) {
            return res.status(400).json({ ok: false, error: "Faltan datos." });
        }

        const orderId = 'FINESA-' + Date.now() + '-' + documento;
        const amountStr = monto.toString();
        const currency = 'COP';
        const stringToHash = `${orderId}${amountStr}${currency}${BOLD_SECRET_KEY}`;
        const hash = crypto.createHash('sha256').update(stringToHash).digest('hex');

        const payload = JSON.stringify({
            amount_type: "CLOSE",
            amount: { currency: "COP", total_amount: parseInt(monto) },
            description: `Pago Finesa - ${nombre}`,
            reference: orderId,
            payment_methods: ["CREDIT_CARD", "PSE", "NEQUI", "BOTON_BANCOLOMBIA"],
            integrity_signature: hash
        });

        const options = {
            hostname: 'api.bold.co',
            port: 443,
            path: '/online/link/v1',
            method: 'POST',
            agent: ipv4Agent, // 🔥 USAMOS EL AGENTE CON IPV4 FORZADO 🔥
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `x-api-key ${BOLD_IDENTITY_KEY}`,
                'Content-Length': Buffer.byteLength(payload)
            }
        };

        const request = https.request(options, (response) => {
            let data = '';
            response.on('data', (chunk) => { data += chunk; });
            response.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (json.payload && json.payload.url) {
                        res.json({ ok: true, url: json.payload.url });
                    } else {
                        res.status(500).json({ ok: false, error: "Error de Bold.", detalle: json });
                    }
                } catch (e) {
                    res.status(500).json({ ok: false, error: "Respuesta inválida." });
                }
            });
        });

        request.on('error', (error) => {
            console.error("Error HTTPS:", error);
            res.status(500).json({ ok: false, error: error.message });
        });

        request.write(payload);
        request.end();

    } catch (error) {
        res.status(500).json({ ok: false, error: error.message });
    }
});

app.get('/', (req, res) => {
    res.send('Servidor de Bold funcionando.');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`Servidor en puerto ${PORT}`));
