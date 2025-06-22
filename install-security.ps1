# ====================================================================
# SCRIPT DE INSTALACIÓN PARA WINDOWS - SEGURIDAD DE WEBHOOKS
# PNPtvLive-bot Security Implementation for Windows
# EJECUTAR: powershell -ExecutionPolicy Bypass -File install-security.ps1
# ====================================================================

Write-Host "🚨 INSTALACIÓN URGENTE DE SEGURIDAD DE WEBHOOKS - WINDOWS" -ForegroundColor Red
Write-Host "==========================================================" -ForegroundColor Yellow
Write-Host ""

# ================================================================
# VERIFICAR PRERREQUISITOS
# ================================================================

Write-Host "🔍 Verificando prerrequisitos..." -ForegroundColor Cyan

# Verificar Node.js
try {
    $nodeVersion = node --version
    Write-Host "✅ Node.js: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ Node.js no está instalado. Descargar de https://nodejs.org" -ForegroundColor Red
    exit 1
}

# Verificar npm
try {
    $npmVersion = npm --version
    Write-Host "✅ npm: $npmVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ npm no encontrado" -ForegroundColor Red
    exit 1
}

# ================================================================
# INSTALAR DEPENDENCIAS CRÍTICAS
# ================================================================

Write-Host ""
Write-Host "📦 Instalando dependencias de seguridad..." -ForegroundColor Cyan

Write-Host "Instalando paquetes de seguridad críticos..." -ForegroundColor Yellow
npm install --save express-rate-limit helmet express-validator cors

Write-Host "Instalando paquetes de alertas..." -ForegroundColor Yellow
npm install --save @slack/webhook nodemailer

Write-Host "Instalando paquetes de testing..." -ForegroundColor Yellow
npm install --save-dev mocha chai supertest sinon

Write-Host "✅ Dependencias instaladas correctamente" -ForegroundColor Green

# ================================================================
# CREAR ESTRUCTURA DE ARCHIVOS
# ================================================================

Write-Host ""
Write-Host "📁 Creando estructura de archivos de seguridad..." -ForegroundColor Cyan

# Crear directorios si no existen
New-Item -ItemType Directory -Path "src\routes" -Force | Out-Null
New-Item -ItemType Directory -Path "src\middleware" -Force | Out-Null
New-Item -ItemType Directory -Path "src\utils" -Force | Out-Null
New-Item -ItemType Directory -Path "src\security" -Force | Out-Null
New-Item -ItemType Directory -Path "tests\security" -Force | Out-Null
New-Item -ItemType Directory -Path "logs" -Force | Out-Null
New-Item -ItemType Directory -Path "scripts" -Force | Out-Null

Write-Host "✅ Estructura de directorios creada" -ForegroundColor Green

# ================================================================
# CREAR ARCHIVO DE MIDDLEWARE DE SEGURIDAD
# ================================================================

Write-Host ""
Write-Host "🔒 Creando middleware de seguridad..." -ForegroundColor Cyan

$securityMiddleware = @'
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
'@

$securityMiddleware | Out-File -FilePath "src\middleware\security.js" -Encoding UTF8

Write-Host "✅ Middleware de seguridad creado" -ForegroundColor Green

# ================================================================
# CREAR UTILIDADES DE ALERTAS
# ================================================================

Write-Host ""
Write-Host "🚨 Creando sistema de alertas..." -ForegroundColor Cyan

$alertsUtility = @'
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
'@

$alertsUtility | Out-File -FilePath "src\utils\alerts.js" -Encoding UTF8

Write-Host "✅ Sistema de alertas creado" -ForegroundColor Green

# ================================================================
# CREAR SCRIPT DE VERIFICACIÓN
# ================================================================

Write-Host ""
Write-Host "🔧 Creando scripts de verificación..." -ForegroundColor Cyan

$verifyScript = @'
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
'@

$verifyScript | Out-File -FilePath "scripts\verify-config.js" -Encoding UTF8

Write-Host "✅ Script de verificación creado" -ForegroundColor Green

# ================================================================
# ACTUALIZAR PACKAGE.JSON CON SCRIPTS
# ================================================================

Write-Host ""
Write-Host "📝 Actualizando package.json..." -ForegroundColor Cyan

