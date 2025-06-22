// ====================================================================
// IMPLEMENTACIÓN ESPECÍFICA PARA TU ESTRUCTURA PNPTVLIVE-BOT
// ARCHIVO: src/webhooks/secure-webhooks.js
// ====================================================================

const express = require('express');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');

const router = express.Router();

console.log('🔐 PNPtvLive: Inicializando webhooks seguros...');

// ================================================================
// CONFIGURACIÓN DE SEGURIDAD ESPECÍFICA PARA PNPTV
// ================================================================

// Rate limiting específico para PNPtv (tráfico esperado)
const pnptvWebhookLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minuto
    max: 100, // 100 requests por minuto (para shows grandes)
    message: { 
        error: 'PNPtv webhook rate limit exceeded',
        timestamp: new Date().toISOString(),
        retryAfter: 60
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
        // Permitir más requests de IPs conocidas de Bold.co
        const trustedIPs = ['181.78.23.', '190.90.8.']; // Bold.co IPs Colombia
        if (trustedIPs.some(ip => req.ip.startsWith(ip))) {
            return `trusted-${req.ip}`;
        }
        return req.ip;
    },
    skip: (req) => {
        // Skip rate limiting para health checks
        return req.path === '/health';
    }
});

// Cache para replay attacks (específico para PNPtv)
const pnptvProcessedWebhooks = new Map();

// Limpiar cache cada 20 minutos (shows largos)
setInterval(() => {
    const now = Date.now();
    let cleaned = 0;
    for (const [id, timestamp] of pnptvProcessedWebhooks.entries()) {
        if (now - timestamp > 1200000) { // 20 minutos
            pnptvProcessedWebhooks.delete(id);
            cleaned++;
        }
    }
    if (cleaned > 0) {
        console.log(`🧹 PNPtv cache cleanup: ${cleaned} webhooks antiguos removidos`);
    }
}, 1200000);

// ================================================================
// LOGGING ESPECÍFICO PARA PNPTV
// ================================================================

function logPNPtvSecurityAlert(message, data) {
    const alert = {
        timestamp: new Date().toISOString(),
        level: 'SECURITY_ALERT',
        service: 'PNPtvLive-bot',
        message,
        data,
        source: 'pnptv_webhook_security'
    };

    console.error('🚨 PNPtv SECURITY ALERT:', JSON.stringify(alert, null, 2));

    // Enviar a Slack si está configurado
    if (process.env.PNPTV_SLACK_WEBHOOK_URL) {
        sendPNPtvSlackAlert(alert).catch(err => 
            console.error('Failed to send PNPtv Slack alert:', err.message)
        );
    }

    // Log a archivo específico para PNPtv (si está configurado)
    if (process.env.PNPTV_LOG_PATH) {
        // TODO: Implementar logging a archivo
    }
}

function logPNPtvPaymentEvent(type, data) {
    const event = {
        timestamp: new Date().toISOString(),
        level: 'PAYMENT',
        service: 'PNPtvLive-bot',
        type,
        data,
        source: 'pnptv_payment'
    };

    console.log('💳 PNPtv PAYMENT EVENT:', JSON.stringify(event, null, 2));

    // Enviar eventos de pago a canal específico
    if (process.env.PNPTV_PAYMENTS_SLACK_WEBHOOK) {
        sendPNPtvPaymentNotification(event).catch(err =>
            console.error('Failed to send payment notification:', err.message)
        );
    }
}

// ================================================================
// VERIFICACIÓN DE FIRMAS ESPECÍFICA PARA BOLD.CO
// ================================================================

