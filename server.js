require('dotenv').config();
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const https = require('https');

// 🔥 FORZAR IPV4 Y DNS DE GOOGLE 🔥
const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);
dns.setDefaultResultOrder('ipv4first');

const app = express();
app.use(cors());
app.use(express.json());

const BOLD_IDENTITY_KEY = process.env.BOLD_IDENTITY_KEY; 
const BOLD_SECRET_KEY = process.env.BOLD_SECRET_KEY;

const ipv4Agent = new https.Agent({ family: 4, keepAlive: true });

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

        // 🔥 URL CORREGIDA SEGÚN LA DOCUMENTACIÓN OFICIAL 🔥
        const options = {
            hostname: 'integrations.api.bold.co', 
            port: 443,
            path: '/online/link/v1',
            method: 'POST',
            agent: ipv4Agent,
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
                        // 🔥 ESTO TE DIRÁ EXACTAMENTE QUÉ DIJO BOLD 🔥
                        console.error("Respuesta de Bold:", json);
                        res.status(500).json({ 
                            ok: false, 
                            error: "Bold rechazó la petición.", 
                            detalle: json 
                        });
                    }
                } catch (e) {
                    console.error("Respuesta no JSON de Bold:", data);
                    res.status(500).json({ ok: false, error: "Bold devolvió una respuesta inesperada." });
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
        console.error("Error interno:", error);
        res.status(500).json({ ok: false, error: error.message });
    }
});

app.get('/', (req, res) => {
    res.send('Servidor de Bold funcionando.');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`Servidor en puerto ${PORT}`));
