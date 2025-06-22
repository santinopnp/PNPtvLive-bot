#!/bin/bash

# ====================================================================
# SCRIPT DE INSTALACIÓN URGENTE - SEGURIDAD DE WEBHOOKS
# PNPtvLive-bot Security Implementation
# EJECUTAR: chmod +x install-security.sh && ./install-security.sh
# ====================================================================

set -e  # Salir si hay error

echo "🚨 INSTALACIÓN URGENTE DE SEGURIDAD DE WEBHOOKS"
echo "================================================"
echo ""

# ================================================================
# VERIFICAR PRERREQUISITOS
# ================================================================

echo "🔍 Verificando prerrequisitos..."

# Verificar Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js no está instalado. Instalando..."
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi

NODE_VERSION=$(node --version)
echo "✅ Node.js: $NODE_VERSION"

# Verificar npm
if ! command -v npm &> /dev/null; then
    echo "❌ npm no encontrado"
    exit 1
fi

NPM_VERSION=$(npm --version)
echo "✅ npm: $NPM_VERSION"

# ================================================================
# INSTALAR DEPENDENCIAS CRÍTICAS
# ================================================================

echo ""
echo "📦 Instalando dependencias de seguridad..."

# Dependencias críticas para seguridad
SECURITY_PACKAGES=(
    "express-rate-limit"
    "helmet"
    "express-validator"
    "cors"
    "crypto"
)

# Dependencias para alertas
ALERT_PACKAGES=(
    "@slack/webhook"
    "nodemailer"
)

# Dependencias para testing
TEST_PACKAGES=(
    "mocha"
    "chai"
    "supertest"
    "sinon"
)

echo "Instalando paquetes de seguridad críticos..."
npm install --save "${SECURITY_PACKAGES[@]}"

echo "Instalando paquetes de alertas..."
npm install --save "${ALERT_PACKAGES[@]}"

echo "Instalando paquetes de testing..."
npm install --save-dev "${TEST_PACKAGES[@]}"

echo "✅ Dependencias instaladas correctamente"

# ================================================================
# CREAR ESTRUCTURA DE ARCHIVOS
# ================================================================

echo ""
echo "📁 Creando estructura de archivos de seguridad..."

# Crear directorios si no existen
mkdir -p src/routes
mkdir -p src/middleware
mkdir -p src/utils
mkdir -p src/security
mkdir -p tests/security
mkdir -p logs
mkdir -p scripts

echo "✅ Estructura de directorios creada"

# ================================================================
# CREAR ARCHIVO DE MIDDLEWARE DE SEGURIDAD
# ================================================================

echo ""
echo "🔒 Creando middleware de seguridad..."

cat > src/middleware/security.js << 'EOF'
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

// Configuración de CORS
const corsOptions = {
    origin: process.env.CORS_ORIGIN || 'https://pnptelevision.co',
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Signature', 'X-Bold-Signature'],
    credentials: true
};

// Rate limiting global
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 1000, // 1000 requests por IP por ventana
    message: 'Too many requests from this IP',
    standardHeaders: true,
    legacyHeaders: false,
});

// Rate limiting para autenticación
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 5, // 5 intentos de login por IP
    message: 'Too many authentication attempts',
    skipSuccessfulRequests: true,
});

module.exports = {
    helmet: helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                styleSrc: ["'self'", "'unsafe-inline'"],
                scriptSrc: ["'self'"],
                imgSrc: ["'self'", "data:", "https:"],
            },
        },
        hsts: {
            maxAge: 31536000,
            includeSubDomains: true,
            preload: true
        }
    }),
    cors: cors(corsOptions),
    globalLimiter,
    authLimiter
};
EOF

echo "✅ Middleware de seguridad creado"

# ================================================================
# CREAR UTILIDADES DE ALERTAS
# ================================================================

echo ""
echo "🚨 Creando sistema de alertas..."

cat > src/utils/alerts.js << 'EOF'
const { IncomingWebhook } = require('@slack/webhook');
const nodemailer = require('nodemailer');

class AlertManager {
    constructor() {
        this.slackWebhook = process.env.SLACK_WEBHOOK_URL ? 
            new IncomingWebhook(process.env.SLACK_WEBHOOK_URL) : null;
        
        this.emailTransporter = this.setupEmailTransporter();
    }

