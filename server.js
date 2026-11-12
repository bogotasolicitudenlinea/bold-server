require('dotenv').config();
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

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
        
        // Bold exige este orden exacto para el hash: OrderId + Amount + Currency + SecretKey
        const stringToHash = `${orderId}${amountStr}${currency}${BOLD_SECRET_KEY}`;
        const hash = crypto.createHash('sha256').update(stringToHash).digest('hex');

        // 2. Petición a Bold para crear el link de pago
        const boldResponse = await fetch('https://api.bold.co/online/link/v1', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `x-api-key ${BOLD_IDENTITY_KEY}`
            },
            body: JSON.stringify({
                amount_type: "CLOSE",
                amount: {
                    currency: "COP",
                    total_amount: parseInt(monto) 
                },
                description: `Pago Finesa - ${nombre}`,
                reference: orderId,
                payment_methods: ["CREDIT_CARD", "PSE", "NEQUI", "BOTON_BANCOLOMBIA"],
                integrity_signature: hash
            })
        });

        const data = await boldResponse.json();

        if (data.payload && data.payload.url) {
            res.json({ ok: true, url: data.payload.url });
        } else {
            console.error("Error de Bold:", data);
            res.status(500).json({ ok: false, error: "No se pudo generar el link de pago.", detalle: data });
        }

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