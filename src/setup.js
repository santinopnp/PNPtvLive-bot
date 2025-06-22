const axios = require('axios');
require('dotenv').config();

const WEBEX_ACCESS_TOKEN = process.env.WEBEX_ACCESS_TOKEN;
const WEBHOOK_URL = process.env.WEBHOOK_URL || 'http://localhost:3000';
const WEBEX_API_BASE = 'https://webexapis.com/v1';

const getHeaders = () => ({
  'Authorization': `Bearer ${WEBEX_ACCESS_TOKEN}`,
  'Content-Type': 'application/json'
});

async function setupWebhooks() {
  console.log('🔧 Configurando webhooks de Webex...\n');
  
  if (!WEBEX_ACCESS_TOKEN || WEBEX_ACCESS_TOKEN === 'TU_ACCESS_TOKEN_AQUI') {
    console.error('❌ Error: WEBEX_ACCESS_TOKEN no configurado en .env');
    console.log('📋 Pasos para obtener tu token:');
    console.log('1. Ve a https://developer.webex.com/');
    console.log('2. Crea una nueva aplicación tipo "Bot"');
    console.log('3. Copia el Bot Access Token');
    console.log('4. Agrégalo a tu archivo .env');
    return;
  }
  
  try {
    // Verificar token
    console.log('🔍 Verificando token de acceso...');
    const botInfo = await axios.get(`${WEBEX_API_BASE}/people/me`, {
      headers: getHeaders()
    });
    console.log('✅ Token válido - Bot:', botInfo.data.displayName);
    console.log('📧 Email del bot:', botInfo.data.emails[0]);
    console.log('🆔 ID del bot:', botInfo.data.id);
    console.log('');
    
    // Listar webhooks existentes
    console.log('📋 Verificando webhooks existentes...');
    const existingWebhooks = await axios.get(`${WEBEX_API_BASE}/webhooks`, {
      headers: getHeaders()
    });
    
    console.log(`📊 Webhooks encontrados: ${existingWebhooks.data.items.length}`);
    
    // Limpiar webhooks existentes del bot (opcional)
    const botWebhooks = existingWebhooks.data.items.filter(webhook => 
      webhook.targetUrl.includes(WEBHOOK_URL)
    );
    
    if (botWebhooks.length > 0) {
      console.log('🧹 Limpiando webhooks existentes...');
      for (const webhook of botWebhooks) {
        await axios.delete(`${WEBEX_API_BASE}/webhooks/${webhook.id}`, {
          headers: getHeaders()
        });
        console.log(`🗑️ Webhook eliminado: ${webhook.name}`);
      }
    }
    
    // Crear nuevos webhooks
    const webhooksToCreate = [
      {
        name: 'Bot Meeting Events',
        targetUrl: `${WEBHOOK_URL}/webhooks/webex`,
        resource: 'meetings',
        event: 'all'
      },
      {
        name: 'Bot Room Membership Events',
        targetUrl: `${WEBHOOK_URL}/webhooks/webex`,
        resource: 'memberships',
        event: 'all'
      },
      {
        name: 'Bot Message Events',
        targetUrl: `${WEBHOOK_URL}/webhooks/webex`,
        resource: 'messages',
        event: 'created'
      }
    ];
    
    console.log('🆕 Creando nuevos webhooks...');
    
    for (const webhookConfig of webhooksToCreate) {
      try {
        const response = await axios.post(`${WEBEX_API_BASE}/webhooks`, webhookConfig, {
          headers: getHeaders()
        });
        console.log(`✅ Webhook creado: ${webhookConfig.name}`);
        console.log(`   📍 URL: ${webhookConfig.targetUrl}`);
        console.log(`   📋 Recurso: ${webhookConfig.resource} - ${webhookConfig.event}`);
        console.log('');
      } catch (error) {
        console.error(`❌ Error creando webhook ${webhookConfig.name}:`, error.response?.data || error.message);
      }
    }
    
    // Mostrar instrucciones finales
    console.log('🎉 Configuración completada!\n');
    console.log('📋 Pasos siguientes:');
    console.log('1. Inicia tu bot: npm start');
    console.log('2. Agrega el bot a tu sala personal de Webex');
    console.log('3. Inicia una reunión en tu sala personal');
    console.log('4. El bot detectará automáticamente los eventos');
    console.log('');
    console.log('🔧 Panel de control: http://localhost:3000');
    console.log('');
    console.log('💡 Notas importantes:');
    console.log('- Los webhooks solo funcionan con URLs públicas');
    console.log('- Para desarrollo local, usa ngrok para exponer tu puerto');
    console.log('- El bot debe estar agregado a la sala para recibir eventos');
    
  } catch (error) {
    console.error('❌ Error durante la configuración:', error.response?.data || error.message);
    
    if (error.response?.status === 401) {
      console.log('\n🔑 Error de autenticación:');
      console.log('- Verifica que tu WEBEX_ACCESS_TOKEN sea correcto');
      console.log('- Asegúrate de que el token no haya expirado');
    }
  }
}

// Función para configurar ngrok si está disponible
async function checkNgrok() {
  try {
    const { exec } = require('child_process');
    
    return new Promise((resolve) => {
      exec('ngrok version', (error) => {
        if (error) {
          console.log('ℹ️ ngrok no está instalado');
          console.log('💡 Para webhooks en desarrollo local:');
          console.log('1. Instala ngrok: https://ngrok.com/download');
          console.log('2. Ejecuta: ngrok http 3000');
          console.log('3. Usa la URL HTTPS generada en WEBHOOK_URL');
          resolve(false);
        } else {
          console.log('✅ ngrok detectado');
          resolve(true);
        }
      });
    });
  } catch (error) {
    return false;
  }
}

async function main() {
  console.log('🚀 Webex Bot Setup - Configurador Automático\n');
  
  await checkNgrok();
  console.log('');
  
  await setupWebhooks();
}

if (require.main === module) {
  main();
}

module.exports = { setupWebhooks };