function verifyBoldSignatureForPNPtv(req) {
    try {
        const signature = req.headers['x-bold-signature'] || 
                         req.headers['x-signature'] ||
                         req.headers['bold-signature'];
        
        const payload = req.body ? JSON.stringify(req.body) : '';

        if (!signature) {
            logPNPtvSecurityAlert('Bold webhook missing signature', { 
                ip: req.ip,
                userAgent: req.get('User-Agent'),
                availableHeaders: Object.keys(req.headers),
                url: req.originalUrl
            });
            return false;
        }

        // Verificar configuración de Bold.co para PNPtv
        const boldSecret = process.env.PNPTV_BOLD_SECRET_KEY || process.env.BOLD_SECRET_KEY;
        if (!boldSecret) {
            console.error('🚨 CRITICAL: PNPtv Bold secret key not configured!');
            logPNPtvSecurityAlert('Bold secret key not configured', { 
                ip: req.ip,
                environment: process.env.NODE_ENV
            });
            return false;
        }

        // Bold.co Colombia usa HMAC-SHA256
        const expectedSignature = crypto
            .createHmac('sha256', boldSecret)
            .update(payload)
            .digest('hex');

        // Normalizar firmas
        const cleanSignature = signature.replace(/^(sha256=|hmac-sha256=)/, '');
        
        // Comparación segura
        const isValid = crypto.timingSafeEqual(
            Buffer.from(cleanSignature, 'hex'),
            Buffer.from(expectedSignature, 'hex')
        );

        if (!isValid) {
            logPNPtvSecurityAlert('Bold webhook invalid signature for PNPtv', { 
                ip: req.ip,
                userAgent: req.get('User-Agent'),
                providedSignature: cleanSignature.substring(0, 8) + '...',
                payloadLength: payload.length,
                boldEnvironment: process.env.PNPTV_BOLD_ENVIRONMENT || 'not_set'
            });
        } else {
            console.log('✅ PNPtv Bold webhook signature validation passed');
        }

        return isValid;

    } catch (error) {
        logPNPtvSecurityAlert('Bold signature verification error for PNPtv', { 
            ip: req.ip,
            error: error.message,
            stack: error.stack
        });
        return false;
    }
}

// ================================================================
// PROTECCIÓN REPLAY ESPECÍFICA PARA PNPTV
// ================================================================

function isPNPtvReplayAttack(webhookId, req) {
    if (!webhookId) return false;

    if (pnptvProcessedWebhooks.has(webhookId)) {
        const originalTimestamp = pnptvProcessedWebhooks.get(webhookId);
        logPNPtvSecurityAlert('PNPtv replay attack detected', { 
            ip: req.ip,
            webhookId,
            originalTimestamp: new Date(originalTimestamp).toISOString(),
            timeSinceOriginal: Date.now() - originalTimestamp,
            userAgent: req.get('User-Agent')
        });
        return true;
    }

    return false;
}

function markPNPtvWebhookProcessed(webhookId) {
    if (webhookId) {
        pnptvProcessedWebhooks.set(webhookId, Date.now());
        console.log(`📝 PNPtv webhook ${webhookId.substring(0, 12)}... marcado como procesado`);
    }
}

// ================================================================
// WEBHOOK BOLD.CO PARA PNPTV - ENDPOINT PRINCIPAL
// ================================================================

