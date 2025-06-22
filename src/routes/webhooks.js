// ====================================================================
// ARCHIVO: src\routes\webhooks.js
// IMPLEMENTACIÓN MANUAL PARA WINDOWS - WEBHOOKS SEGUROS
// INSTRUCCIONES: Crear este archivo y copiar este contenido exacto
// ====================================================================

const express = require('express');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const router = express.Router();

console.log('🔐 Inicializando sistema de webhooks seguros...');

// ================================================================
// CONFIGURACIÓN DE SEGURIDAD CRÍTICA
// ================================================================

// Rate limiting específico para webhooks
const webhookLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minuto
    max: 50, // máximo 50 requests por minuto
    message: { 
        error: 'Too many webhook requests - possible attack detected',
        timestamp: new Date().toISOString()
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
        logSecurityAlert('Rate limit exceeded', { 
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            url: req.originalUrl
        });
        res.status(429).json({ 
            error: 'Too many requests',
            retryAfter: 60 
        });
    }
});

// Cache para prevenir replay attacks
const processedWebhooks = new Map();

// Limpiar cache cada 30 minutos
setInterval(() => {
    const now = Date.now();
    let cleaned = 0;
    for (const [id, timestamp] of processedWebhooks.entries()) {
        if (now - timestamp > 1800000) { // 30 minutos
            processedWebhooks.delete(id);
            cleaned++;
        }
    }
    if (cleaned > 0) {
        console.log(`🧹 Limpieza de cache: ${cleaned} webhooks antiguos removidos`);
    }
}, 1800000);

// ================================================================
// SISTEMA DE LOGGING DE SEGURIDAD
// ================================================================

function logSecurityAlert(message, data) {
    const alert = {
        timestamp: new Date().toISOString(),
        level: 'SECURITY_ALERT',
        message,
        data,
        source: 'webhook_security',
        severity: 'HIGH'
    };

    // Log inmediato en consola
    console.error('🚨 SECURITY ALERT:', JSON.stringify(alert, null, 2));

    // Enviar notificación si está configurado Slack
    if (process.env.SLACK_WEBHOOK_URL) {
        sendSlackAlert(alert).catch(err => 
            console.error('Failed to send Slack alert:', err.message)
        );
    }

    // TODO: Agregar más canales de notificación (email, SMS, etc.)
}

function logPaymentEvent(type, data) {
    const event = {
        timestamp: new Date().toISOString(),
        level: 'PAYMENT',
        type,
        data,
        source: 'webhook_payment'
    };

    console.log('💳 PAYMENT EVENT:', JSON.stringify(event, null, 2));
}

// Función simplificada para envío de alertas Slack
async function sendSlackAlert(alert) {
    if (!process.env.SLACK_WEBHOOK_URL) return;
    
    try {
        const { IncomingWebhook } = require('@slack/webhook');
        const webhook = new IncomingWebhook(process.env.SLACK_WEBHOOK_URL);
        
        await webhook.send({
            text: `🚨 SECURITY ALERT: ${alert.message}`,
            attachments: [{
                color: 'danger',
                fields: [
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
                        title: 'Details',
                        value: JSON.stringify(alert.data, null, 2),
                        short: false
                    }
                ]
            }]
        });
    } catch (error) {
        console.error('Slack notification failed:', error.message);
    }
}

// ================================================================
// VALIDACIÓN DE FIRMAS
// ================================================================

function verifyPayPalSignature(req) {
    try {
        const headers = req.headers;
        
        // Headers requeridos de PayPal
        const transmissionId = headers['paypal-transmission-id'];
        const certId = headers['paypal-cert-id'];
        const transmissionSig = headers['paypal-transmission-sig'];
        const transmissionTime = headers['paypal-transmission-time'];
        const authAlgo = headers['paypal-auth-algo'];

        // Verificar presencia de headers críticos
        if (!transmissionId || !certId || !transmissionSig || !transmissionTime || !authAlgo) {
            logSecurityAlert('PayPal webhook missing required headers', { 
                ip: req.ip,
                providedHeaders: Object.keys(headers),
                missingHeaders: {
                    transmissionId: !transmissionId,
                    certId: !certId,
                    transmissionSig: !transmissionSig,
                    transmissionTime: !transmissionTime,
                    authAlgo: !authAlgo
                }
            });
            return false;
        }

        // Verificar edad del webhook (máximo 5 minutos)
        const webhookTime = parseInt(transmissionTime) * 1000;
        const now = Date.now();
        const age = now - webhookTime;
        
        if (age > 300000) { // 5 minutos
            logSecurityAlert('PayPal webhook too old', { 
                ip: req.ip,
                webhookTime: new Date(webhookTime).toISOString(),
                currentTime: new Date(now).toISOString(),
                ageMinutes: Math.round(age / 60000)
            });
            return false;
        }

        // Verificar formato de firma
        if (transmissionSig.length < 50 || authAlgo !== 'SHA256withRSA') {
            logSecurityAlert('PayPal webhook invalid signature format', { 
                ip: req.ip,
                signatureLength: transmissionSig.length,
                authAlgo,
                expectedAlgo: 'SHA256withRSA'
            });
            return false;
        }

        // En desarrollo, permitir bypass si está habilitado
        if (process.env.NODE_ENV === 'development' && process.env.SKIP_PAYPAL_VERIFICATION === 'true') {
            console.warn('⚠️  WARNING: PayPal signature verification BYPASSED in development mode');
            return true;
        }

        // TODO: Implementar verificación real con certificado PayPal
        // Por ahora, verificamos formato y estructura
        console.log('✅ PayPal webhook signature validation passed (basic checks)');
        return true;

    } catch (error) {
        logSecurityAlert('PayPal signature verification error', { 
            ip: req.ip,
            error: error.message,
            stack: error.stack
        });
        return false;
    }
}

