// performerManager.js - Gestión de performers del bot
class PerformerManager {
    constructor() {
        this.performers = new Map();
        this.activePerformer = null;
        console.log('✅ PerformerManager inicializado');
    }
    
    // Crear performer por defecto
    createDefaultPerformer() {
        const defaultPerformer = {
            id: 'default',
            name: 'Demo Performer',
            email: 'demo@example.com',
            paypalEmail: 'performer@paypal.com',
            isActive: true,
            createdAt: new Date(),
            settings: {
                tipMinAmount: 1000,
                currency: 'COP',
                welcomeMessage: '¡Bienvenido a mi show!',
                tipMessage: '¡Gracias por el tip!',
                offlineMessage: 'No estoy en vivo ahora',
                language: 'es'
            },
            stats: {
                totalTips: 0,
                todayTips: 0,
                subscriberCount: 0,
                showCount: 0,
                totalEarnings: 0,
                averageTip: 0
            },
            tips: [],
            subscribers: new Set()
        };
        
        this.performers.set('default', defaultPerformer);
        this.activePerformer = defaultPerformer;
        
        console.log('✅ Performer por defecto creado');
        return defaultPerformer;
    }
    
    // Crear nuevo performer
    createPerformer(data) {
        const { name, email, paypalEmail } = data;
        
        if (!name || !email || !paypalEmail) {
            throw new Error('Datos incompletos para crear performer');
        }
        
        // Verificar que el email no esté en uso
        for (const performer of this.performers.values()) {
            if (performer.email === email) {
                throw new Error('El email ya está en uso');
            }
        }
        
        const id = Date.now().toString();
        const newPerformer = {
            id,
            name: name.trim(),
            email: email.trim().toLowerCase(),
            paypalEmail: paypalEmail.trim().toLowerCase(),
            isActive: false,
            createdAt: new Date(),
            settings: {
                tipMinAmount: 1000,
                currency: 'COP',
                welcomeMessage: `¡Bienvenido al show de ${name}!`,
                tipMessage: '¡Gracias por el tip!',
                offlineMessage: 'No estoy en vivo ahora',
                language: 'es'
            },
            stats: {
                totalTips: 0,
                todayTips: 0,
                subscriberCount: 0,
                showCount: 0,
                totalEarnings: 0,
                averageTip: 0
            },
            tips: [],
            subscribers: new Set()
        };
        
        this.performers.set(id, newPerformer);
        
        console.log(`👤 Nuevo performer creado: ${name} (${id})`);
        return newPerformer;
    }
    
    // Obtener performer por ID
    getPerformer(id) {
        return this.performers.get(id);
    }
    
    // Obtener performer activo
    getActivePerformer() {
        return this.activePerformer;
    }
    
    // Cambiar performer activo
    switchActivePerformer(performerId) {
        const newPerformer = this.performers.get(performerId);
        
        if (!newPerformer) {
            throw new Error('Performer no encontrado');
        }
        
        // Desactivar performer anterior
        if (this.activePerformer) {
            this.activePerformer.isActive = false;
        }
        
        // Activar nuevo performer
        this.activePerformer = newPerformer;
        newPerformer.isActive = true;
        
        console.log(`🔄 Performer activo cambiado a: ${newPerformer.name}`);
        return newPerformer;
    }
    
    // Obtener lista de todos los performers
    getAllPerformers() {
        return Array.from(this.performers.values()).map(p => ({
            id: p.id,
            name: p.name,
            email: p.email,
            paypalEmail: p.paypalEmail,
            isActive: p.isActive,
            createdAt: p.createdAt,
            stats: p.stats
        }));
    }
    
    // Obtener cantidad de performers
    getPerformersCount() {
        return this.performers.size;
    }
    
    // Actualizar configuraciones del performer
    updatePerformerSettings(performerId, settings) {
        const performer = this.performers.get(performerId);
        
        if (!performer) {
            throw new Error('Performer no encontrado');
        }
        
        // Actualizar solo campos válidos
        const validFields = ['tipMinAmount', 'currency', 'welcomeMessage', 'tipMessage', 'offlineMessage', 'language'];
        
        for (const field of validFields) {
            if (settings[field] !== undefined) {
                performer.settings[field] = settings[field];
            }
        }
        
        console.log(`⚙️ Configuraciones actualizadas para ${performer.name}`);
        return performer.settings;
    }
    
