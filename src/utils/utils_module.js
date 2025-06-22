// utils.js - Utilidades compartidas
const axios = require('axios');

class Utils {
    constructor() {
        console.log('✅ Utils inicializado');
    }
    
    // Validaciones
    isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }
    
    isValidUrl(url) {
        try {
            new URL(url);
            return true;
        } catch {
            return false;
        }
    }
    
    isValidPayPalEmail(email) {
        // PayPal usa validación de email estándar
        return this.isValidEmail(email);
    }
    
    // Formateo de texto
    formatCurrency(amount, currency = 'COP') {
        return new Intl.NumberFormat('es-CO', {
            style: 'currency',
            currency: currency
        }).format(amount);
    }
    
    formatNumber(number) {
        return new Intl.NumberFormat('es-CO').format(number);
    }
    
    formatDate(date, options = {}) {
        const defaultOptions = {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'America/Bogota'
        };
        
        return new Intl.DateTimeFormat('es-CO', { ...defaultOptions, ...options }).format(new Date(date));
    }
    
    formatDateShort(date) {
        return this.formatDate(date, {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    }
    
    formatTime(date) {
        return this.formatDate(date, {
            hour: '2-digit',
            minute: '2-digit'
        });
    }
    
    // Cálculos de tiempo
    getUptime(startTime) {
        const now = new Date();
        const start = new Date(startTime);
        const diffMs = now - start;
        
        const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
        
        if (days > 0) {
            return `${days}d ${hours}h ${minutes}m`;
        } else if (hours > 0) {
            return `${hours}h ${minutes}m`;
        } else {
            return `${minutes}m`;
        }
    }
    
    getTimeAgo(date) {
        const now = new Date();
        const then = new Date(date);
        const diffMs = now - then;
        
        const minutes = Math.floor(diffMs / (1000 * 60));
        const hours = Math.floor(diffMs / (1000 * 60 * 60));
        const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        
        if (days > 0) {
            return `hace ${days} día${days > 1 ? 's' : ''}`;
        } else if (hours > 0) {
            return `hace ${hours} hora${hours > 1 ? 's' : ''}`;
        } else if (minutes > 0) {
            return `hace ${minutes} minuto${minutes > 1 ? 's' : ''}`;
        } else {
            return 'ahora mismo';
        }
    }
    
    // Manipulación de strings
    sanitizeText(text, maxLength = 1000) {
        if (!text) return '';
        
        return text
            .toString()
            .trim()
            .substring(0, maxLength)
            .replace(/[<>]/g, '') // Remover < >
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;');
    }
    
    extractCommand(text) {
        if (!text) return null;
        
        const cleanText = text.toLowerCase().trim();
        const parts = cleanText.split(' ');
        
        return {
            command: parts[0],
            args: parts.slice(1),
            fullText: cleanText,
            originalText: text
        };
    }
    
    parseAmount(amountStr) {
        // Remover caracteres no numéricos excepto punto y coma
        const cleanAmount = amountStr.toString().replace(/[^\d.,]/g, '');
        
        // Reemplazar coma por punto para decimales
        const normalized = cleanAmount.replace(',', '.');
        
        const amount = parseFloat(normalized);
        
        return {
            amount: isNaN(amount) ? 0 : amount,
            isValid: !isNaN(amount) && amount > 0,
            formatted: this.formatNumber(amount)
        };
    }
    
    // Generadores de ID
    generateId(prefix = '', length = 8) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        
        for (let i = 0; i < length; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        
        return prefix ? `${prefix}_${result}` : result;
    }
    
    generateTipId() {
        return `tip_${Date.now()}_${this.generateId('', 6)}`;
    }
    
    generatePerformerId() {
        return `perf_${Date.now()}_${this.generateId('', 4)}`;
    }
    
    // Utilidades de arrays y objetos
    groupBy(array, key) {
        return array.reduce((groups, item) => {
            const group = item[key];
            groups[group] = groups[group] || [];
            groups[group].push(item);
            return groups;
        }, {});
    }
    
    sortBy(array, key, direction = 'asc') {
        return array.sort((a, b) => {
            const aVal = a[key];
            const bVal = b[key];
            
            if (direction === 'desc') {
                return bVal > aVal ? 1 : -1;
            } else {
                return aVal > bVal ? 1 : -1;
            }
        });
    }
    
    unique(array, key = null) {
        if (key) {
            const seen = new Set();
            return array.filter(item => {
                const value = item[key];
                if (seen.has(value)) {
                    return false;
                }
                seen.add(value);
                return true;
            });
        } else {
            return [...new Set(array)];
        }
    }
    
    // Estadísticas
    calculateStats(numbers) {
        if (!numbers.length) {
            return {
                count: 0,
                sum: 0,
                average: 0,
                min: 0,
                max: 0,
                median: 0
            };
        }
        
        const sorted = [...numbers].sort((a, b) => a - b);
        const sum = numbers.reduce((acc, n) => acc + n, 0);
        const count = numbers.length;
        
        return {
            count,
            sum,
            average: Math.round(sum / count),
            min: sorted[0],
            max: sorted[count - 1],
            median: count % 2 === 0 
                ? (sorted[count / 2 - 1] + sorted[count / 2]) / 2
                : sorted[Math.floor(count / 2)]
        };
    }
    
    calculatePercentageChange(oldValue, newValue) {
        if (oldValue === 0) return newValue > 0 ? 100 : 0;
        return Math.round(((newValue - oldValue) / oldValue) * 100);
    }
    
    // Utilidades de fechas
    isToday(date) {
        const today = new Date();
        const checkDate = new Date(date);
        
        return today.toDateString() === checkDate.toDateString();
    }
    
    isThisWeek(date) {
        const now = new Date();
        const checkDate = new Date(date);
        const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay()));
        
        return checkDate >= startOfWeek;
    }
    
    isThisMonth(date) {
        const now = new Date();
        const checkDate = new Date(date);
        
        return now.getMonth() === checkDate.getMonth() && 
               now.getFullYear() === checkDate.getFullYear();
    }
    
    getDateRange(period) {
        const now = new Date();
        let start, end;
        
        switch (period) {
            case 'today':
                start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
                break;
            case 'yesterday':
                start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
                end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                break;
            case 'week':
                start = new Date(now.setDate(now.getDate() - now.getDay()));
                end = new Date();
                break;
            case 'month':
                start = new Date(now.getFullYear(), now.getMonth(), 1);
                end = new Date();
                break;
            case 'year':
                start = new Date(now.getFullYear(), 0, 1);
                end = new Date();
                break;
            default:
                start = new Date(0);
                end = new Date();
        }
        
        return { start, end };
    }
    
    // Comunicación con Webex
    async sendDirectMessage(email, text, botToken) {
        try {
            if (!botToken) {
                throw new Error('Bot token no configurado');
            }
            
            await axios.post('https://webexapis.com/v1/messages', {
                toPersonEmail: email,
                markdown: text
            }, {
                headers: {
                    'Authorization': `Bearer ${botToken}`,
                    'Content-Type': 'application/json'
                }
            });
            
            console.log(`📧 Mensaje directo enviado a ${email}`);
            return true;
        } catch (error) {
            console.error('❌ Error enviando mensaje directo:', error.response?.data || error.message);
            return false;
        }
    }
    
    async sendRoomMessage(roomId, text, botToken) {
        try {
            if (!botToken) {
                throw new Error('Bot token no configurado');
            }
            
            await axios.post('https://webexapis.com/v1/messages', {
                roomId,
                markdown: text
            }, {
                headers: {
                    'Authorization': `Bearer ${botToken}`,
                    'Content-Type': 'application/json'
                }
            });
            
            console.log(`📤 Mensaje enviado a room ${roomId.substring(0, 20)}...`);
            return true;
        } catch (error) {
            console.error('❌ Error enviando mensaje:', error.response?.data || error.message);
            return false;
        }
    }
    
    // Utilidades de configuración
    parseEnvBoolean(value, defaultValue = false) {
        if (value === undefined || value === null) return defaultValue;
        return value.toString().toLowerCase() === 'true';
    }
    
    parseEnvNumber(value, defaultValue = 0) {
        const parsed = parseInt(value);
        return isNaN(parsed) ? defaultValue : parsed;
    }
    
    parseEnvArray(value, separator = ',', defaultValue = []) {
        if (!value) return defaultValue;
        return value.split(separator).map(item => item.trim()).filter(Boolean);
    }
    
    // Logging helpers
    logInfo(message, data = null) {
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] ℹ️  ${message}`, data || '');
    }
    
    logError(message, error = null) {
        const timestamp = new Date().toISOString();
        console.error(`[${timestamp}] ❌ ${message}`, error || '');
    }
    
    logSuccess(message, data = null) {
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] ✅ ${message}`, data || '');
    }
    
    logWarning(message, data = null) {
        const timestamp = new Date().toISOString();
        console.warn(`[${timestamp}] ⚠️  ${message}`, data || '');
    }
    
    // Utilidades de seguridad
    hashPassword(password) {
        // Implementación simple para demo - en producción usar bcrypt
        return Buffer.from(password).toString('base64');
    }
    
    verifyPassword(password, hash) {
        return this.hashPassword(password) === hash;
    }
    
    sanitizeForUrl(text) {
        return text
            .toLowerCase()
            .replace(/[^\w\s-]/g, '')
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-')
            .trim('-');
    }
    
    // Utilidades de almacenamiento
    setItem(key, value) {
        try {
            const data = JSON.stringify(value);
            // En memoria por ahora - en producción usar Redis o DB
            this._storage = this._storage || {};
            this._storage[key] = data;
            return true;
        } catch (error) {
            console.error('Error storing item:', error);
            return false;
        }
    }
    
    getItem(key, defaultValue = null) {
        try {
            this._storage = this._storage || {};
            const data = this._storage[key];
            return data ? JSON.parse(data) : defaultValue;
        } catch (error) {
            console.error('Error getting item:', error);
            return defaultValue;
        }
    }
    
    removeItem(key) {
        try {
            this._storage = this._storage || {};
            delete this._storage[key];
            return true;
        } catch (error) {
            console.error('Error removing item:', error);
            return false;
        }
    }
    
    // Utilidades de red
    async isUrlReachable(url) {
        try {
            const response = await axios.head(url, { timeout: 5000 });
            return response.status >= 200 && response.status < 400;
        } catch {
            return false;
        }
    }
    
    // Exportar/Importar datos
    exportToJson(data, filename = null) {
        const jsonString = JSON.stringify(data, null, 2);
        
        if (filename) {
            // En un entorno de navegador, esto iniciaría una descarga
            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            
            return {
                data: jsonString,
                url,
                filename: filename.endsWith('.json') ? filename : `${filename}.json`
            };
        }
        
        return jsonString;
    }
    
    importFromJson(jsonString) {
        try {
            return JSON.parse(jsonString);
        } catch (error) {
            throw new Error('JSON inválido: ' + error.message);
        }
    }
    
    // Debugging
    debugObject(obj, label = 'Debug') {
        console.log(`🐛 ${label}:`, JSON.stringify(obj, null, 2));
    }
    
    measureTime(label) {
        const start = Date.now();
        
        return {
            end: () => {
                const duration = Date.now() - start;
                console.log(`⏱️  ${label}: ${duration}ms`);
                return duration;
            }
        };
    }
    
    // Utilidades de texto para Webex
    createMarkdownTable(headers, rows) {
        if (!headers.length || !rows.length) return '';
        
        let table = '| ' + headers.join(' | ') + ' |\n';
        table += '| ' + headers.map(() => '---').join(' | ') + ' |\n';
        
        rows.forEach(row => {
            table += '| ' + row.join(' | ') + ' |\n';
        });
        
        return table;
    }
    
    createProgressBar(current, total, length = 10) {
        const percentage = Math.min(current / total, 1);
        const filled = Math.round(percentage * length);
        const empty = length - filled;
        
        return '█'.repeat(filled) + '░'.repeat(empty) + ` ${Math.round(percentage * 100)}%`;
    }
    
    truncateText(text, maxLength = 100, suffix = '...') {
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength - suffix.length) + suffix;
    }
}

module.exports = Utils;