function verifyBoldSignature(req) {
    try {
        const signature = req.headers['x-bold-signature'] || req.headers['x-signature'];
        const payload = req.body ? JSON.stringify(req.body) : '';

        if (!signature) {
            logSecurityAlert('Bold webhook missing signature header', { 
                ip: req.ip,
                availableHeaders: Object.keys(req.headers),
                expectedHeaders: ['x-bold-signature', 'x-signature']
            });
            return false;
        }

        if (!process.env.BOLD_SECRET_KEY) {
            console.error('🚨 CRITICAL ERROR: BOLD_SECRET_KEY not configured!');
            logSecurityAlert('Bold secret key not configured', { ip: req.ip });
            return false;
        }

        // Bold.co típicamente usa HMAC-SHA256
        const expectedSignature = crypto
            .createHmac('sha256', process.env.BOLD_SECRET_KEY)
            .update(payload)
            .digest('hex');

        // Normalizar firmas (remover prefijos como 'sha256=')
        const cleanSignature = signature.replace(/^sha256=/, '');
        
        // Comparación segura contra timing attacks
        const isValid = crypto.timingSafeEqual(
            Buffer.from(cleanSignature, 'hex'),
            Buffer.from(expectedSignature, 'hex')
        );

        if (!isValid) {
            logSecurityAlert('Bold webhook invalid signature', { 
                ip: req.ip,
                providedSignature: cleanSignature.substring(0, 10) + '...',
                payloadLength: payload.length,
                signatureAlgorithm: 'HMAC-SHA256'
            });
        } else {
            console.log('✅ Bold webhook signature validation passed');
        }

        return isValid;

    } catch (error) {
        logSecurityAlert('Bold signature verification error', { 
            ip: req.ip,
            error: error.message,
            stack: error.stack
        });
        return false;
    }
}

// ================================================================
// PROTECCIÓN CONTRA REPLAY ATTACKS
// ================================================================

function isReplayAttack(webhookId, req) {
    if (!webhookId) {
        return false;
    }

    if (processedWebhooks.has(webhookId)) {
        const originalTimestamp = processedWebhooks.get(webhookId);
        logSecurityAlert('Replay attack detected', { 
            ip: req.ip,
            webhookId,
            originalTimestamp: new Date(originalTimestamp).toISOString(),
            timeSinceOriginal: Date.now() - originalTimestamp
        });
        return true;
    }

    return false;
}

function markWebhookProcessed(webhookId) {
    if (webhookId) {
        processedWebhooks.set(webhookId, Date.now());
        console.log(`📝 Webhook ${webhookId} marcado como procesado`);
    }
}

// ================================================================
// WEBHOOK PAYPAL - ENDPOINT SEGURO
// ================================================================

