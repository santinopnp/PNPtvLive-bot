// tipManager.js - Gestión de tips y pagos MULTI-PROCESADOR
class TipManager {
    constructor(performerManager) {
        this.performerManager = performerManager;
        this.globalTips = [];
        
        // NUEVO: Múltiples procesadores de pago
        this.paymentMethods = {
            paypal: {
                name: 'PayPal',
                enabled: true,
                processingFee: 0.029, // 2.9%
                fixedFee: 30, // $0.30 COP
                currency: ['USD', 'COP'],
                countries: ['CO', 'US', 'MX', 'AR']
            },
            bold: {
                name: 'Bold.co',
                enabled: true,
                processingFee: 0.0349, // 3.49%
                fixedFee: 0,
                currency: ['COP'],
                countries: ['CO'],
                description: 'Procesador colombiano'
            },
            mercadopago: {
                name: 'MercadoPago',
                enabled: true,
                processingFee: 0.0559, // 5.59%
                fixedFee: 0,
                currency: ['COP', 'ARS', 'MXN', 'BRL'],
                countries: ['CO', 'AR', 'MX', 'BR', 'CL', 'PE', 'UY'],
                description: 'Para toda Latinoamérica'
            },
            stripe: {
                name: 'Stripe',
                enabled: true,
                processingFee: 0.029, // 2.9%
                fixedFee: 30,
                currency: ['USD', 'COP', 'ARS', 'MXN'],
                countries: ['US', 'CO', 'AR', 'MX', 'BR'],
                description: 'Procesador global'
            }
        };
        
        console.log('✅ TipManager Multi-Procesador inicializado');
        console.log(`💳 Procesadores disponibles: ${Object.keys(this.paymentMethods).join(', ')}`);
    }
    
    // NUEVO: Crear tip con múltiples opciones de pago
    createTip(data) {
        const { amount, message, userEmail, performerId, preferredProcessor } = data;
        
        // Validaciones existentes
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
        
        // NUEVO: Determinar procesadores disponibles para el performer
        const availableProcessors = this.getAvailableProcessors(performer);
        
        if (availableProcessors.length === 0) {
            throw new Error('No hay procesadores de pago configurados para este performer');
        }
        
        // Crear objeto tip MEJORADO
        const tip = {
            id: this.generateTipId(),
            amount: parseInt(amount),
            message: message || 'Sin mensaje',
            user: userEmail.trim().toLowerCase(),
            performer: performerId,
            performerName: performer.name,
            timestamp: new Date(),
            processed: false,
            processedAt: null,
            currency: performer.settings.currency,
            status: 'pending',
            
            // NUEVO: Información de procesadores
            availableProcessors,
            preferredProcessor: preferredProcessor || availableProcessors[0],
            paymentUrls: {},
            fees: {},
            
            // NUEVO: Información específica por procesador
            processorData: {}
        };
        
        // NUEVO: Generar URLs y fees para todos los procesadores disponibles
        this.generatePaymentData(tip, performer);
        
        // Agregar a listas
        this.globalTips.push(tip);
        this.performerManager.addTipToPerformer(performerId, tip);
        
        console.log(`💰 Nuevo tip multi-procesador creado: $${amount} para ${performer.name} de ${userEmail}`);
        console.log(`💳 Procesadores disponibles: ${availableProcessors.join(', ')}`);
        
        return tip;
    }
    
    // NUEVO: Obtener procesadores disponibles para un performer
    getAvailableProcessors(performer) {
        const available = [];
        
        Object.entries(this.paymentMethods).forEach(([key, method]) => {
            if (!method.enabled) return;
            
            // Verificar si el performer tiene configuración para este procesador
            const hasConfig = this.hasProcessorConfig(performer, key);
            
            // Verificar si soporta la moneda del performer
            const supportsCurrency = method.currency.includes(performer.settings.currency);
            
            if (hasConfig && supportsCurrency) {
                available.push(key);
            }
        });
        
        return available;
    }
    
    // NUEVO: Verificar si performer tiene configuración para procesador
    hasProcessorConfig(performer, processor) {
        switch (processor) {
            case 'paypal':
                return !!(performer.paypalEmail);
            case 'bold':
                return !!(performer.boldEmail || performer.boldAccountId);
            case 'mercadopago':
                return !!(performer.mercadoPagoEmail || performer.mercadoPagoAccessToken);
            case 'stripe':
                return !!(performer.stripeAccountId || performer.stripeEmail);
            default:
                return false;
        }
    }
    
