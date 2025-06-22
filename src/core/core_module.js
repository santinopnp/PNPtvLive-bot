// core.js - Modulo principal del Multi-Performer Bot
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const PerformerManager = require('./performer_manager');
const TipManager = require('./tip_manager');
const WebhookHandler = require('../webhooks/webhook_handler');
const Routes = require('../routes/routes_module');
const Utils = require('../utils/utils_module');

class MultiPerformerBotCore {
    constructor() {
        this.app = express();
        this.port = process.env.PORT || 3000;
        this.botToken = process.env.WEBEX_BOT_TOKEN;
        this.botEmail = process.env.WEBEX_BOT_EMAIL;
        this.masterPassword = process.env.MASTER_PASSWORD || 'admin123';
        
        // Estado global del bot
        this.state = {
            isLive: false,
            lastConnection: null,
            subscribers: new Set(),
            startTime: new Date()
        };
        
        // Inicializar mÃ³dulos
        this.performerManager = new PerformerManager();
        this.tipManager = new TipManager(this.performerManager);
        this.webhookHandler = new WebhookHandler(this.botToken, this.botEmail, this);
        this.routes = new Routes(this);
        this.utils = new Utils();
        
        console.log('âœ… Core del bot inicializado');
        this.init();
    }
    
    init() {
        this.setupMiddleware();
        this.setupRoutes();
        this.loadDefaultData();
    }
    
    setupMiddleware() {
        this.app.use(express.json());
        this.app.use(cors());
        this.app.use(express.static('public'));
        
        // Logging middleware
        this.app.use((req, res, next) => {
            console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
            next();
        });
        
        console.log('âœ… Middleware configurado');
    }
    
    setupRoutes() {
        // Health check
        this.app.get('/', (req, res) => {
            const activePerformer = this.performerManager.getActivePerformer();
            res.json({
                service: 'Multi-Performer Webex Bot',
                status: 'running',
                version: '2.0.0',
                activePerformer: activePerformer?.name || 'None',
                totalPerformers: this.performerManager.getPerformersCount(),
                uptime: this.utils.getUptime(this.state.startTime),
                timestamp: new Date().toISOString()
            });
        });
        
        // Configurar todas las rutas
        this.routes.setupRoutes(this.app);
        
        console.log('âœ… Rutas configuradas');
    }
    
    loadDefaultData() {
        // Cargar performer por defecto si no existe ninguno
        if (this.performerManager.getPerformersCount() === 0) {
            this.performerManager.createDefaultPerformer();
        }
        
        console.log('âœ… Datos por defecto cargados');
    }
    
    // MÃ©todos principales del bot
    toggleLive() {
        this.state.isLive = !this.state.isLive;
        
        if (this.state.isLive) {
            this.state.lastConnection = new Date();
            const activePerformer = this.performerManager.getActivePerformer();
            if (activePerformer) {
                activePerformer.stats.showCount++;
                this.notifySubscribers(`ðŸ”´ Â¡${activePerformer.name} estÃ¡ EN VIVO! Â¡Ãšnete ahora!`);
            }
        }
        
        return this.state.isLive;
    }
    
    async notifySubscribers(message) {
        const activePerformer = this.performerManager.getActivePerformer();
        if (!activePerformer) return;
        
        console.log(`ðŸ“¢ Notificando a ${activePerformer.subscribers.size} suscriptores`);
        for (const email of activePerformer.subscribers) {
            await this.utils.sendDirectMessage(email, message, this.botToken);
        }
    }
    
    getStatus() {
        const activePerformer = this.performerManager.getActivePerformer();
        
        return {
            bot: {
                isLive: this.state.isLive,
                lastConnection: this.state.lastConnection,
                uptime: this.utils.getUptime(this.state.startTime)
            },
            performer: activePerformer ? {
                id: activePerformer.id,
                name: activePerformer.name,
                email: activePerformer.email,
                paypalEmail: activePerformer.paypalEmail,
                stats: activePerformer.stats,
                settings: activePerformer.settings
            } : null,
            system: {
                totalPerformers: this.performerManager.getPerformersCount(),
                totalTips: this.tipManager.getTotalTips(),
                version: '2.0.0'
            }
        };
    }
    
    // MÃ©todos de autenticaciÃ³n
    validateMasterPassword(password) {
        return password === this.masterPassword;
    }
    
    validatePerformerPassword(performerId, password) {
        // En un sistema real, verificarÃ­as contra base de datos
        // Por ahora, cualquier password es vÃ¡lida para demo
        return password && password.length >= 4;
    }
    
    start() {
        this.app.listen(this.port, () => {
            console.log('ðŸŽ‰ ===================================');
            console.log('ðŸŽ­ Multi-Performer Webex Bot INICIADO');
            console.log(`ðŸŒ Puerto: ${this.port}`);
            console.log(`ðŸ‘¤ Performer Dashboard: /performer`);
            console.log(`ðŸ”§ Admin Panel: /admin`);
            console.log(`ðŸŽª Performers registrados: ${this.performerManager.getPerformersCount()}`);
            
            const activePerformer = this.performerManager.getActivePerformer();
            console.log(`ðŸŸ¢ Performer activo: ${activePerformer?.name || 'Ninguno'}`);
            console.log('ðŸŽ‰ ===================================');
            
            if (!this.botToken) {
                console.warn('âš ï¸  ADVERTENCIA: WEBEX_BOT_TOKEN no configurado');
            }
        });
    }
}

module.exports = MultiPerformerBotCore;
