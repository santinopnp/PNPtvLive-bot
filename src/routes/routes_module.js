// routes.js - Manejo de rutas HTTP
class Routes {
    constructor(core) {
        this.core = core;
        console.log('✅ Routes inicializado');
    }
    
    setupRoutes(app) {
        // Webhook routes
        app.post('/webhook', (req, res) => this.core.webhookHandler.handleWebhook(req, res));
        
        // Dashboard routes
        app.get('/dashboard', (req, res) => res.redirect('/performer'));
        app.get('/performer', (req, res) => this.servePerformerDashboard(req, res));
        app.get('/admin', (req, res) => this.serveAdminPanel(req, res));
        
        // API routes
        this.setupApiRoutes(app);
        
        // Payment routes
        this.setupPaymentRoutes(app);
        
        console.log('✅ Todas las rutas configuradas');
    }
    
    setupApiRoutes(app) {
        // Status API
        app.get('/api/status', (req, res) => this.getStatus(req, res));
        
        // Bot control API
        app.post('/api/toggle-live', (req, res) => this.toggleLive(req, res));
        app.get('/api/tips', (req, res) => this.getTips(req, res));
        app.post('/api/broadcast', (req, res) => this.sendBroadcast(req, res));
        
        // Performer API
        app.post('/api/update-paypal', (req, res) => this.updatePayPal(req, res));
        app.post('/api/update-settings', (req, res) => this.updateSettings(req, res));
        
        // Admin API
        app.post('/api/admin/login', (req, res) => this.adminLogin(req, res));
        app.post('/api/admin/switch-performer', (req, res) => this.switchPerformer(req, res));
        app.post('/api/admin/create-performer', (req, res) => this.createPerformer(req, res));
        app.get('/api/admin/performers', (req, res) => this.getPerformers(req, res));
        app.delete('/api/admin/performer/:id', (req, res) => this.deletePerformer(req, res));
        
        // Stats API
        app.get('/api/stats', (req, res) => this.getStats(req, res));
        app.get('/api/stats/:performerId', (req, res) => this.getPerformerStats(req, res));
    }
    
    setupPaymentRoutes(app) {
        app.get('/payment-success', (req, res) => this.paymentSuccess(req, res));
        app.get('/paypal-payment', (req, res) => this.paypalPayment(req, res));
        app.post('/paypal-webhook', (req, res) => this.handlePayPalWebhook(req, res));
    }
    
    // API Handlers
    getStatus(req, res) {
        try {
            const status = this.core.getStatus();
            res.json(status);
        } catch (error) {
            console.error('Error getting status:', error);
            res.status(500).json({ error: 'Error interno del servidor' });
        }
    }
    
    toggleLive(req, res) {
        try {
            const isLive = this.core.toggleLive();
            
            console.log(`📺 Estado cambiado: ${isLive ? 'EN VIVO' : 'OFFLINE'}`);
            res.json({ isLive });
        } catch (error) {
            console.error('Error toggling live:', error);
            res.status(500).json({ error: 'Error cambiando estado' });
        }
    }
    
    getTips(req, res) {
        try {
            const limit = parseInt(req.query.limit) || 20;
            const tips = this.core.tipManager.getActivePerformerTips(limit);
            res.json(tips);
        } catch (error) {
            console.error('Error getting tips:', error);
            res.status(500).json({ error: 'Error obteniendo tips' });
        }
    }
    
    async sendBroadcast(req, res) {
        try {
            const { message } = req.body;
            
            if (!message || !message.trim()) {
                return res.status(400).json({ error: 'Mensaje requerido' });
            }
            
            const activePerformer = this.core.performerManager.getActivePerformer();
            if (!activePerformer) {
                return res.status(404).json({ error: 'No hay performer activo' });
            }
            
            await this.core.notifySubscribers(`📢 **Mensaje de ${activePerformer.name}**\n\n${message}`);
            
            console.log(`📢 Broadcast enviado a ${activePerformer.subscribers.size} suscriptores`);
            res.json({ 
                success: true, 
                sent: activePerformer.subscribers.size,
                performer: activePerformer.name
            });
        } catch (error) {
            console.error('Error sending broadcast:', error);
            res.status(500).json({ error: 'Error enviando broadcast' });
        }
    }
    