router.post('/bold', 
    pnptvWebhookLimiter,
    express.json({ limit: '10mb' }),
    [
        // Validaciones específicas para Bold.co Colombia
        body('reference').notEmpty().withMessage('reference is required'),
        body('status').isIn([
            'APPROVED', 'DECLINED', 'PENDING', 'CANCELLED', 
            'FAILED', 'PROCESSING', 'REFUNDED'
        ]).withMessage('Invalid status'),
        body('amount').isNumeric().withMessage('amount must be numeric'),
        body('currency').optional().isIn(['COP', 'USD']).withMessage('Invalid currency'),
    ],
    async (req, res) => {
        const startTime = Date.now();
        const requestId = crypto.randomBytes(6).toString('hex');
        
        try {
            console.log(`📨 PNPtv Bold webhook [${requestId}] received:`, {
                reference: req.body.reference,
                status: req.body.status,
                amount: req.body.amount,
                ip: req.ip,
                userAgent: req.get('User-Agent')
            });

            // 1. Validar estructura específica de Bold.co
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                logPNPtvSecurityAlert('PNPtv Bold webhook validation failed', { 
                    requestId,
                    errors: errors.array(),
                    ip: req.ip,
                    body: req.body
                });
                return res.status(400).json({ 
                    error: 'Invalid request structure',
                    details: errors.array(),
                    requestId
                });
            }

            // 2. Verificar firma Bold.co
            const isValidSignature = verifyBoldSignatureForPNPtv(req);
            if (!isValidSignature) {
                return res.status(401).json({ 
                    error: 'Invalid signature',
                    timestamp: new Date().toISOString(),
                    requestId
                });
            }

            // 3. Verificar replay attack específico para PNPtv
            const webhookId = `pnptv-${req.body.reference}-${req.body.transaction_id || req.body.id || Date.now()}`;
            if (isPNPtvReplayAttack(webhookId, req)) {
                return res.status(409).json({ 
                    error: 'Webhook already processed',
                    reference: req.body.reference,
                    requestId
                });
            }

            // 4. Procesar webhook específico para PNPtv
            const result = await processPNPtvBoldWebhook(req.body, req.ip, requestId);

            // 5. Marcar como procesado
            markPNPtvWebhookProcessed(webhookId);

            // 6. Responder con éxito
            const processingTime = Date.now() - startTime;
            console.log(`✅ PNPtv Bold webhook [${requestId}] processed successfully in ${processingTime}ms`);
            
            res.status(200).json({ 
                status: 'success', 
                result,
                processingTime: `${processingTime}ms`,
                requestId,
                service: 'PNPtvLive-bot'
            });

        } catch (error) {
            const processingTime = Date.now() - startTime;
            console.error(`❌ PNPtv Bold webhook [${requestId}] error:`, error);
            
            logPNPtvSecurityAlert('PNPtv Bold webhook processing error', { 
                requestId,
                ip: req.ip,
                error: error.message,
                stack: error.stack,
                body: req.body,
                processingTime
            });
            
            res.status(500).json({ 
                error: 'Internal server error',
                timestamp: new Date().toISOString(),
                requestId
            });
        }
    }
);

// ================================================================
// PROCESAMIENTO ESPECÍFICO PARA PNPTV
// ================================================================

async function processPNPtvBoldWebhook(webhookData, clientIP, requestId) {
    const { status, reference, amount, transaction_id, currency = 'COP' } = webhookData;
    
    logPNPtvPaymentEvent('bold_webhook_received', { 
        requestId,
        status, 
        reference,
        amount,
        currency,
        transaction_id,
        ip: clientIP
    });

    try {
        switch (status) {
            case 'APPROVED':
                return await handlePNPtvPaymentCompleted({ 
                    id: transaction_id || reference, 
                    amount: { value: amount, currency_code: currency },
                    reference,
                    provider: 'bold'
                }, requestId);
                
            case 'DECLINED':
            case 'CANCELLED':
            case 'FAILED':
                return await handlePNPtvPaymentFailed({ 
                    id: transaction_id || reference,
                    reference,
                    reason: status,
                    provider: 'bold'
                }, requestId);
                
            case 'REFUNDED':
                return await handlePNPtvPaymentRefunded({
                    id: transaction_id || reference,
                    reference,
                    amount: { value: amount, currency_code: currency },
                    provider: 'bold'
                }, requestId);
                
            default:
                console.log(`PNPtv unhandled Bold status: ${status}`);
                return { status: 'ignored', bold_status: status, requestId };
        }
    } catch (error) {
        logPNPtvPaymentEvent('bold_processing_error', { 
            requestId,
            status,
            reference,
            error: error.message
        });
        throw error;
    }
}

// ================================================================
// HANDLERS ESPECÍFICOS PARA PNPTV
// ================================================================