    // NUEVO: Generar datos de pago para todos los procesadores
    generatePaymentData(tip, performer) {
        tip.availableProcessors.forEach(processor => {
            // Calcular fees específicos del procesador
            tip.fees[processor] = this.calculateFees(tip.amount, processor);
            
            // Generar URL de pago específica
            tip.paymentUrls[processor] = this.createPaymentUrl(tip, performer, processor);
            
            // Datos específicos del procesador
            tip.processorData[processor] = this.getProcessorSpecificData(tip, performer, processor);
        });
    }
    
    // MEJORADO: Calcular fees por procesador
    calculateFees(amount, processor = 'paypal') {
        const method = this.paymentMethods[processor];
        if (!method) return { gross: amount, fees: 0, net: amount };
        
        const percentageFee = amount * method.processingFee;
        const totalFee = percentageFee + method.fixedFee;
        
        return {
            gross: amount,
            fees: Math.round(totalFee),
            net: amount - Math.round(totalFee),
            feePercentage: method.processingFee * 100,
            processor,
            processorName: method.name
        };
    }
    
    // NUEVO: Crear URL de pago por procesador
    createPaymentUrl(tip, performer, processor) {
        const baseUrl = process.env.RAILWAY_STATIC_URL || process.env.BASE_URL || 'https://your-domain.com';
        
        switch (processor) {
            case 'paypal':
                return `${baseUrl}/payment/paypal?tip=${tip.id}`;
            case 'bold':
                return `${baseUrl}/payment/bold?tip=${tip.id}`;
            case 'mercadopago':
                return `${baseUrl}/payment/mercadopago?tip=${tip.id}`;
            case 'stripe':
                return `${baseUrl}/payment/stripe?tip=${tip.id}`;
            default:
                return `${baseUrl}/payment?tip=${tip.id}&processor=${processor}`;
        }
    }
    
    // NUEVO: Datos específicos por procesador
    getProcessorSpecificData(tip, performer, processor) {
        switch (processor) {
            case 'paypal':
                return {
                    email: performer.paypalEmail,
                    paypalMeUrl: this.createPayPalMeUrl(tip, performer),
                    description: `Tip para ${performer.name}`
                };
                
            case 'bold':
                return {
                    email: performer.boldEmail,
                    accountId: performer.boldAccountId,
                    description: `Tip para ${performer.name} - ${tip.message}`,
                    reference: `tip-${tip.id}`,
                    webhookUrl: `${process.env.BASE_URL}/webhook/bold`
                };
                
            case 'mercadopago':
                return {
                    email: performer.mercadoPagoEmail,
                    accessToken: performer.mercadoPagoAccessToken,
                    description: `Tip para ${performer.name}`,
                    externalReference: `tip-${tip.id}`,
                    notificationUrl: `${process.env.BASE_URL}/webhook/mercadopago`
                };
                
            case 'stripe':
                return {
                    accountId: performer.stripeAccountId,
                    email: performer.stripeEmail,
                    description: `Tip para ${performer.name}`,
                    metadata: {
                        tipId: tip.id,
                        performerId: performer.id,
                        performerName: performer.name
                    }
                };
                
            default:
                return {};
        }
    }
    
    // MEJORADO: PayPal.me URL con mejor manejo
    createPayPalMeUrl(tip, performer) {
        if (!performer.paypalEmail) return null;
        
        const paypalUsername = performer.paypalEmail.split('@')[0];
        let amount = tip.amount;
        let currency = tip.currency;
        
        // PayPal.me manejo de monedas
        if (currency === 'COP') {
            // Convertir COP a USD (tasa aproximada)
            const rate = parseFloat(process.env.COP_TO_USD_RATE) || 4000;
            amount = Math.round(amount / rate);
            currency = 'USD';
        }
        
        return `https://paypal.me/${paypalUsername}/${amount}${currency}`;
    }
    