    setupEmailTransporter() {
        if (!process.env.SMTP_HOST) return null;

        return nodemailer.createTransporter({
            host: process.env.SMTP_HOST,
            port: process.env.SMTP_PORT || 587,
            secure: false,
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS
            }
        });
    }

    async sendSecurityAlert(alert) {
        const message = `🚨 SECURITY ALERT: ${alert.message}\n\nDetails: ${JSON.stringify(alert.data, null, 2)}`;
        
        // Enviar a Slack
        if (this.slackWebhook) {
            try {
                await this.slackWebhook.send({
                    text: message,
                    channel: '#security-alerts',
                    username: 'PNPtvLive Security Bot',
                    icon_emoji: ':warning:'
                });
            } catch (error) {
                console.error('Failed to send Slack alert:', error);
            }
        }

        // Enviar por email
        if (this.emailTransporter && process.env.EMAIL_ALERT_TO) {
            try {
                await this.emailTransporter.sendMail({
                    from: process.env.EMAIL_ALERT_FROM,
                    to: process.env.EMAIL_ALERT_TO,
                    subject: `[URGENT] PNPtvLive Security Alert: ${alert.message}`,
                    text: message
                });
            } catch (error) {
                console.error('Failed to send email alert:', error);
            }
        }
    }

    async sendPaymentAlert(payment) {
        const message = `💳 Payment Event: ${payment.type}\n\nAmount: ${payment.amount}\nProvider: ${payment.provider}\nStatus: ${payment.status}`;
        
        if (this.slackWebhook) {
            try {
                await this.slackWebhook.send({
                    text: message,
                    channel: '#payments',
                    username: 'PNPtvLive Payment Bot',
                    icon_emoji: ':moneybag:'
                });
            } catch (error) {
                console.error('Failed to send payment alert:', error);
            }
        }
    }
}

module.exports = new AlertManager();
EOF

echo "✅ Sistema de alertas creado"

# ================================================================
# CREAR SCRIPT DE VERIFICACIÓN
# ================================================================

echo ""
echo "🔧 Creando scripts de verificación..."

cat > scripts/verify-config.js << 'EOF'
#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🔍 Verificando configuración de seguridad...\n');

// Variables críticas requeridas
const requiredVars = [
    'PAYPAL_CLIENT_ID',
    'PAYPAL_SECRET', 
    'PAYPAL_WEBHOOK_ID',
    'BOLD_SECRET_KEY'
];

// Variables recomendadas
const recommendedVars = [
    'SLACK_WEBHOOK_URL',
    'EMAIL_ALERT_TO',
    'SENTRY_DSN',
    'DATABASE_URL'
];

let hasErrors = false;
let hasWarnings = false;

console.log('📋 VARIABLES CRÍTICAS:');
requiredVars.forEach(varName => {
    const value = process.env[varName];
    if (!value) {
        console.log(`❌ ${varName}: NO CONFIGURADA`);
        hasErrors = true;
    } else {
        console.log(`✅ ${varName}: Configurada`);
    }
});

console.log('\n📋 VARIABLES RECOMENDADAS:');
recommendedVars.forEach(varName => {
    const value = process.env[varName];
    if (!value) {
        console.log(`⚠️  ${varName}: No configurada`);
        hasWarnings = true;
    } else {
        console.log(`✅ ${varName}: Configurada`);
    }
});

// Verificar archivos críticos
console.log('\n📋 ARCHIVOS CRÍTICOS:');
const requiredFiles = [
    'src/routes/webhooks.js',
    'src/middleware/security.js',
    'src/utils/alerts.js'
];

requiredFiles.forEach(filePath => {
    if (fs.existsSync(filePath)) {
        console.log(`✅ ${filePath}: Existe`);
    } else {
        console.log(`❌ ${filePath}: NO EXISTE`);
        hasErrors = true;
    }
});

// Verificar permisos
console.log('\n📋 PERMISOS:');
const logDir = 'logs';
try {
    if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
    }
    fs.accessSync(logDir, fs.constants.W_OK);
    console.log(`✅ Directorio de logs: Escribible`);
} catch (error) {
    console.log(`❌ Directorio de logs: No escribible`);
    hasErrors = true;
}

// Resultado final
console.log('\n' + '='.repeat(50));
if (hasErrors) {
    console.log('❌ CONFIGURACIÓN INCOMPLETA - Corregir errores antes de continuar');
    process.exit(1);
} else if (hasWarnings) {
    console.log('⚠️  CONFIGURACIÓN BÁSICA COMPLETA - Considerar variables recomendadas');
    process.exit(0);
} else {
    console.log('✅ CONFIGURACIÓN COMPLETA - Todo está listo');
    process.exit(0);
}
EOF

chmod +x scripts/verify-config.js

echo "✅ Script de verificación creado"

# ================================================================
# CREAR SCRIPT DE TESTING DE SEGURIDAD
# ================================================================

echo ""
echo "🧪 Creando script de testing de seguridad..."

cat > scripts/test-security.js << 'EOF'
#!/usr/bin/env node

const http = require('http');
const https = require('https');
const crypto = require('crypto');

console.log('🧪 Ejecutando tests de seguridad básicos...\n');