# Leer package.json existente
try {
    $packageJson = Get-Content -Path "package.json" -Raw | ConvertFrom-Json
    
    # Agregar scripts si no existen
    if (-not $packageJson.scripts) {
        $packageJson | Add-Member -MemberType NoteProperty -Name "scripts" -Value @{}
    }
    
    $packageJson.scripts | Add-Member -MemberType NoteProperty -Name "verify-config" -Value "node scripts/verify-config.js" -Force
    $packageJson.scripts | Add-Member -MemberType NoteProperty -Name "test-security" -Value "echo 'Security tests - implement based on your needs'" -Force
    $packageJson.scripts | Add-Member -MemberType NoteProperty -Name "start-secure" -Value "npm run verify-config && npm start" -Force
    
    # Guardar package.json actualizado
    $packageJson | ConvertTo-Json -Depth 10 | Out-File -FilePath "package.json" -Encoding UTF8
    
    Write-Host "✅ Scripts agregados a package.json" -ForegroundColor Green
} catch {
    Write-Host "⚠️  No se pudo actualizar package.json - agregar scripts manualmente" -ForegroundColor Yellow
}

# ================================================================
# CREAR ARCHIVO .ENV EJEMPLO
# ================================================================

Write-Host ""
Write-Host "⚙️  Verificando archivo .env..." -ForegroundColor Cyan

if (-not (Test-Path ".env")) {
    $envExample = @'
# ================================================================
# CONFIGURACIÓN CRÍTICA DE SEGURIDAD - COMPLETAR INMEDIATAMENTE
# ================================================================

NODE_ENV=production
PORT=3000

# ================================================================
# CONFIGURACIÓN PAYPAL (CRÍTICO)
# ================================================================
PAYPAL_CLIENT_ID=tu_paypal_client_id_aqui
PAYPAL_SECRET=tu_paypal_secret_aqui
PAYPAL_WEBHOOK_ID=tu_webhook_id_de_paypal_aqui
PAYPAL_ENVIRONMENT=sandbox

# ================================================================
# CONFIGURACIÓN BOLD.CO (CRÍTICO PARA COLOMBIA)
# ================================================================
BOLD_PUBLIC_KEY=tu_bold_public_key_aqui
BOLD_SECRET_KEY=tu_bold_secret_key_aqui
BOLD_ENVIRONMENT=development

# ================================================================
# CONFIGURACIÓN DE ALERTAS (RECOMENDADO)
# ================================================================
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/TU_WEBHOOK_DE_SLACK_AQUI
EMAIL_ALERT_TO=santino@pnptelevision.co
EMAIL_ALERT_FROM=alerts@pnptelevision.co

# ================================================================
# CONFIGURACIÓN DE SEGURIDAD
# ================================================================
WEBHOOK_SECRET=generar_clave_secreta_aqui
WEBHOOK_RATE_LIMIT_WINDOW=60000
WEBHOOK_RATE_LIMIT_MAX=50
WEBHOOK_MAX_AGE=300000

# ================================================================
# CONFIGURACIÓN DE BASE DE DATOS
# ================================================================
DATABASE_URL=postgresql://usuario:password@localhost:5432/pnptvlive
'@

    $envExample | Out-File -FilePath ".env" -Encoding UTF8
    Write-Host "📝 Archivo .env creado - CONFIGURAR VARIABLES CRÍTICAS" -ForegroundColor Yellow
} else {
    Write-Host "✅ Archivo .env ya existe" -ForegroundColor Green
}

# ================================================================
# INSTRUCCIONES FINALES
# ================================================================

Write-Host ""
Write-Host "🎉 INSTALACIÓN COMPLETADA" -ForegroundColor Green
Write-Host "========================" -ForegroundColor Yellow
Write-Host ""
Write-Host "📋 PRÓXIMOS PASOS CRÍTICOS:" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. 🔑 CONFIGURAR VARIABLES DE ENTORNO:" -ForegroundColor Red
Write-Host "   - Editar archivo .env" -ForegroundColor White
Write-Host "   - Completar PAYPAL_* y BOLD_* variables" -ForegroundColor White
Write-Host "   - Configurar SLACK_WEBHOOK_URL para alertas" -ForegroundColor White
Write-Host ""
Write-Host "2. 🔍 VERIFICAR CONFIGURACIÓN:" -ForegroundColor Red
Write-Host "   npm run verify-config" -ForegroundColor White
Write-Host ""
Write-Host "3. 🚀 INICIAR SERVIDOR SEGURO:" -ForegroundColor Red
Write-Host "   npm run start-secure" -ForegroundColor White
Write-Host ""
Write-Host "🚨 ADVERTENCIA: NO iniciar en producción hasta completar configuración" -ForegroundColor Red
Write-Host ""

Write-Host "🏁 INSTALACIÓN EXITOSA - ¡Ahora configurar variables!" -ForegroundColor Green