async function handlePNPtvPaymentCompleted(paymentData, requestId) {
    console.log(`✅ PNPtv payment completed [${requestId}]:`, {
        id: paymentData.id,
        amount: paymentData.amount,
        reference: paymentData.reference
    });
    
    try {
        // TODO: Implementar lógica específica de PNPtv aquí
        // Ejemplos:
        // - Activar suscripción del usuario
        // - Enviar notificación al show en vivo
        // - Activar funciones premium del bot
        // - Enviar confirmación al usuario vía Telegram
        // - Actualizar estado en base de datos
        
        // Por ahora, log del evento
        logPNPtvPaymentEvent('payment_completed', {
            requestId,
            paymentId: paymentData.id,
            amount: paymentData.amount,
            reference: paymentData.reference,
            timestamp: new Date().toISOString()
        });
        
        return { 
            status: 'payment_processed', 
            provider: paymentData.provider,
            payment_id: paymentData.id,
            reference: paymentData.reference,
            timestamp: new Date().toISOString(),
            requestId
        };

    } catch (error) {
        console.error(`Error processing PNPtv payment completion [${requestId}]:`, error);
        throw error;
    }
}

async function handlePNPtvPaymentFailed(paymentData, requestId) {
    console.log(`❌ PNPtv payment failed [${requestId}]:`, {
        id: paymentData.id,
        reference: paymentData.reference,
        reason: paymentData.reason
    });
    
    // TODO: Implementar lógica específica de fallos de PNPtv
    // - Notificar al usuario del fallo
    // - Log para análisis de fallos
    // - Reintento automático si aplica
    
    logPNPtvPaymentEvent('payment_failed', {
        requestId,
        paymentId: paymentData.id,
        reference: paymentData.reference,
        reason: paymentData.reason,
        timestamp: new Date().toISOString()
    });
    
    return { 
        status: 'payment_failed', 
        provider: paymentData.provider,
        payment_id: paymentData.id,
        reference: paymentData.reference,
        reason: paymentData.reason,
        timestamp: new Date().toISOString(),
        requestId
    };
}

async function handlePNPtvPaymentRefunded(paymentData, requestId) {
    console.log(`🔄 PNPtv payment refunded [${requestId}]:`, {
        id: paymentData.id,
        reference: paymentData.reference,
        amount: paymentData.amount
    });
    
    // TODO: Implementar lógica específica de reembolsos de PNPtv
    // - Desactivar suscripción si aplica
    // - Notificar al usuario del reembolso
    // - Actualizar estado del bot
    
    logPNPtvPaymentEvent('payment_refunded', {
        requestId,
        paymentId: paymentData.id,
        reference: paymentData.reference,
        amount: paymentData.amount,
        timestamp: new Date().toISOString()
    });
    
    return { 
        status: 'payment_refunded', 
        provider: paymentData.provider,
        payment_id: paymentData.id,
        reference: paymentData.reference,
        amount: paymentData.amount,
        timestamp: new Date().toISOString(),
        requestId
    };
}

// ================================================================
// NOTIFICACIONES SLACK ESPECÍFICAS PARA PNPTV
// ================================================================

async function sendPNPtvSlackAlert(alert) {
    if (!process.env.PNPTV_SLACK_WEBHOOK_URL) return;
    
    try {
        const { IncomingWebhook } = require('@slack/webhook');
        const webhook = new IncomingWebhook(process.env.PNPTV_SLACK_WEBHOOK_URL);
        
        await webhook.send({
            text: `🚨 PNPtvLive Security Alert: ${alert.message}`,
            channel: '#pnptv-security',
            username: 'PNPtvLive Security Bot',
            icon_emoji: ':warning:',
            attachments: [{
                color: 'danger',
                title: 'Security Alert Details',
                fields: [
                    {
                        title: 'Service',
                        value: 'PNPtvLive-bot',
                        short: true
                    },
                    {
                        title: 'Timestamp',
                        value: alert.timestamp,
                        short: true
                    },
                    {
                        title: 'Source IP',
                        value: alert.data?.ip || 'Unknown',
                        short: true
                    },
                    {
                        title: 'Environment',
                        value: process.env.NODE_ENV || 'unknown',
                        short: true
                    },
                    {
                        title: 'Details',
                        value: `\`\`\`${JSON.stringify(alert.data, null, 2)}\`\`\``,
                        short: false
                    }
                ]
            }]
        });
    } catch (error) {
        console.error('PNPtv Slack alert failed:', error.message);
    }
}