    updatePayPal(req, res) {
        try {
            const { paypalEmail, password } = req.body;
            
            if (!paypalEmail || !password) {
                return res.status(400).json({ error: 'PayPal email y contraseña requeridos' });
            }
            
            const activePerformer = this.core.performerManager.getActivePerformer();
            if (!activePerformer) {
                return res.status(404).json({ error: 'No hay performer activo' });
            }
            
            // Validar contraseña del performer
            if (!this.core.validatePerformerPassword(activePerformer.id, password)) {
                return res.status(401).json({ error: 'Contraseña incorrecta' });
            }
            
            const updatedPayPal = this.core.performerManager.updatePerformerPayPal(activePerformer.id, paypalEmail);
            
            res.json({ success: true, paypalEmail: updatedPayPal });
        } catch (error) {
            console.error('Error updating PayPal:', error);
            res.status(500).json({ error: error.message });
        }
    }
    
    updateSettings(req, res) {
        try {
            const { settings } = req.body;
            
            if (!settings) {
                return res.status(400).json({ error: 'Configuraciones requeridas' });
            }
            
            const activePerformer = this.core.performerManager.getActivePerformer();
            if (!activePerformer) {
                return res.status(404).json({ error: 'No hay performer activo' });
            }
            
            const updatedSettings = this.core.performerManager.updatePerformerSettings(activePerformer.id, settings);
            
            res.json({ success: true, settings: updatedSettings });
        } catch (error) {
            console.error('Error updating settings:', error);
            res.status(500).json({ error: error.message });
        }
    }
    
    // Admin API Handlers
    adminLogin(req, res) {
        try {
            const { password } = req.body;
            
            if (this.core.validateMasterPassword(password)) {
                res.json({ success: true, message: 'Acceso autorizado' });
            } else {
                res.status(401).json({ error: 'Contraseña incorrecta' });
            }
        } catch (error) {
            console.error('Error in admin login:', error);
            res.status(500).json({ error: 'Error interno' });
        }
    }
    
    switchPerformer(req, res) {
        try {
            const { performerId, password } = req.body;
            
            if (!this.core.validateMasterPassword(password)) {
                return res.status(401).json({ error: 'Acceso denegado' });
            }
            
            const performer = this.core.performerManager.switchActivePerformer(performerId);
            
            res.json({ 
                success: true, 
                activePerformer: performer.name,
                performerId: performer.id
            });
        } catch (error) {
            console.error('Error switching performer:', error);
            res.status(500).json({ error: error.message });
        }
    }
    
    createPerformer(req, res) {
        try {
            const { password, name, email, paypalEmail } = req.body;
            
            if (!this.core.validateMasterPassword(password)) {
                return res.status(401).json({ error: 'Acceso denegado' });
            }
            
            const performer = this.core.performerManager.createPerformer({
                name,
                email,
                paypalEmail
            });
            
            res.json({ success: true, performer: {
                id: performer.id,
                name: performer.name,
                email: performer.email,
                paypalEmail: performer.paypalEmail
            }});
        } catch (error) {
            console.error('Error creating performer:', error);
            res.status(500).json({ error: error.message });
        }
    }
    
    getPerformers(req, res) {
        try {
            const performers = this.core.performerManager.getAllPerformers();
            res.json(performers);
        } catch (error) {
            console.error('Error getting performers:', error);
            res.status(500).json({ error: 'Error obteniendo performers' });
        }
    }
    
