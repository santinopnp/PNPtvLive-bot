// webhook.js - Manejo de webhooks de Webex
const axios = require('axios');

class WebhookHandler {
    constructor(botToken, botEmail, core) {
        this.botToken = botToken;
        this.botEmail = botEmail;
        this.core = core;
        this.lastProcessedMessage = '';
        this.messageProcessingDelay = 1000; // 1 segundo de delay mínimo
        
        console.log('✅ WebhookHandler inicializado');
    }
    
    // Manejar webhook principal
    async handleWebhook(req, res) {
        try {
            console.log('📩 Webhook recibido');
            
            // Filtrar webhooks que no son de mensajes válidos
            if (!this.isValidWebhook(req.body)) {
                console.log('🔄 Webhook ignorado (no es mensaje válido)');
                return res.status(200).send('OK');
            }
            
            const { data } = req.body;
            
            // Filtrar mensajes del bot mismo
            if (this.isBotMessage(data.personEmail)) {
                console.log(`🔄 Webhook ignorado (mensaje del bot): ${data.personEmail}`);
                return res.status(200).send('OK');
            }
            
            // Evitar procesar el mismo mensaje múltiples veces
            if (this.lastProcessedMessage === data.id) {
                console.log('🔄 Mensaje ya procesado, ignorando');
                return res.status(200).send('OK');
            }
            
            // Verificar que el mensaje no sea muy antiguo
            if (this.isOldMessage(data.created)) {
                console.log(`🔄 Mensaje muy antiguo, ignorando`);
                return res.status(200).send('OK');
            }
            
            console.log(`👤 Mensaje de: ${data.personEmail}`);
            console.log(`🆔 Message ID: ${data.id}`);
            
            // Obtener detalles del mensaje
            const message = await this.getMessageDetails(data.id);
            if (!message) {
                console.log('❌ No se pudo obtener el mensaje');
                return res.status(200).send('OK');
            }
            
            // Verificar nuevamente que el mensaje no sea del bot
            if (this.isBotMessage(message.personEmail)) {
                console.log(`🔄 Mensaje del bot detectado en contenido: ${message.personEmail}`);
                return res.status(200).send('OK');
            }
            
            // Marcar mensaje como procesado
            this.lastProcessedMessage = data.id;
            
            // Procesar comando
            await this.processCommand(message, data.roomId, data.personEmail);
            
            res.status(200).send('OK');
            
        } catch (error) {
            console.error('❌ Error en webhook:', error);
            res.status(500).send('Error');
        }
    }
    
    // Validar si el webhook es válido
    isValidWebhook(body) {
        // Filtrar webhooks de Railway u otros servicios
        if (body.type === 'DEPLOY' || !body.data || !body.data.personEmail) {
            return false;
        }
        
        return true;
    }
    
    // Verificar si el mensaje es del bot
    isBotMessage(personEmail) {
        if (!personEmail) return true;
        
        return personEmail === this.botEmail ||
               personEmail.includes('@webex.bot') ||
               personEmail.includes('bot@') ||
               personEmail.includes('@sparkbot.io');
    }
    
    // Verificar si el mensaje es muy antiguo
    isOldMessage(createdTimestamp, maxAgeMinutes = 5) {
        if (!createdTimestamp) return false;
        
        const messageTime = new Date(createdTimestamp);
        const now = new Date();
        const timeDiffMinutes = (now - messageTime) / (1000 * 60);
        
        return timeDiffMinutes > maxAgeMinutes;
    }
    
    // Obtener detalles del mensaje de Webex
    async getMessageDetails(messageId) {
        try {
            if (!this.botToken) {
                console.error('❌ Bot token no configurado');
                return null;
            }
            
            console.log(`🔍 Obteniendo mensaje ID: ${messageId.substring(0, 20)}...`);
            
            const response = await axios.get(`https://webexapis.com/v1/messages/${messageId}`, {
                headers: { 'Authorization': `Bearer ${this.botToken}` }
            });
            
            console.log(`✅ Mensaje obtenido: "${response.data.text?.substring(0, 50)}..."`);
            console.log(`👤 De: ${response.data.personEmail}`);
            
            return response.data;
            
        } catch (error) {
            console.error('❌ Error obteniendo mensaje:', error.response?.data || error.message);
            console.error('❌ Status:', error.response?.status);
            
            return null;
        }
    }
    