    // NUEVO: Procesar tip por procesador específico
    processTipSuccess(tipId, transactionData = {}) {
        const tip = this.findTip(tipId);
        
        if (!tip) {
            throw new Error('Tip no encontrado');
        }
        
        if (tip.processed) {
            throw new Error('Tip ya procesado');
        }
        
        // Actualizar tip con información del procesador
        tip.processed = true;
        tip.processedAt = new Date();
        tip.status = 'completed';
        tip.transactionId = transactionData.transactionId || null;
        tip.processedBy = transactionData.processor || 'unknown';
        tip.processorResponse = transactionData.processorResponse || {};
        
        // Calcular fees reales si se proporcionan
        if (transactionData.actualFees) {
            tip.actualFees = transactionData.actualFees;
        }
        
        console.log(`✅ Tip procesado exitosamente por ${tip.processedBy}: ${tipId}`);
        return tip;
    }
    
    // NUEVO: Obtener información de procesador
    getProcessorInfo(processor) {
        return this.paymentMethods[processor] || null;
    }
    
    // NUEVO: Obtener procesadores por país
    getProcessorsByCountry(countryCode) {
        const available = [];
        
        Object.entries(this.paymentMethods).forEach(([key, method]) => {
            if (method.enabled && method.countries.includes(countryCode)) {
                available.push({
                    key,
                    name: method.name,
                    description: method.description,
                    currencies: method.currency,
                    fees: {
                        percentage: method.processingFee * 100,
                        fixed: method.fixedFee
                    }
                });
            }
        });
        
        return available;
    }
    
    // NUEVO: Obtener estadísticas por procesador
    getTipStatsByProcessor(performerId = null) {
        let tips = performerId 
            ? this.getPerformerTips(performerId, 10000)
            : this.globalTips;
        
        const stats = {};
        
        // Inicializar stats para todos los procesadores
        Object.keys(this.paymentMethods).forEach(processor => {
            stats[processor] = {
                count: 0,
                amount: 0,
                fees: 0,
                net: 0,
                average: 0
            };
        });
        
        // Calcular estadísticas
        tips.filter(tip => tip.processed).forEach(tip => {
            const processor = tip.processedBy || 'unknown';
            
            if (!stats[processor]) {
                stats[processor] = { count: 0, amount: 0, fees: 0, net: 0, average: 0 };
            }
            
            stats[processor].count++;
            stats[processor].amount += tip.amount;
            
            // Usar fees reales si están disponibles, sino usar calculados
            const fees = tip.actualFees || tip.fees[processor] || { fees: 0, net: tip.amount };
            stats[processor].fees += fees.fees;
            stats[processor].net += fees.net;
        });
        
        // Calcular promedios
        Object.keys(stats).forEach(processor => {
            if (stats[processor].count > 0) {
                stats[processor].average = Math.round(stats[processor].amount / stats[processor].count);
            }
        });
        
        return stats;
    }
    
    // NUEVO: Generar reporte comparativo de procesadores
    generateProcessorReport(performerId = null) {
        const stats = this.getTipStatsByProcessor(performerId);
        const processorInfo = {};
        
        Object.entries(this.paymentMethods).forEach(([key, method]) => {
            processorInfo[key] = {
                name: method.name,
                enabled: method.enabled,
                description: method.description,
                currencies: method.currency,
                countries: method.countries,
                fees: {
                    percentage: method.processingFee * 100,
                    fixed: method.fixedFee
                },
                stats: stats[key] || { count: 0, amount: 0, fees: 0, net: 0, average: 0 }
            };
        });
        
        return {
            summary: processorInfo,
            recommendations: this.getProcessorRecommendations(stats),
            generatedAt: new Date()
        };
    }
    
    // NUEVO: Recomendaciones de procesadores
    getProcessorRecommendations(stats) {
        const recommendations = [];
        
        // Buscar el procesador con mejores tarifas
        let bestFeeRatio = { processor: null, ratio: 0 };
        let mostUsed = { processor: null, count: 0 };
        
        Object.entries(stats).forEach(([processor, data]) => {
            if (data.count > 0) {
                const feeRatio = data.net / data.amount;
                
                if (feeRatio > bestFeeRatio.ratio) {
                    bestFeeRatio = { processor, ratio: feeRatio };
                }
                
                if (data.count > mostUsed.count) {
                    mostUsed = { processor, count: data.count };
                }
            }
        });
        
        if (bestFeeRatio.processor) {
            recommendations.push({
                type: 'best_fees',
                processor: bestFeeRatio.processor,
                reason: `Mejor ratio de fees (${(bestFeeRatio.ratio * 100).toFixed(1)}% neto)`
            });
        }
        
        if (mostUsed.processor) {
            recommendations.push({
                type: 'most_popular',
                processor: mostUsed.processor,
                reason: `Más usado por los usuarios (${mostUsed.count} tips)`
            });
        }
        
        return recommendations;
    }
    
