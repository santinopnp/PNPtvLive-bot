// index.js - Punto de entrada del Bot-PNPtv-Live
// Los módulos están en la carpeta ./bot/

const path = require('path');

// Importar el módulo principal desde la carpeta bot
const MultiPerformerBotCore = require('./bot/core_module');

// Configurar logging
const logInfo = (message) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ℹ️  ${message}`);
};

const logError = (message, error = null) => {
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}] ❌ ${message}`, error || '');
};

const logSuccess = (message) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ✅ ${message}`);
};

// Manejar señales del sistema para cierre limpio
process.on('SIGINT', () => {
    console.log('\n🛑 Cerrando Bot-PNPtv-Live...');
    logInfo('Bot detenido por usuario (SIGINT)');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n🛑 Terminando Bot-PNPtv-Live...');
    logInfo('Bot terminado por sistema (SIGTERM)');
    process.exit(0);
});

// Manejar errores no capturados
process.on('uncaughtException', (error) => {
    logError('Error no capturado:', error);
    console.error('Stack trace:', error.stack);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    logError('Promesa rechazada no manejada:', { reason, promise });
    process.exit(1);
});

// Banner de inicio
function showStartupBanner() {
    console.clear();
    console.log('===============================================');
    console.log('🎭 BOT-PNPTV-LIVE INICIANDO...');
    console.log('===============================================');
    console.log('🤖 Multi-Performer Webex Bot');
    console.log('📅 Versión: 2.0.0');
    console.log('📁 Módulos desde: ./bot/');
    console.log('🌐 Plataforma:', process.platform);
    console.log('📊 Node.js:', process.version);
    console.log('⏰ Inicio:', new Date().toLocaleString('es-CO'));
    console.log('===============================================');
    console.log();
}

// Verificar estructura del proyecto
function verifyProjectStructure() {
    const fs = require('fs');
    const requiredFiles = [
        './bot/core_module.js',
        './bot/performer_manager.js',
        './bot/tip_manager.js',
        './bot/webhook_handler.js',
        './bot/routes_module.js',
        './bot/utils_module.js'
    ];
    
    logInfo('Verificando estructura del proyecto...');
    
    for (const file of requiredFiles) {
        if (!fs.existsSync(file)) {
            logError(`Archivo requerido no encontrado: ${file}`);
            console.log('💡 Asegúrate de que todos los módulos estén en la carpeta ./bot/');
            process.exit(1);
        }
    }
    
    logSuccess('Estructura del proyecto verificada');
}

// Verificar variables de entorno
function verifyEnvironment() {
    logInfo('Verificando variables de entorno...');
    
    const requiredEnvVars = ['WEBEX_BOT_TOKEN', 'WEBEX_BOT_EMAIL'];
    const missingVars = [];
    
    for (const envVar of requiredEnvVars) {
        if (!process.env[envVar]) {
            missingVars.push(envVar);
        }
    }
    
    if (missingVars.length > 0) {
        logError('Variables de entorno faltantes:', missingVars.join(', '));
        console.log('💡 Configura estas variables en tu archivo .env');
        process.exit(1);
    }
    
    // Mostrar configuración (ocultando datos sensibles)
    logSuccess('Variables de entorno configuradas:');
    console.log(`🤖 Bot Email: ${process.env.WEBEX_BOT_EMAIL}`);
    console.log(`🔑 Bot Token: ${process.env.WEBEX_BOT_TOKEN.substring(0, 20)}...`);
    console.log(`🌐 Puerto: ${process.env.PORT || 3000}`);
    console.log(`🔐 Password Master: ${process.env.MASTER_PASSWORD ? '***' : 'No configurado'}`);
}

// Función principal
async function startBot() {
    try {
        showStartupBanner();
        
        // Verificaciones previas
        verifyProjectStructure();
        verifyEnvironment();
        
        logInfo('Iniciando Bot-PNPtv-Live...');
        
        // Crear e iniciar el bot
        const bot = new MultiPerformerBotCore();
        
        // El método start() del core ya maneja el servidor Express
        bot.start();
        
        logSuccess('Bot-PNPtv-Live iniciado exitosamente');
        
        // Mostrar información útil
        const port = process.env.PORT || 3000;
        console.log();
        console.log('🎉 ===================================');
        console.log('✅ BOT-PNPTV-LIVE ESTÁ FUNCIONANDO');
        console.log('🎉 ===================================');
        console.log();
        console.log('🌐 Dashboards disponibles:');
        console.log(`   👤 Performer: http://localhost:${port}/performer`);
        console.log(`   🔧 Admin: http://localhost:${port}/admin`);
        console.log(`   📊 API Status: http://localhost:${port}/api/status`);
        console.log();
        console.log('🤖 Bot de Webex configurado:');
        console.log(`   📧 Email: ${process.env.WEBEX_BOT_EMAIL}`);
        console.log(`   🔗 Webhook: http://localhost:${port}/webhook`);
        console.log();
        console.log('💡 Comandos de prueba en Webex:');
        console.log('   /help    - Ver ayuda');
        console.log('   /status  - Ver estado');
        console.log('   /join    - Suscribirse');
        console.log();
        console.log('⏹️  Presiona Ctrl+C para detener el bot');
        console.log('===============================================');
        
    } catch (error) {
        logError('Error fatal iniciando Bot-PNPtv-Live:', error);
        console.error('Stack trace:', error.stack);
        
        console.log();
        console.log('🔧 Posibles soluciones:');
        console.log('1. Verifica que todos los archivos estén en ./bot/');
        console.log('2. Revisa las variables en el archivo .env');
        console.log('3. Asegúrate de que las dependencias estén instaladas (npm install)');
        console.log('4. Verifica que el puerto no esté en uso');
        
        process.exit(1);
    }
}

// Manejar inicio del bot
if (require.main === module) {
    // Solo ejecutar si este archivo es el principal
    startBot();
} else {
    // Si es importado por otro módulo
    module.exports = { startBot };
}