    deletePerformer(req, res) {
        try {
            const { id } = req.params;
            const { password } = req.body;
            
            if (!this.core.validateMasterPassword(password)) {
                return res.status(401).json({ error: 'Acceso denegado' });
            }
            
            this.core.performerManager.deletePerformer(id);
            
            res.json({ success: true, message: 'Performer eliminado' });
        } catch (error) {
            console.error('Error deleting performer:', error);
            res.status(500).json({ error: error.message });
        }
    }
    
    // Stats API
    getStats(req, res) {
        try {
            const globalStats = this.core.tipManager.getTipStats();
            const recentTips = this.core.tipManager.getRecentTips(10);
            const topPerformer = this.core.performerManager.getTopPerformer();
            
            res.json({
                global: globalStats,
                recentTips,
                topPerformer: topPerformer ? {
                    name: topPerformer.name,
                    totalTips: topPerformer.stats.totalTips
                } : null,
                totalPerformers: this.core.performerManager.getPerformersCount()
            });
        } catch (error) {
            console.error('Error getting stats:', error);
            res.status(500).json({ error: 'Error obteniendo estadísticas' });
        }
    }
    
    getPerformerStats(req, res) {
        try {
            const { performerId } = req.params;
            const stats = this.core.performerManager.getPerformerStats(performerId);
            const tipStats = this.core.tipManager.getTipStats(performerId);
            
            res.json({
                performer: stats,
                tips: tipStats
            });
        } catch (error) {
            console.error('Error getting performer stats:', error);
            res.status(500).json({ error: error.message });
        }
    }
    