    // NUEVO: Configurar procesador para performer
    configureProcessorForPerformer(performerId, processor, config) {
        const performer = this.performerManager.getPerformer(performerId);
        if (!performer) {
            throw new Error('Performer no encontrado');
        }
        
        switch (processor) {
            case 'paypal':
                performer.paypalEmail = config.email;
                break;
            case 'bold':
                performer.boldEmail = config.email;
                performer.boldAccountId = config.accountId;
                break;
            case 'mercadopago':
                performer.mercadoPagoEmail = config.email;
                performer.mercadoPagoAccessToken = config.accessToken;
                break;
            case 'stripe':
                performer.stripeAccountId = config.accountId;
                performer.stripeEmail = config.email;
                break;
            default:
                throw new Error('Procesador no válido');
        }
        
        console.log(`💳 ${processor} configurado para ${performer.name}`);
        return true;
    }
    
    // EXISTENTES: Mantener métodos originales para compatibilidad
    generateTipId() {
        return `tip_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    
    findTip(tipId) {
        return this.globalTips.find(tip => tip.id === tipId);
    }
    
    getActivePerformerTips(limit = 20) {
        const activePerformer = this.performerManager.getActivePerformer();
        
        if (!activePerformer) {
            return [];
        }
        
        return activePerformer.tips.slice(-limit).reverse();
    }
    
    getPerformerTips(performerId, limit = 50) {
        const performer = this.performerManager.getPerformer(performerId);
        
        if (!performer) {
            throw new Error('Performer no encontrado');
        }
        
        return performer.tips.slice(-limit).reverse();
    }
    
    getTipsByStatus(status, limit = 100) {
        return this.globalTips
            .filter(tip => tip.status === status)
            .slice(-limit)
            .reverse();
    }
    
    getTotalTips() {
        return this.globalTips
            .filter(tip => tip.processed)
            .reduce((sum, tip) => sum + tip.amount, 0);
    }
    
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
                status: tip.status,
                processedBy: tip.processedBy || 'unknown'
            }));
    }
    
    // MEJORADO: Estadísticas incluyendo procesadores
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
        
        const stats = {
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
            failed: tips.filter(tip => tip.status === 'failed').length,
            
            // NUEVO: Stats por procesador
            byProcessor: this.getTipStatsByProcessor(performerId)
        };
        
        return stats;
    }
    
    getTipsFromDate(tips, date) {
        const startDate = new Date(date);
        startDate.setHours(0, 0, 0, 0);
        
        return tips.filter(tip => new Date(tip.timestamp) >= startDate);
    }
    
    isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }
    
    // Mantener métodos existentes para compatibilidad
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
    
    searchTips(query, performerId = null) {
        let tips = performerId 
            ? this.getPerformerTips(performerId, 1000)
            : this.globalTips;
        
        const searchTerm = query.toLowerCase();
        
        return tips.filter(tip => 
            tip.message.toLowerCase().includes(searchTerm) ||
            tip.user.toLowerCase().includes(searchTerm) ||
            tip.performerName.toLowerCase().includes(searchTerm) ||
            tip.id.toLowerCase().includes(searchTerm) ||
            (tip.processedBy && tip.processedBy.toLowerCase().includes(searchTerm))
        );
    }
    
    cleanupOldTips(daysOld = 90) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysOld);
        
        const initialCount = this.globalTips.length;
        this.globalTips = this.globalTips.filter(tip => new Date(tip.timestamp) > cutoffDate);
        
        const removed = initialCount - this.globalTips.length;
        console.log(`🧹 Tips limpiados: ${removed} tips eliminados (más de ${daysOld} días)`);
        
        return removed;
    }
    
    exportTips(performerId = null) {
        const tips = performerId 
            ? this.getPerformerTips(performerId, 10000)
            : this.globalTips;
        
        return {
            tips,
            exportedAt: new Date(),
            performerId,
            totalTips: tips.length,
            processorStats: this.getTipStatsByProcessor(performerId)
        };
    }
}

module.exports = TipManager;