    // Procesar comando del mensaje
    async processCommand(message, roomId, userEmail) {
        try {
            const activePerformer = this.core.performerManager.getActivePerformer();
            
            if (!activePerformer) {
                await this.sendMessage(roomId, '❌ No hay performer activo configurado. Contacta al administrador.');
                return;
            }
            
            // Limpiar texto del mensaje
            const text = message.text.toLowerCase().trim();
            const cleanText = text.replace(/@[^\s]+/g, '').trim();
            
            console.log(`🤖 Comando: "${cleanText}" de ${userEmail} para ${activePerformer.name}`);
            
            // Procesar comandos
            switch (cleanText) {
                case '/status':
                    await this.handleStatusCommand(roomId);
                    break;
                    
                case '/join':
                    await this.handleJoinCommand(userEmail, roomId);
                    break;
                    
                case '/leave':
                    await this.handleLeaveCommand(userEmail, roomId);
                    break;
                    
                case '/tip':
                    await this.handleTipInfoCommand(roomId);
                    break;
                    
                case '/performer':
                    await this.handlePerformerInfoCommand(roomId);
                    break;
                    
                case '/help':
                case 'help':
                case 'ayuda':
                    await this.handleHelpCommand(roomId);
                    break;
                    
                default:
                    if (cleanText.startsWith('/tip ')) {
                        await this.handleTipCommand(cleanText, userEmail, roomId);
                    } else if (cleanText.startsWith('/admin ')) {
                        await this.handleAdminCommand(cleanText, userEmail, roomId);
                    } else {
                        // No enviar ayuda automática para evitar spam
                        console.log(`❓ Comando no reconocido: "${cleanText}"`);
                    }
                    break;
            }
            
        } catch (error) {
            console.error('❌ Error procesando comando:', error);
            await this.sendMessage(roomId, '❌ Error procesando comando. Intenta nuevamente.');
        }
    }
    
    // Comando /status
    async handleStatusCommand(roomId) {
        const performer = this.core.performerManager.getActivePerformer();
        const status = this.core.state.isLive ? '🔴 EN VIVO' : '⚫ OFFLINE';
        
        const message = `🎭 **${performer.name}**
${status}

💰 **Tips hoy:** $${performer.stats.todayTips.toLocaleString('es-CO')} ${performer.settings.currency}
💰 **Total tips:** $${performer.stats.totalTips.toLocaleString('es-CO')} ${performer.settings.currency}
👥 **Suscriptores:** ${performer.subscribers.size}
🎪 **Shows realizados:** ${performer.stats.showCount}

💳 **PayPal:** ${performer.paypalEmail}`;
        
        await this.sendMessage(roomId, message);
    }
    
    // Comando /join
    async handleJoinCommand(userEmail, roomId) {
        try {
            const performer = this.core.performerManager.getActivePerformer();
            this.core.performerManager.addSubscriber(userEmail);
            
            const message = `✅ **¡Te suscribiste a ${performer.name}!**
            
${performer.settings.welcomeMessage}

🔔 Recibirás notificaciones cuando ${performer.name} vaya EN VIVO
💰 Puedes enviar tips con \`/tip [cantidad] [mensaje]\`

Usa \`/help\` para ver todos los comandos.`;
            
            await this.sendMessage(roomId, message);
            
        } catch (error) {
            await this.sendMessage(roomId, `❌ Error: ${error.message}`);
        }
    }
    
    // Comando /leave
    async handleLeaveCommand(userEmail, roomId) {
        try {
            const performer = this.core.performerManager.getActivePerformer();
            this.core.performerManager.removeSubscriber(userEmail);
            
            await this.sendMessage(roomId, `❌ Te has desuscrito de ${performer.name}. ¡Esperamos verte pronto!`);
            
        } catch (error) {
            await this.sendMessage(roomId, `❌ Error: ${error.message}`);
        }
    }
    