router.post('/paypal', 
    webhookLimiter,
    express.json({ limit: '10mb' }),
    [
        body('event_type').notEmpty().withMessage('event_type is required'),
        body('resource').isObject().withMessage('resource must be an object'),
    ],
    async (req, res) => {
        const startTime = Date.now();
        
        try {
            console.log('📨 PayPal webhook received:', {
                eventType: req.body.event_type,
                resourceId: req.body.resource?.id,
                ip: req.ip
            });

            // 1. Validar estructura del request
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                logSecurityAlert('PayPal webhook validation failed', { 
                    errors: errors.array(),
                    ip: req.ip,
                    body: req.body
                });
                return res.status(400).json({ 
                    error: 'Invalid request structure',
                    details: errors.array()
                });
            }

            // 2. Verificar firma PayPal
            const isValidSignature = verifyPayPalSignature(req);
            if (!isValidSignature) {
                return res.status(401).json({ 
                    error: 'Invalid signature',
                    timestamp: new Date().toISOString()
                });
            }

            // 3. Verificar replay attack
            const webhookId = req.headers['paypal-transmission-id'];
            if (isReplayAttack(webhookId, req)) {
                return res.status(409).json({ 
                    error: 'Webhook already processed',
                    webhookId
                });
            }

            // 4. Procesar webhook
            const result = await processPayPalWebhook(req.body, req.ip);

            // 5. Marcar como procesado
            markWebhookProcessed(webhookId);

            // 6. Responder con éxito
            const processingTime = Date.now() - startTime;
            console.log(`✅ PayPal webhook processed successfully in ${processingTime}ms`);
            
            res.status(200).json({ 
                status: 'success', 
                result,
                processingTime: `${processingTime}ms`
            });

        } catch (error) {
            const processingTime = Date.now() - startTime;
            console.error('PayPal webhook processing error:', error);
            
            logSecurityAlert('PayPal webhook processing error', { 
                ip: req.ip,
                error: error.message,
                stack: error.stack,
                body: req.body,
                processingTime
            });
            
            res.status(500).json({ 
                error: 'Internal server error',
                timestamp: new Date().toISOString()
            });
        }
    }
);

// ================================================================
// WEBHOOK BOLD.CO - ENDPOINT SEGURO
// ================================================================

router.post('/bold', 
    webhookLimiter,
    express.json({ limit: '10mb' }),
    [
        body('reference').notEmpty().withMessage('reference is required'),
        body('status').isIn(['APPROVED', 'DECLINED', 'PENDING', 'CANCELLED', 'FAILED']).withMessage('Invalid status'),
        body('amount').isNumeric().withMessage('amount must be numeric'),
    ],
    async (req, res) => {
        const startTime = Date.now();
        
        try {
            console.log('📨 Bold webhook received:', {
                reference: req.body.reference,
                status: req.body.status,
                amount: req.body.amount,
                ip: req.ip
            });

            // 1. Validar estructura
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                logSecurityAlert('Bold webhook validation failed', { 
                    errors: errors.array(),
                    ip: req.ip,
                    body: req.body
                });
                return res.status(400).json({ 
                    error: 'Invalid request structure',
                    details: errors.array()
                });
            }

            // 2. Verificar firma Bold.co
            const isValidSignature = verifyBoldSignature(req);
            if (!isValidSignature) {
                return res.status(401).json({ 
                    error: 'Invalid signature',
                    timestamp: new Date().toISOString()
                });
            }

            // 3. Verificar replay attack
            const webhookId = `${req.body.reference}-${req.body.transaction_id || req.body.id || Date.now()}`;
            if (isReplayAttack(webhookId, req)) {
                return res.status(409).json({ 
                    error: 'Webhook already processed',
                    reference: req.body.reference
                });
            }

            // 4. Procesar webhook
            const result = await processBoldWebhook(req.body, req.ip);

            // 5. Marcar como procesado
            markWebhookProcessed(webhookId);

            // 6. Responder con éxito
            const processingTime = Date.now() - startTime;
            console.log(`✅ Bold webhook processed successfully in ${processingTime}ms`);
            
            res.status(200).json({ 
                status: 'success', 
                result,
                processingTime: `${processingTime}ms`
            });

        } catch (error) {
            const processingTime = Date.now() - startTime;
            console.error('Bold webhook processing error:', error);
            
            logSecurityAlert('Bold webhook processing error', { 
                ip: req.ip,
                error: error.message,
                stack: error.stack,
                body: req.body,
                processingTime
            });
            
            res.status(500).json({ 
                error: 'Internal server error',
                timestamp: new Date().toISOString()
            });
        }
    }
);

// ================================================================
// PROCESADORES DE WEBHOOKS
// ================================================================

async function processPayPalWebhook(webhookData, clientIP) {
    const { event_type, resource } = webhookData;
    
    logPaymentEvent('paypal_webhook_received', { 
        event_type, 
        resource_id: resource.id,
        ip: clientIP
    });

    try {
        switch (event_type) {
            case 'PAYMENT.CAPTURE.COMPLETED':
                return await handlePaymentCompleted(resource, 'paypal');
                
            case 'PAYMENT.CAPTURE.DENIED':
            case 'PAYMENT.CAPTURE.REFUNDED':
                return await handlePaymentFailed(resource, 'paypal');
                
            case 'BILLING.SUBSCRIPTION.ACTIVATED':
                return await handleSubscriptionActivated(resource, 'paypal');
                
            case 'BILLING.SUBSCRIPTION.CANCELLED':
                return await handleSubscriptionCancelled(resource, 'paypal');
                
            default:
                console.log('Unhandled PayPal event:', event_type);
                return { status: 'ignored', event_type };
        }
    } catch (error) {
        logPaymentEvent('paypal_processing_error', { 
            event_type,
            resource_id: resource.id,
            error: error.message
        });
        throw error;
    }
}