    // Actualizar PayPal del performer
    updatePerformerPayPal(performerId, paypalEmail) {
        const performer = this.performers.get(performerId);
        
        if (!performer) {
            throw new Error('Performer no encontrado');
        }
        
        if (!paypalEmail || !this.isValidEmail(paypalEmail)) {
            throw new Error('Email de PayPal inválido');
        }
        
        performer.paypalEmail = paypalEmail.trim().toLowerCase();
        
        console.log(`💳 PayPal actualizado para ${performer.name}: ${paypalEmail}`);
        return performer.paypalEmail;
    }
    
    // Agregar suscriptor al performer activo
    addSubscriber(userEmail) {
        if (!this.activePerformer) {
            throw new Error('No hay performer activo');
        }
        
        this.activePerformer.subscribers.add(userEmail);
        this.activePerformer.stats.subscriberCount = this.activePerformer.subscribers.size;
        
        console.log(`👤 Nuevo suscriptor para ${this.activePerformer.name}: ${userEmail}`);
        return this.activePerformer.subscribers.size;
    }
    
    // Remover suscriptor del performer activo
    removeSubscriber(userEmail) {
        if (!this.activePerformer) {
            throw new Error('No hay performer activo');
        }
        
        this.activePerformer.subscribers.delete(userEmail);
        this.activePerformer.stats.subscriberCount = this.activePerformer.subscribers.size;
        
        console.log(`👋 Suscriptor removido de ${this.activePerformer.name}: ${userEmail}`);
        return this.activePerformer.subscribers.size;
    }
    
    // Agregar tip al performer
    addTipToPerformer(performerId, tip) {
        const performer = this.performers.get(performerId);
        
        if (!performer) {
            throw new Error('Performer no encontrado');
        }
        
        performer.tips.push(tip);
        
        // Actualizar estadísticas
        if (tip.processed) {
            performer.stats.totalTips += tip.amount;
            performer.stats.totalEarnings += tip.amount;
            
            // Calcular tip promedio
            const processedTips = performer.tips.filter(t => t.processed);
            performer.stats.averageTip = processedTips.length > 0 
                ? Math.round(performer.stats.totalTips / processedTips.length)
                : 0;
            
            // Tips de hoy
            const today = new Date().toDateString();
            performer.stats.todayTips = performer.tips
                .filter(t => t.processed && new Date(t.timestamp).toDateString() === today)
                .reduce((sum, t) => sum + t.amount, 0);
        }
        
        console.log(`💰 Tip agregado a ${performer.name}: $${tip.amount}`);
        return tip;
    }
    
    // Obtener estadísticas del performer
    getPerformerStats(performerId) {
        const performer = this.performers.get(performerId);
        
        if (!performer) {
            throw new Error('Performer no encontrado');
        }
        
        return {
            ...performer.stats,
            recentTips: performer.tips.slice(-10).reverse(),
            totalSubscribers: performer.subscribers.size
        };
    }
    
    // Eliminar performer
    deletePerformer(performerId) {
        const performer = this.performers.get(performerId);
        
        if (!performer) {
            throw new Error('Performer no encontrado');
        }
        
        if (performer.isActive) {
            throw new Error('No se puede eliminar el performer activo');
        }
        
        this.performers.delete(performerId);
        
        console.log(`🗑️ Performer eliminado: ${performer.name}`);
        return true;
    }
    
    // Buscar performers
    searchPerformers(query) {
        const results = [];
        const searchTerm = query.toLowerCase();
        
        for (const performer of this.performers.values()) {
            if (performer.name.toLowerCase().includes(searchTerm) ||
                performer.email.toLowerCase().includes(searchTerm)) {
                results.push({
                    id: performer.id,
                    name: performer.name,
                    email: performer.email,
                    isActive: performer.isActive
                });
            }
        }
        
        return results;
    }
    
    // Obtener performer con más tips
    getTopPerformer() {
        let topPerformer = null;
        let maxTips = 0;
        
        for (const performer of this.performers.values()) {
            if (performer.stats.totalTips > maxTips) {
                maxTips = performer.stats.totalTips;
                topPerformer = performer;
            }
        }
        
        return topPerformer;
    }
    
    // Métodos de utilidad
    isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }
    
    // Exportar datos del performer (para backup)
    exportPerformerData(performerId) {
        const performer = this.performers.get(performerId);
        
        if (!performer) {
            throw new Error('Performer no encontrado');
        }
        
        return {
            ...performer,
            subscribers: Array.from(performer.subscribers),
            exportedAt: new Date()
        };
    }
    
    // Importar datos del performer (para restore)
    importPerformerData(data) {
        const performer = {
            ...data,
            subscribers: new Set(data.subscribers || []),
            importedAt: new Date()
        };
        
        this.performers.set(performer.id, performer);
        
        console.log(`📥 Performer importado: ${performer.name}`);
        return performer;
    }
}

module.exports = PerformerManager;