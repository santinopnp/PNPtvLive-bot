const express = require('express');
const crypto = require('crypto');

function rawSaver(req, res, buf) {
  req.rawBody = buf;
}

function verifySignature(secret, header, req) {
  if (!secret) return false;
  const signature = req.headers[header.toLowerCase()];
  if (!signature) return false;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(req.rawBody)
    .digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

module.exports = function createSecureWebhooks(core) {
  const router = express.Router();
  router.use(express.json({ verify: rawSaver }));

  router.post('/webhook/bold', (req, res) => {
    if (!verifySignature(process.env.BOLD_WEBHOOK_SECRET, 'X-Bold-Signature', req)) {
      return res.status(401).send('Invalid signature');
    }
    console.log('💳 Bold webhook recibido:', req.body);
    res.json({ received: true });
  });

  router.post('/webhook/mercadopago', (req, res) => {
    if (!verifySignature(process.env.MERCADOPAGO_WEBHOOK_SECRET, 'X-MP-Signature', req)) {
      return res.status(401).send('Invalid signature');
    }
    console.log('💳 Mercado Pago webhook recibido:', req.body);
    res.json({ received: true });
  });

  router.post('/webhook/paypal', (req, res) => {
    if (!verifySignature(process.env.PAYPAL_WEBHOOK_SECRET, 'PayPal-Transmission-Sig', req)) {
      return res.status(401).send('Invalid signature');
    }
    console.log('💳 PayPal webhook recibido:', req.body);
    res.json({ received: true });
  });

  router.post('/webhook/stripe', (req, res) => {
    if (!verifySignature(process.env.STRIPE_WEBHOOK_SECRET, 'Stripe-Signature', req)) {
      return res.status(401).send('Invalid signature');
    }
    console.log('💳 Stripe webhook recibido:', req.body);
    res.json({ received: true });
  });

  return router;
};
