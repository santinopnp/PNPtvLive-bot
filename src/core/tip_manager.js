// tipManager.js - Gestión de tips y pagos
class TipManager {
    constructor(performerManager) {
        this.performerManager = performerManager;
        this.globalTips = [];
        this.paymentMethods = {
            bold: {
                name: 'Bold.co',
                enabled: true
            },
            mercadopago: {
                name: 'Mercado Pago',
                enabled: true
            },
            paypal: {
                name: 'PayPal',
                enabled: true,
                processingFee: 0.029, // 2.9%
                fixedFee: 30 // $0.30 COP
            },
            stripe: {
                name: 'Stripe',
                enabled: true
            }
        };
        
        console.log('✅ TipManager inicializado');
    }
    
    // Crear nuevo tip
    createTip(data) {
        const { amount, message, userEmail, performerId } = data;
        
        // Validaciones
        if (!amount || amount <= 0) {
            throw new Error('Monto inválido');
        }
        
        const performer = this.performerManager.getPerformer(performerId);
        if (!performer) {
            throw new Error('Performer no encontrado');
        }
        
        if (amount < performer.settings.tipMinAmount) {
            throw new Error(`Monto mínimo: $${performer.settings.tipMinAmount.toLocaleString('es-CO')} ${performer.settings.currency}`);
        }
        
        if (!userEmail || !this.isValidEmail(userEmail)) {
            throw new Error('Email de usuario inválido');
        }
        
        // Crear objeto tip
        const tip = {
            id: this.generateTipId(),
            amount: parseInt(amount),
            message: message || 'Sin mensaje',
            user: userEmail.trim().toLowerCase(),
            performer: performerId,
            performerName: performer.name,
            paypalEmail: performer.paypalEmail,
            timestamp: new Date(),
            processed: false,
            processedAt: null,
            paymentMethod: 'paypal',
            currency: performer.settings.currency,
            fees: this.calculateFees(amount),
            status: 'pending'
        };
        
        // Agregar a listas
        this.globalTips.push(tip);
        this.performerManager.addTipToPerformer(performerId, tip);
        
        console.log(`💰 Nuevo tip creado: $${amount} para ${performer.name} de ${userEmail}`);
        return tip;
    }
    
    // Generar ID único para tip
    generateTipId() {
        return `tip_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    
    // Calcular fees de procesamiento
    calculateFees(amount) {
        const paypalFee = this.paymentMethods.paypal;
        const percentageFee = amount * paypalFee.processingFee;
        const totalFee = percentageFee + paypalFee.fixedFee;
        
        return {
            gross: amount,
            fees: Math.round(totalFee),
            net: amount - Math.round(totalFee),
            feePercentage: paypalFee.processingFee * 100
        };
    }
    
    // Crear URL de pago PayPal
    createPayPalPaymentUrl(tip) {
        const baseUrl = process.env.RAILWAY_STATIC_URL || 'https://your-domain.railway.app';
        return `${baseUrl}/paypal-payment?tip=${tip.id}`;
    }
    
    // Crear link directo de PayPal.me
    createPayPalMeUrl(tip) {
        const paypalUsername = tip.paypalEmail.split('@')[0];
        const amount = tip.amount;
        const currency = tip.currency === 'COP' ? 'USD' : tip.currency; // PayPal.me no soporta COP directamente
        
        // Convertir COP a USD aproximadamente (esto debería ser dinámico)
        const convertedAmount = tip.currency === 'COP' ? Math.round(amount / 4000) : amount;
        
        return `https://paypal.me/${paypalUsername}/${convertedAmount}${currency}`;
    }
    
    // Procesar tip exitoso
    processTipSuccess(tipId, transactionData = {}) {
        const tip = this.findTip(tipId);
        
        if (!tip) {
            throw new Error('Tip no encontrado');
        }
        
        if (tip.processed) {
            throw new Error('Tip ya procesado');
        }
        
        // Actualizar tip
        tip.processed = true;
        tip.processedAt = new Date();
        tip.status = 'completed';
        tip.transactionId = transactionData.transactionId || null;
        
        // Actualizar estadísticas del performer
        const performer = this.performerManager.getPerformer(tip.performer);
        if (performer) {
            this.performerManager.addTipToPerformer(tip.performer, tip);
        }
        
        console.log(`✅ Tip procesado exitosamente: ${tipId}`);
        return tip;
    }
    
    // Marcar tip como fallido
    processTipFailure(tipId, reason = 'Pago fallido') {
        const tip = this.findTip(tipId);
        
        if (!tip) {
            throw new Error('Tip no encontrado');
        }
        
        tip.status = 'failed';
        tip.failureReason = reason;
        tip.failedAt = new Date();
        
        console.log(`❌ Tip fallido: ${tipId} - ${reason}`);
        return tip;
    }
    
    // Encontrar tip por ID
    findTip(tipId) {
        return this.globalTips.find(tip => tip.id === tipId);
    }
    
    // Obtener tips del performer activo
    getActivePerformerTips(limit = 20) {
        const activePerformer = this.performerManager.getActivePerformer();
        
        if (!activePerformer) {
            return [];
        }
        
        return activePerformer.tips.slice(-limit).reverse();
    }
    
    // Obtener tips por performer
    getPerformerTips(performerId, limit = 50) {
        const performer = this.performerManager.getPerformer(performerId);
        
        if (!performer) {
            throw new Error('Performer no encontrado');
        }
        
        return performer.tips.slice(-limit).reverse();
    }
    
    // Obtener tips por estado
    getTipsByStatus(status, limit = 100) {
        return this.globalTips
            .filter(tip => tip.status === status)
            .slice(-limit)
            .reverse();
    }
    