    // Comando /tip (info)
    async handleTipInfoCommand(roomId) {
        const performer = this.core.performerManager.getActivePerformer();
        
        const message = `💰 **Tips para ${performer.name}**
        
Para enviar un tip, usa:
\`/tip [cantidad] [mensaje]\`

Ejemplo: \`/tip 5000 ¡Increíble show!\`

💳 **Pago con PayPal:**
• Email: ${performer.paypalEmail}
• Proceso rápido y seguro
• Confirmación automática

💵 **Monto mínimo:** $${performer.settings.tipMinAmount.toLocaleString('es-CO')} ${performer.settings.currency}

¡${performer.settings.tipMessage}! 🎉`;
        
        await this.sendMessage(roomId, message);
    }
    
    // Comando /tip [amount] [message]
    async handleTipCommand(command, userEmail, roomId) {
        try {
            const parts = command.split(' ');
            const amount = parseInt(parts[1]);
            const message = parts.slice(2).join(' ') || 'Sin mensaje';
            
            const performer = this.core.performerManager.getActivePerformer();
            
            // Crear tip usando TipManager
            const tip = this.core.tipManager.createTip({
                amount,
                message,
                userEmail,
                performerId: performer.id
            });
            
            // Crear URLs de pago
            const paymentUrl = this.core.tipManager.createPayPalPaymentUrl(tip);
            const paypalMeUrl = this.core.tipManager.createPayPalMeUrl(tip);
            
            const response = `💰 **Tip de $${amount.toLocaleString('es-CO')} ${performer.settings.currency}**
Para: **${performer.name}**

🔗 **Pagar con PayPal:** ${paymentUrl}
🔗 **PayPal.me:** ${paypalMeUrl}

💳 PayPal: ${performer.paypalEmail}
💬 Mensaje: "${message}"
🆔 ID: ${tip.id}`;
            
            await this.sendMessage(roomId, response);
            
            // Enviar mensaje directo
            await this.sendDirectMessage(userEmail, 
                `💰 **Tu tip para ${performer.name}**\n\n` +
                `Cantidad: $${amount.toLocaleString('es-CO')} ${performer.settings.currency}\n` +
                `PayPal: ${performer.paypalEmail}\n\n` +
                `🔗 Link de pago: ${paymentUrl}\n\n` +
                `Mensaje: "${message}"`
            );
            
        } catch (error) {
            await this.sendMessage(roomId, `❌ Error: ${error.message}`);
        }
    }
    
    // Comando /performer
    async handlePerformerInfoCommand(roomId) {
        const performer = this.core.performerManager.getActivePerformer();
        
        const message = `🎭 **Información del Performer**

👤 **Nombre:** ${performer.name}
📧 **Email:** ${performer.email}
💳 **PayPal:** ${performer.paypalEmail}
💰 **Moneda:** ${performer.settings.currency}
💵 **Tip mínimo:** $${performer.settings.tipMinAmount.toLocaleString('es-CO')}

📊 **Estadísticas:**
• Total tips: $${performer.stats.totalTips.toLocaleString('es-CO')}
• Shows: ${performer.stats.showCount}
• Suscriptores: ${performer.stats.subscriberCount}
• Promedio por tip: $${performer.stats.averageTip.toLocaleString('es-CO')}`;
        
        await this.sendMessage(roomId, message);
    }
    
    // Comando /admin
    async handleAdminCommand(command, userEmail, roomId) {
        const parts = command.split(' ');
        const action = parts[1];
        const password = parts[2];
        
        if (!this.core.validateMasterPassword(password)) {
            await this.sendMessage(roomId, '❌ Acceso denegado.');
            return;
        }
        
        switch (action) {
            case 'status':
                await this.sendAdminStatus(roomId);
                break;
            case 'switch':
                const performerId = parts[3];
                await this.handleAdminSwitch(performerId, roomId);
                break;
            case 'list':
                await this.listPerformers(roomId);
                break;
            default:
                await this.sendMessage(roomId, '❌ Comando admin inválido. Usa: /admin [status|switch|list] [password]');
        }
    }
    