    // Payment Handlers
    paymentSuccess(req, res) {
        const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>¡Pago Enviado!</title>
<style>body{font-family:sans-serif;text-align:center;padding:50px;background:#f0f8ff}
.success{background:white;padding:40px;border-radius:15px;box-shadow:0 4px 15px rgba(0,0,0,0.1);max-width:400px;margin:0 auto}
.icon{font-size:4em;color:#0070ba;margin-bottom:20px}</style></head>
<body><div class="success"><div class="icon">💳</div><h1>¡Pago Enviado!</h1>
<p>Tu tip ha sido enviado vía PayPal.</p><p>El performer recibirá una notificación.</p>
<button onclick="window.close()" style="background:#0070ba;color:white;border:none;padding:10px 20px;border-radius:5px;cursor:pointer">Cerrar</button></div></body></html>`;
        
        res.send(html);
    }
    
    paypalPayment(req, res) {
        try {
            const tipId = req.query.tip;
            const tip = this.core.tipManager.findTip(tipId);
            
            if (!tip) {
                return res.status(404).send('Tip no encontrado');
            }
            
            const performer = this.core.performerManager.getPerformer(tip.performer);
            const paypalMeUrl = this.core.tipManager.createPayPalMeUrl(tip);
            
            const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Pagar Tip con PayPal</title>
<style>body{font-family:sans-serif;padding:20px;background:#f0f8ff}
.container{max-width:500px;margin:0 auto;background:white;padding:30px;border-radius:15px;box-shadow:0 4px 15px rgba(0,0,0,0.1)}
.amount{font-size:2.5em;color:#0070ba;font-weight:bold;text-align:center;margin:20px 0}
.performer{text-align:center;margin:20px 0;padding:15px;background:#f8f9fa;border-radius:10px}
.paypal-btn{background:#0070ba;color:white;padding:15px 30px;border:none;border-radius:25px;font-size:1.2em;cursor:pointer;width:100%;margin:20px 0}
.paypal-btn:hover{background:#005a9b}
.manual{background:#fff3cd;padding:15px;border-radius:10px;margin:20px 0}</style></head>
<body><div class="container"><h1>💰 Pagar Tip con PayPal</h1>
<div class="performer"><h3>Para: ${performer ? performer.name : 'Performer'}</h3>
<p>💳 <strong>${tip.paypalEmail}</strong></p></div>
<div class="amount">$${tip.amount.toLocaleString('es-CO')} ${tip.currency}</div>
<p><strong>Mensaje:</strong> "${tip.message}"</p>
<button class="paypal-btn" onclick="window.open('${paypalMeUrl}', '_blank')">
💳 Pagar con PayPal</button>
<div class="manual"><h4>💡 Instrucciones:</h4>
<p>1. Haz clic en el botón de PayPal</p>
<p>2. Envía $${tip.amount.toLocaleString('es-CO')} a <strong>${tip.paypalEmail}</strong></p>
<p>3. En el concepto incluye: <strong>Tip-${tip.id}</strong></p>
<p>4. Recibirás confirmación automática</p></div>
<p style="text-align:center;margin-top:20px;color:#666">ID de transacción: ${tip.id}</p></div></body></html>`;
            
            res.send(html);
        } catch (error) {
            console.error('Error serving payment page:', error);
            res.status(500).send('Error interno del servidor');
        }
    }
    
    handlePayPalWebhook(req, res) {
        try {
            console.log('💳 PayPal webhook recibido:', req.body);
            
            // Aquí implementarías la lógica de PayPal webhook
            // Por ahora, solo log del evento
            
            res.status(200).json({ received: true });
        } catch (error) {
            console.error('Error handling PayPal webhook:', error);
            res.status(500).send('Error');
        }
    }
    
    // Dashboard HTML Servers
    servePerformerDashboard(req, res) {
        const performer = this.core.performerManager.getActivePerformer();
        const performerName = performer ? performer.name : 'No Performer';
        
        const html = this.generatePerformerDashboardHTML(performer, performerName);
        res.send(html);
    }
    
    serveAdminPanel(req, res) {
        const html = this.generateAdminPanelHTML();
        res.send(html);
    }
    
    // HTML Generators (métodos auxiliares para generar HTML)
    generatePerformerDashboardHTML(performer, performerName) {
        return `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${performerName} - Dashboard</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); min-height: 100vh; padding: 20px; }
        .container { max-width: 1200px; margin: 0 auto; }
        .header { text-align: center; color: white; margin-bottom: 30px; }
        .dashboard { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; }
        .card { background: rgba(255,255,255,0.95); border-radius: 15px; padding: 25px; box-shadow: 0 8px 32px rgba(0,0,0,0.1); }
        .status { display: flex; align-items: center; margin: 15px 0; }
        .indicator { width: 15px; height: 15px; border-radius: 50%; margin-right: 10px; }
        .live { background: #ff4444; animation: pulse 2s infinite; }
        .offline { background: #666; }
        .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 15px; margin: 20px 0; }
        .stat { text-align: center; }
        .stat-value { font-size: 1.5em; font-weight: bold; color: #667eea; }
        .btn { background: #667eea; color: white; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer; margin: 5px; }
        .btn:hover { background: #5a6fd8; }
        .btn.success { background: #28a745; }
        .btn.danger { background: #dc3545; }
        input, textarea { width: 100%; padding: 10px; margin: 5px 0; border: 1px solid #ddd; border-radius: 5px; }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
        .tips-list { max-height: 250px; overflow-y: auto; }
        .tip-item { border-bottom: 1px solid #eee; padding: 8px 0; }
        .success { color: #28a745; font-size: 0.9em; }
        .pending { color: #ffc107; font-size: 0.9em; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🎭 ${performerName}</h1>
            <p>Dashboard del Performer</p>
            <a href="/admin" class="btn" style="text-decoration: none;">🔧 Admin Panel</a>
        </div>
        
        <div class="dashboard">
            <div class="card">
                <h3>📊 Estado del Stream</h3>
                <div class="status">
                    <div class="indicator" id="indicator"></div>
                    <span id="statusText">Cargando...</span>
                </div>
                <div class="stats">
                    <div class="stat">
                        <div class="stat-value" id="subscribers">0</div>
                        <div>Suscriptores</div>
                    </div>
                    <div class="stat">
                        <div class="stat-value" id="totalTips">$0</div>
                        <div>Total Tips</div>
                    </div>
                    <div class="stat">
                        <div class="stat-value" id="showCount">0</div>
                        <div>Shows</div>
                    </div>
                </div>
                <button class="btn" onclick="toggleLive()">🔴 Toggle EN VIVO</button>
                <button class="btn" onclick="refreshData()">🔄 Actualizar</button>
            </div>
            
            <div class="card">
                <h3>💳 Configuración PayPal</h3>
                <input type="email" id="paypalEmail" placeholder="tu-email@paypal.com">
                <input type="password" id="paypalPassword" placeholder="Contraseña del performer">
                <button class="btn success" onclick="updatePayPal()">💳 Actualizar PayPal</button>
                <hr style="margin: 15px 0;">
                <p><strong>PayPal actual:</strong> <span id="currentPayPal">Cargando...</span></p>
            </div>
            
            <div class="card">
                <h3>⚙️ Configuraciones</h3>
                <label>Tip mínimo (COP):</label>
                <input type="number" id="tipMinAmount" value="1000">
                <label>Mensaje de bienvenida:</label>
                <textarea id="welcomeMessage" rows="3" placeholder="¡Bienvenido a mi show!"></textarea>
                <label>Mensaje de tip:</label>
                <input type="text" id="tipMessage" placeholder="¡Gracias por el tip!">
                <button class="btn" onclick="updateSettings()">⚙️ Guardar Configuración</button>
            </div>
            
            <div class="card">
                <h3>💰 Tips Recientes</h3>
                <div class="tips-list" id="tipsList">Cargando...</div>
            </div>
        </div>
    </div>
    
    <script>
        // Dashboard JavaScript code here...
        let data = {};
        
        async function loadData() {
            try {
                const response = await fetch('/api/status');
                data = await response.json();
                updateDashboard();
                loadTips();
            } catch (error) {
                console.error('Error:', error);
            }
        }
        
        function updateDashboard() {
            if (!data.performer) return;
            
            const indicator = document.getElementById('indicator');
            const statusText = document.getElementById('statusText');
            
            if (data.bot.isLive) {
                indicator.className = 'indicator live';
                statusText.textContent = '🔴 EN VIVO';
            } else {
                indicator.className = 'indicator offline';
                statusText.textContent = '⚫ OFFLINE';
            }
            
            document.getElementById('subscribers').textContent = data.performer.stats.subscriberCount || 0;
            document.getElementById('totalTips').textContent = '$' + (data.performer.stats.totalTips || 0).toLocaleString('es-CO');
            document.getElementById('showCount').textContent = data.performer.stats.showCount || 0;
            document.getElementById('currentPayPal').textContent = data.performer.paypalEmail;
            
            document.getElementById('tipMinAmount').value = data.performer.settings.tipMinAmount;
            document.getElementById('welcomeMessage').value = data.performer.settings.welcomeMessage;
            document.getElementById('tipMessage').value = data.performer.settings.tipMessage;
        }
        
        async function loadTips() {
            try {
                const response = await fetch('/api/tips');
                const tips = await response.json();
                
                const tipsList = document.getElementById('tipsList');
                tipsList.innerHTML = tips.map(tip => 
                    '<div class="tip-item">' +
                    '<strong>$' + tip.amount.toLocaleString('es-CO') + '</strong> - ' + tip.user.split('@')[0] + '<br>' +
                    '<small>' + tip.message + '</small><br>' +
                    '<small>' + new Date(tip.timestamp).toLocaleString('es-CO') + '</small> ' +
                    (tip.processed ? '<span class="success">✅ Pagado</span>' : '<span class="pending">⏳ Pendiente</span>') +
                    '</div>'
                ).join('') || '<p>No hay tips aún</p>';
            } catch (error) {
                console.error('Error cargando tips:', error);
            }
        }
        
        async function toggleLive() {
            try {
                await fetch('/api/toggle-live', { method: 'POST' });
                loadData();
            } catch (error) {
                console.error('Error:', error);
            }
        }
        
        async function updatePayPal() {
            const paypalEmail = document.getElementById('paypalEmail').value;
            const password = document.getElementById('paypalPassword').value;
            
            if (!paypalEmail || !password) {
                alert('Completa todos los campos');
                return;
            }
            
            try {
                const response = await fetch('/api/update-paypal', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ paypalEmail, password })
                });
                
                const result = await response.json();
                if (result.success) {
                    alert('PayPal actualizado exitosamente');
                    document.getElementById('paypalPassword').value = '';
                    loadData();
                } else {
                    alert('Error: ' + result.error);
                }
            } catch (error) {
                alert('Error actualizando PayPal');
            }
        }
        
        async function updateSettings() {
            const settings = {
                tipMinAmount: parseInt(document.getElementById('tipMinAmount').value),
                welcomeMessage: document.getElementById('welcomeMessage').value,
                tipMessage: document.getElementById('tipMessage').value
            };
            
            try {
                const response = await fetch('/api/update-settings', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ settings })
                });
                
                const result = await response.json();
                if (result.success) {
                    alert('Configuraciones guardadas');
                } else {
                    alert('Error guardando configuraciones');
                }
            } catch (error) {
                alert('Error actualizando configuraciones');
            }
        }
        
        function refreshData() {
            loadData();
        }
        
        // Cargar datos al inicio
        loadData();
        
        // Actualizar cada 30 segundos
        setInterval(loadData, 30000);
    </script>
</body>
</html>`;
    }
    
    generateAdminPanelHTML() {
        return `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Admin Panel - Multi-Performer Bot</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: linear-gradient(135deg, #dc2626 0%, #7c2d12 100%); min-height: 100vh; padding: 20px; }
        .container { max-width: 1000px; margin: 0 auto; }
        .header { text-align: center; color: white; margin-bottom: 30px; }
        .admin-panel { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; }
        .card { background: rgba(255,255,255,0.95); border-radius: 15px; padding: 25px; box-shadow: 0 8px 32px rgba(0,0,0,0.1); }
        .btn { background: #dc2626; color: white; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer; margin: 5px; }
        .btn:hover { background: #b91c1c; }
        .btn.success { background: #16a34a; }
        .btn.primary { background: #2563eb; }
        input, select, textarea { width: 100%; padding: 10px; margin: 5px 0; border: 1px solid #ddd; border-radius: 5px; }
        .performer-item { border: 1px solid #ddd; padding: 15px; margin: 10px 0; border-radius: 8px; }
        .performer-item.active { border-color: #16a34a; background-color: #f0fdf4; }
        .login-section { max-width: 400px; margin: 50px auto; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🔧 Admin Panel</h1>
            <p>Gestión Multi-Performer Bot</p>
            <a href="/performer" class="btn primary" style="text-decoration: none;">👤 Dashboard Performer</a>
        </div>
        
        <div id="loginSection" class="login-section card">
            <h3>🔐 Acceso Admin</h3>
            <input type="password" id="adminPassword" placeholder="Contraseña maestra">
            <button class="btn" onclick="adminLogin()">🔓 Iniciar Sesión</button>
        </div>
        
        <div id="adminContent" class="admin-panel" style="display: none;">
            <div class="card">
                <h3>👤 Crear Nuevo Performer</h3>
                <input type="text" id="newName" placeholder="Nombre del performer">
                <input type="email" id="newEmail" placeholder="Email del performer">
                <input type="email" id="newPayPal" placeholder="PayPal del performer">
                <button class="btn success" onclick="createPerformer()">👤 Crear Performer</button>
            </div>
            
            <div class="card">
                <h3>🔄 Cambiar Performer Activo</h3>
                <select id="performerSelect">
                    <option value="">Seleccionar performer...</option>
                </select>
                <button class="btn" onclick="switchPerformer()">🔄 Cambiar Performer</button>
            </div>
            
            <div class="card">
                <h3>📊 Performers Registrados</h3>
                <div id="performersList">Cargando...</div>
                <button class="btn primary" onclick="loadPerformers()">🔄 Actualizar Lista</button>
            </div>
        </div>
    </div>
    
    <script>
        let isLoggedIn = false;
        let adminPassword = '';
        
        async function adminLogin() {
            const password = document.getElementById('adminPassword').value;
            
            try {
                const response = await fetch('/api/admin/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ password })
                });
                
                const result = await response.json();
                if (result.success) {
                    isLoggedIn = true;
                    adminPassword = password;
                    document.getElementById('loginSection').style.display = 'none';
                    document.getElementById('adminContent').style.display = 'grid';
                    loadPerformers();
                } else {
                    alert('Contraseña incorrecta');
                }
            } catch (error) {
                alert('Error de conexión');
            }
        }
        
        async function createPerformer() {
            const name = document.getElementById('newName').value;
            const email = document.getElementById('newEmail').value;
            const paypalEmail = document.getElementById('newPayPal').value;
            
            if (!name || !email || !paypalEmail) {
                alert('Completa todos los campos');
                return;
            }
            
            try {
                const response = await fetch('/api/admin/create-performer', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ password: adminPassword, name, email, paypalEmail })
                });
                
                const result = await response.json();
                if (result.success) {
                    alert('Performer creado exitosamente');
                    document.getElementById('newName').value = '';
                    document.getElementById('newEmail').value = '';
                    document.getElementById('newPayPal').value = '';
                    loadPerformers();
                } else {
                    alert('Error: ' + result.error);
                }
            } catch (error) {
                alert('Error creando performer');
            }
        }
        
        async function switchPerformer() {
            const performerId = document.getElementById('performerSelect').value;
            
            if (!performerId) {
                alert('Selecciona un performer');
                return;
            }
            
            try {
                const response = await fetch('/api/admin/switch-performer', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ password: adminPassword, performerId })
                });
                
                const result = await response.json();
                if (result.success) {
                    alert('Performer cambiado a: ' + result.activePerformer);
                    loadPerformers();
                } else {
                    alert('Error: ' + result.error);
                }
            } catch (error) {
                alert('Error cambiando performer');
            }
        }
        
        async function loadPerformers() {
            try {
                const response = await fetch('/api/admin/performers');
                const performers = await response.json();
                
                // Actualizar select
                const select = document.getElementById('performerSelect');
                select.innerHTML = '<option value="">Seleccionar performer...</option>' +
                    performers.map(p => 
                        '<option value="' + p.id + '">' + p.name + (p.isActive ? ' (ACTIVO)' : '') + '</option>'
                    ).join('');
                
                // Actualizar lista
                const list = document.getElementById('performersList');
                list.innerHTML = performers.map(p => 
                    '<div class="performer-item' + (p.isActive ? ' active' : '') + '">' +
                    '<h4>' + p.name + (p.isActive ? ' 🟢 ACTIVO' : '') + '</h4>' +
                    '<p><strong>Email:</strong> ' + p.email + '</p>' +
                    '<p><strong>PayPal:</strong> ' + p.paypalEmail + '</p>' +
                    '<p><strong>Tips:</strong> $' + p.stats.totalTips.toLocaleString('es-CO') + ' | ' +
                    '<strong>Subs:</strong> ' + p.stats.subscriberCount + ' | ' +
                    '<strong>Shows:</strong> ' + p.stats.showCount + '</p>' +
                    '</div>'
                ).join('');
                
            } catch (error) {
                console.error('Error cargando performers:', error);
            }
        }
    </script>
</body>
</html>`;
    }
}

module.exports = Routes;