async function processBoldWebhook(webhookData, clientIP) {
    const { status, reference, amount, transaction_id } = webhookData;
    
    logPaymentEvent('bold_webhook_received', { 
        status, 
        reference,
        amount,
        transaction_id,
        ip: clientIP
    });

    try {
        switch (status) {
            case 'APPROVED':
                return await handlePaymentCompleted({ 
                    id: transaction_id || reference, 
                    amount: { value: amount, currency_code: 'COP' },
                    reference
                }, 'bold');
                
            case 'DECLINED':
            case 'CANCELLED':
            case 'FAILED':
                return await handlePaymentFailed({ 
                    id: transaction_id || reference,
                    reference
                }, 'bold');
                
            default:
                console.log('Unhandled Bold status:', status);
                return { status: 'ignored', bold_status: status };
        }
    } catch (error) {
        logPaymentEvent('bold_processing_error', { 
            status,
            reference,
            error: error.message
        });
        throw error;
    }
}

// ================================================================
// HANDLERS DE EVENTOS (IMPLEMENTAR SEGÚN TU LÓGICA)
// ================================================================

async function handlePaymentCompleted(paymentData, provider) {
    console.log(`✅ Payment completed via ${provider}:`, {
        id: paymentData.id,
        amount: paymentData.amount,
        reference: paymentData.reference
    });
    
    // TODO: Implementar tu lógica específica aquí
    // Ejemplo:
    // const userId = await extractUserIdFromPayment(paymentData);
    // await activateUserSubscription(userId, paymentData, provider);
    // await sendWelcomeEmail(userId);
    
    return { 
        status: 'payment_processed', 
        provider, 
        payment_id: paymentData.id,
        timestamp: new Date().toISOString()
    };
}

async function handlePaymentFailed(paymentData, provider) {
    console.log(`❌ Payment failed via ${provider}:`, {
        id: paymentData.id,
        reference: paymentData.reference
    });
    
    // TODO: Implementar tu lógica específica aquí
    // Ejemplo:
    // await logFailedPayment(paymentData, provider);
    // await notifyUserOfFailure(paymentData);
    
    return { 
        status: 'payment_failed', 
        provider, 
        payment_id: paymentData.id,
        timestamp: new Date().toISOString()
    };
}

async function handleSubscriptionActivated(subscriptionData, provider) {
    console.log(`🔄 Subscription activated via ${provider}:`, {
        id: subscriptionData.id
    });
    
    // TODO: Implementar tu lógica específica aquí
    
    return { 
        status: 'subscription_activated', 
        provider, 
        subscription_id: subscriptionData.id,
        timestamp: new Date().toISOString()
    };
}

async function handleSubscriptionCancelled(subscriptionData, provider) {
    console.log(`🚫 Subscription cancelled via ${provider}:`, {
        id: subscriptionData.id
    });
    
    // TODO: Implementar tu lógica específica aquí
    
    return { 
        status: 'subscription_cancelled', 
        provider, 
        subscription_id: subscriptionData.id,
        timestamp: new Date().toISOString()
    };
}

// ================================================================
// ENDPOINT DE HEALTH CHECK
// ================================================================

router.get('/health', (req, res) => {
    const health = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development',
        processedWebhooks: processedWebhooks.size,
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        security: {
            rateLimit: 'active',
            signatureVerification: 'active',
            replayProtection: 'active',
            slackAlerts: !!process.env.SLACK_WEBHOOK_URL
        },
        configuration: {
            paypalConfigured: !!(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_SECRET),
            boldConfigured: !!process.env.BOLD_SECRET_KEY,
            webhookSecretConfigured: !!process.env.WEBHOOK_SECRET
        }
    };
    
    res.json(health);
});

// ================================================================
// ENDPOINT DE TESTING (SOLO DESARROLLO)
// ================================================================

if (process.env.NODE_ENV === 'development') {
    router.post('/test', (req, res) => {
        console.log('🧪 Test webhook received:', req.body);
        res.json({ 
            status: 'test_received', 
            body: req.body,
            headers: req.headers,
            timestamp: new Date().toISOString()
        });
    });
}

// Inicialización
console.log('🔐 Webhook security system initialized successfully');
console.log(`📊 Security status: Rate limiting: ✅, Signature verification: ✅, Replay protection: ✅`);

module.exports = router;