async function sendPNPtvPaymentNotification(event) {
    if (!process.env.PNPTV_PAYMENTS_SLACK_WEBHOOK) return;
    
    try {
        const { IncomingWebhook } = require('@slack/webhook');
        const webhook = new IncomingWebhook(process.env.PNPTV_PAYMENTS_SLACK_WEBHOOK);
        
        const amount = event.data.amount || 'N/A';
        const reference = event.data.reference || 'N/A';
        
        await webhook.send({
            text: `💳 PNPtvLive Payment: ${event.type}`,
            channel: '#pnptv-payments',
            username: 'PNPtvLive Payment Bot',
            icon_emoji: ':moneybag:',
            attachments: [{
                color: event.type.includes('completed') ? 'good' : 
                       event.type.includes('failed') ? 'danger' : 'warning',
                title: `Payment ${event.type}`,
                fields: [
                    {
                        title: 'Amount',
                        value: typeof amount === 'object' ? `${amount.value} ${amount.currency_code}` : amount,
                        short: true
                    },
                    {
                        title: 'Reference',
                        value: reference,
                        short: true
                    },
                    {
                        title: 'Request ID',
                        value: event.data.requestId || 'N/A',
                        short: true
                    },
                    {
                        title: 'Timestamp',
                        value: event.timestamp,
                        short: true
                    }
                ]
            }]
        });
    } catch (error) {
        console.error('PNPtv payment notification failed:', error.message);
    }
}

// ================================================================
// HEALTH CHECK ESPECÍFICO PARA PNPTV
// ================================================================

router.get('/health', (req, res) => {
    const health = {
        status: 'healthy',
        service: 'PNPtvLive-bot',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development',
        processedWebhooks: pnptvProcessedWebhooks.size,
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        security: {
            rateLimit: 'active',
            signatureVerification: 'active',
            replayProtection: 'active',
            slackAlerts: !!process.env.PNPTV_SLACK_WEBHOOK_URL
        },
        configuration: {
            boldConfigured: !!(process.env.PNPTV_BOLD_SECRET_KEY || process.env.BOLD_SECRET_KEY),
            slackConfigured: !!process.env.PNPTV_SLACK_WEBHOOK_URL,
            paymentsSlackConfigured: !!process.env.PNPTV_PAYMENTS_SLACK_WEBHOOK,
            environment: process.env.PNPTV_BOLD_ENVIRONMENT || process.env.BOLD_ENVIRONMENT || 'not_set'
        },
        version: process.env.PNPTV_VERSION || '1.0.0'
    };
    
    res.json(health);
});

// ================================================================
// TESTING ENDPOINT (SOLO DESARROLLO)
// ================================================================

if (process.env.NODE_ENV === 'development') {
    router.post('/test', (req, res) => {
        console.log('🧪 PNPtv test webhook received:', req.body);
        res.json({ 
            status: 'test_received',
            service: 'PNPtvLive-bot',
            body: req.body,
            headers: req.headers,
            timestamp: new Date().toISOString()
        });
    });
}

// Inicialización específica para PNPtv
console.log('🔐 PNPtvLive webhook security system initialized successfully');
console.log(`📊 Security status: Rate limiting: ✅, Signature verification: ✅, Replay protection: ✅`);
console.log(`🏢 Service: PNPtvLive-bot v${process.env.PNPTV_VERSION || '1.0.0'}`);

module.exports = router;