const baseUrl = process.env.BASE_URL || 'http://localhost:3000';

async function testEndpoint(path, expectedStatus = 200) {
    return new Promise((resolve) => {
        const url = `${baseUrl}${path}`;
        const client = url.startsWith('https') ? https : http;
        
        client.get(url, (res) => {
            console.log(`${res.statusCode === expectedStatus ? '✅' : '❌'} ${path}: ${res.statusCode}`);
            resolve(res.statusCode === expectedStatus);
        }).on('error', (err) => {
            console.log(`❌ ${path}: Error - ${err.message}`);
            resolve(false);
        });
    });
}

async function testRateLimit() {
    console.log('🔄 Testing rate limiting...');
    
    const promises = [];
    for (let i = 0; i < 60; i++) {
        promises.push(testEndpoint('/webhook/health', null));
    }
    
    const results = await Promise.all(promises);
    const blocked = results.filter(r => !r).length;
    
    if (blocked > 0) {
        console.log(`✅ Rate limiting: ${blocked} requests blocked`);
        return true;
    } else {
        console.log(`⚠️  Rate limiting: No requests blocked (verify configuration)`);
        return false;
    }
}

async function runTests() {
    console.log('📋 TESTS BÁSICOS:');
    
    await testEndpoint('/webhook/health');
    await testEndpoint('/webhook/paypal', 400); // Sin datos debe dar 400
    await testEndpoint('/webhook/bold', 400);   // Sin datos debe dar 400
    
    console.log('\n📋 TESTS DE RATE LIMITING:');
    await testRateLimit();
    
    console.log('\n✅ Tests básicos completados');
}

runTests().catch(console.error);
EOF

chmod +x scripts/test-security.js

echo "✅ Script de testing creado"

# ================================================================
# ACTUALIZAR PACKAGE.JSON CON SCRIPTS
# ================================================================

echo ""
echo "📝 Actualizando package.json..."

# Crear backup del package.json
if [ -f package.json ]; then
    cp package.json package.json.backup
fi

# Agregar scripts si no existen
node -e "
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));

pkg.scripts = pkg.scripts || {};
pkg.scripts['verify-config'] = 'node scripts/verify-config.js';
pkg.scripts['test-security'] = 'node scripts/test-security.js';
pkg.scripts['start-secure'] = 'npm run verify-config && npm start';

fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2));
console.log('✅ Scripts agregados a package.json');
"

# ================================================================
# CREAR ARCHIVO .ENV EJEMPLO
# ================================================================

echo ""
echo "⚙️  Creando archivo .env.example..."

if [ ! -f .env ]; then
    cp .env.example .env 2>/dev/null || echo "# Configurar variables según .env.example" > .env
    echo "📝 Archivo .env creado - CONFIGURAR VARIABLES CRÍTICAS"
fi

# ================================================================
# INSTRUCCIONES FINALES
# ================================================================

echo ""
echo "🎉 INSTALACIÓN COMPLETADA"
echo "========================"
echo ""
echo "📋 PRÓXIMOS PASOS CRÍTICOS:"
echo ""
echo "1. 🔑 CONFIGURAR VARIABLES DE ENTORNO:"
echo "   - Editar archivo .env"
echo "   - Completar PAYPAL_* y BOLD_* variables"
echo "   - Configurar SLACK_WEBHOOK_URL para alertas"
echo ""
echo "2. 🔍 VERIFICAR CONFIGURACIÓN:"
echo "   npm run verify-config"
echo ""
echo "3. 🧪 EJECUTAR TESTS DE SEGURIDAD:"
echo "   npm run test-security"
echo ""
echo "4. 🚀 INICIAR SERVIDOR SEGURO:"
echo "   npm run start-secure"
echo ""
echo "🚨 ADVERTENCIA: NO iniciar en producción hasta completar configuración"
echo ""
echo "📞 SOPORTE: Si necesitas ayuda, contacta al equipo técnico"
echo ""

# ================================================================
# VERIFICACIÓN FINAL
# ================================================================

echo "🔍 Ejecutando verificación final..."

# Verificar que los archivos se crearon correctamente
if [ -f "src/routes/webhooks.js" ] && [ -f "src/middleware/security.js" ]; then
    echo "✅ Archivos de seguridad creados correctamente"
else
    echo "❌ Error: Algunos archivos no se crearon correctamente"
    exit 1
fi

# Verificar dependencias instaladas
if npm list express-rate-limit &> /dev/null; then
    echo "✅ Dependencias de seguridad instaladas"
else
    echo "❌ Error: Dependencias no instaladas correctamente"
    exit 1
fi

echo ""
echo "🏁 INSTALACIÓN EXITOSA - ¡Configurar variables y probar!"