    // Obtener estadísticas de tips
    getTipStats(performerId = null) {
        let tips;
        
        if (performerId) {
            const performer = this.performerManager.getPerformer(performerId);
            tips = performer ? performer.tips : [];
        } else {
            tips = this.globalTips;
        }
        
        const processedTips = tips.filter(tip => tip.processed);
        const todayTips = this.getTipsFromDate(tips, new Date());
        const monthlyTips = this.getTipsFromDate(tips, new Date(new Date().setDate(1)));
        
        return {
            total: {
                count: tips.length,
                amount: tips.reduce((sum, tip) => sum + (tip.processed ? tip.amount : 0), 0)
            },
            today: {
                count: todayTips.length,
                amount: todayTips.reduce((sum, tip) => sum + (tip.processed ? tip.amount : 0), 0)
            },
            monthly: {
                count: monthlyTips.length,
                amount: monthlyTips.reduce((sum, tip) => sum + (tip.processed ? tip.amount : 0), 0)
            },
            average: processedTips.length > 0 
                ? Math.round(processedTips.reduce((sum, tip) => sum + tip.amount, 0) / processedTips.length)
                : 0,
            pending: tips.filter(tip => tip.status === 'pending').length,
            failed: tips.filter(tip => tip.status === 'failed').length
        };
    }
    
    // Obtener tips desde una fecha
    getTipsFromDate(tips, date) {
        const startDate = new Date(date);
        startDate.setHours(0, 0, 0, 0);
        
        return tips.filter(tip => new Date(tip.timestamp) >= startDate);
    }
    
    // Obtener total de tips globales
    getTotalTips() {
        return this.globalTips
            .filter(tip => tip.processed)
            .reduce((sum, tip) => sum + tip.amount, 0);
    }
    
    // Obtener tips recientes globales
    getRecentTips(limit = 10) {
        return this.globalTips
            .slice(-limit)
            .reverse()
            .map(tip => ({
                id: tip.id,
                amount: tip.amount,
                message: tip.message,
                user: tip.user,
                performerName: tip.performerName,
                timestamp: tip.timestamp,
                processed: tip.processed,
                status: tip.status
            }));
    }
    
    // Buscar tips
    searchTips(query, performerId = null) {
        let tips = performerId 
            ? this.getPerformerTips(performerId, 1000)
            : this.globalTips;
        
        const searchTerm = query.toLowerCase();
        
        return tips.filter(tip => 
            tip.message.toLowerCase().includes(searchTerm) ||
            tip.user.toLowerCase().includes(searchTerm) ||
            tip.performerName.toLowerCase().includes(searchTerm) ||
            tip.id.toLowerCase().includes(searchTerm)
        );
    }
    
    // Generar reporte de tips
    generateTipReport(performerId = null, dateRange = null) {
        let tips = performerId 
            ? this.getPerformerTips(performerId, 10000)
            : this.globalTips;
        
        // Filtrar por rango de fechas si se proporciona
        if (dateRange && dateRange.start && dateRange.end) {
            const startDate = new Date(dateRange.start);
            const endDate = new Date(dateRange.end);
            
            tips = tips.filter(tip => {
                const tipDate = new Date(tip.timestamp);
                return tipDate >= startDate && tipDate <= endDate;
            });
        }
        
        const stats = this.getTipStats(performerId);
        const topTippers = this.getTopTippers(tips);
        const dailyBreakdown = this.getDailyBreakdown(tips);
        
        return {
            summary: stats,
            topTippers,
            dailyBreakdown,
            totalTips: tips.length,
            generatedAt: new Date()
        };
    }
    
    // Obtener mejores tippers
    getTopTippers(tips, limit = 10) {
        const tipperStats = {};
        
        tips.filter(tip => tip.processed).forEach(tip => {
            if (!tipperStats[tip.user]) {
                tipperStats[tip.user] = {
                    user: tip.user,
                    totalAmount: 0,
                    tipCount: 0,
                    averageTip: 0
                };
            }
            
            tipperStats[tip.user].totalAmount += tip.amount;
            tipperStats[tip.user].tipCount++;
        });
        
        // Calcular promedio y ordenar
        const tippers = Object.values(tipperStats)
            .map(tipper => ({
                ...tipper,
                averageTip: Math.round(tipper.totalAmount / tipper.tipCount)
            }))
            .sort((a, b) => b.totalAmount - a.totalAmount)
            .slice(0, limit);
        
        return tippers;
    }
    
    // Obtener breakdown diario
    getDailyBreakdown(tips) {
        const dailyStats = {};
        
        tips.filter(tip => tip.processed).forEach(tip => {
            const date = new Date(tip.timestamp).toDateString();
            
            if (!dailyStats[date]) {
                dailyStats[date] = {
                    date,
                    count: 0,
                    amount: 0
                };
            }
            
            dailyStats[date].count++;
            dailyStats[date].amount += tip.amount;
        });
        
        return Object.values(dailyStats).sort((a, b) => new Date(a.date) - new Date(b.date));
    }
    
    // Validar email
    isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }
    
    // Limpiar tips antiguos (opcional, para mantenimiento)
    cleanupOldTips(daysOld = 90) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysOld);
        
        const initialCount = this.globalTips.length;
        this.globalTips = this.globalTips.filter(tip => new Date(tip.timestamp) > cutoffDate);
        
        const removed = initialCount - this.globalTips.length;
        console.log(`🧹 Tips limpiados: ${removed} tips eliminados (más de ${daysOld} días)`);
        
        return removed;
    }
    
    // Exportar tips (para backup)
    exportTips(performerId = null) {
        const tips = performerId 
            ? this.getPerformerTips(performerId, 10000)
            : this.globalTips;
        
        return {
            tips,
            exportedAt: new Date(),
            performerId,
            totalTips: tips.length
        };
    }
}

module.exports = TipManager;