    // Comando /help
    async handleHelpCommand(roomId) {
        const performer = this.core.performerManager.getActivePerformer();
        
        const help = `🤖 **Bot de ${performer ? performer.name : 'Performer'}**
        
📺 **Comandos básicos:**
• \`/status\` - Ver estado del stream
• \`/join\` - Suscribirse a notificaciones
• \`/leave\` - Desuscribirse
• \`/performer\` - Info del performer

💰 **Tips:**
• \`/tip\` - Info sobre tips
• \`/tip [cantidad] [mensaje]\` - Enviar tip

❓ **Ayuda:**
• \`/help\` - Ver este mensaje

${performer ? `🎭 **Performer activo:** ${performer.name}` : ''}`;
        
        await this.sendMessage(roomId, help);
    }
    
    // Enviar mensaje a room
    async sendMessage(roomId, text) {
        try {
            if (!this.botToken) {
                console.error('❌ Bot token no configurado para enviar mensaje');
                return;
            }
            
            await axios.post('https://webexapis.com/v1/messages', {
                roomId,
                markdown: text
            }, {
                headers: {
                    'Authorization': `Bearer ${this.botToken}`,
                    'Content-Type': 'application/json'
                }
            });
            
            console.log('✅ Mensaje enviado exitosamente');
            
        } catch (error) {
            console.error('❌ Error enviando mensaje:', error.response?.data || error.message);
        }
    }
    
    // Enviar mensaje directo
    async sendDirectMessage(email, text) {
        try {
            if (!this.botToken) {
                console.error('❌ Bot token no configurado para mensaje directo');
                return;
            }
            
            await axios.post('https://webexapis.com/v1/messages', {
                toPersonEmail: email,
                markdown: text
            }, {
                headers: {
                    'Authorization': `Bearer ${this.botToken}`,
                    'Content-Type': 'application/json'
                }
            });
            
            console.log(`📧 Mensaje directo enviado a ${email}`);
            
        } catch (error) {
            console.error('❌ Error enviando mensaje directo:', error.response?.data || error.message);
        }
    }
    
    // Métodos de admin (helpers)
    async sendAdminStatus(roomId) {
        const activePerformer = this.core.performerManager.getActivePerformer();
        const stats = this.core.tipManager.getTipStats();
        
        const message = `🔧 **Estado del Sistema**

👤 **Performer activo:** ${activePerformer?.name || 'Ninguno'}
🎪 **Total performers:** ${this.core.performerManager.getPerformersCount()}
💰 **Tips globales:** $${stats.total.amount.toLocaleString('es-CO')}
📊 **Tips pendientes:** ${stats.pending}

⏰ **Uptime:** ${this.core.utils.getUptime(this.core.state.startTime)}
🤖 **Estado:** ${this.core.state.isLive ? 'EN VIVO' : 'OFFLINE'}`;
        
        await this.sendMessage(roomId, message);
    }
    
    async handleAdminSwitch(performerId, roomId) {
        try {
            if (!performerId) {
                await this.sendMessage(roomId, '❌ ID de performer requerido');
                return;
            }
            
            const performer = this.core.performerManager.switchActivePerformer(performerId);
            await this.sendMessage(roomId, `✅ Performer activo cambiado a: **${performer.name}**`);
            
        } catch (error) {
            await this.sendMessage(roomId, `❌ Error: ${error.message}`);
        }
    }
    
    async listPerformers(roomId) {
        const performers = this.core.performerManager.getAllPerformers();
        
        let message = '👥 **Performers Registrados:**\n\n';
        
        performers.forEach(p => {
            message += `• **${p.name}** (${p.id})${p.isActive ? ' 🟢 ACTIVO' : ''}\n`;
            message += `  📧 ${p.email}\n`;
            message += `  💰 $${p.stats.totalTips.toLocaleString('es-CO')} | 👥 ${p.stats.subscriberCount}\n\n`;
        });
        
        await this.sendMessage(roomId, message);
    }
}

module.exports = WebhookHandler;