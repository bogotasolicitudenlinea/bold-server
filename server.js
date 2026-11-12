require('dotenv').config();
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const https = require('https');

// 🔥 FORZAR DNS DE GOOGLE 🔥
const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);

const app = express();
app.use(cors());
app.use(express.json());

const BOLD_IDENTITY_KEY = process.env.BOLD_IDENTITY_KEY; 
const BOLD_SECRET_KEY = process.env.BOLD_SECRET_KEY;

app.post('/crear-pago-bold', async (req, res) => {
    try {
        const { monto, documento, nombre } = req.body;

        if (!monto || !documento) {
            return res.status(400).json({ ok: false, error: "Faltan datos (monto o documento)." });
        }

        // 1. Crear la firma de integridad (Hash de Seguridad)
        const orderId = 'FINESA-' + Date.now() + '-' + documento;
        const amountStr = monto.toString();
        const currency = 'COP';
        
        const stringToHash = `${orderId}${amountStr}${currency}${BOLD_SECRET_KEY}`;
        const hash = crypto.createHash('sha256').update(stringToHash).digest('hex');

        const payload = JSON.stringify({
            amount_type: "CLOSE",
            amount: {
                currency: "COP",
                total_amount: parseInt(monto) 
            },
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
                        console.error("Error de Bold:", json);
                        res.status(500).json({ ok: false, error: "No se pudo generar el link de pago.", detalle: json });
                    }
                } catch (e) {
                    console.error("Error parseando respuesta:", data);
                    res.status(500).json({ ok: false, error: "Respuesta inválida de Bold." });
                }
            });
        });

        request.on('error', (error) => {
            console.error("Error en petición HTTPS:", error);
            res.status(500).json({ ok: false, error: error.message });
        });

        request.write(payload);
        request.end();

    } catch (error) {
        console.error("Error del servidor:", error);
        res.status(500).json({ ok: false, error: error.message });
    }
});

app.get('/', (req, res) => {
    res.send('Servidor de Bold funcionando correctamente.');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor Bold corriendo en puerto ${PORT}`));
