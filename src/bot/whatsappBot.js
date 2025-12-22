const makeWASocket = require('baileys').default;
const { DisconnectReason, useMultiFileAuthState, makeCacheableSignalKeyStore, fetchLatestBaileysVersion } = require('baileys');
const qrcode = require('qrcode-terminal');
const pino = require('pino');
const config = require('../config/config');
const logger = require('../services/logger');
const aiService = require('../services/aiService');
const sessionManager = require('../services/sessionManager');
const promptLoader = require('../services/promptLoader');
const humanModeManager = require('../services/humanModeManager');

class WhatsAppBot {
    constructor() {
        this.sock = null;
        this.systemPrompt = promptLoader.getPrompt();
        this.currentQR = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 3;
        this.isReconnecting = false;
    }

    async start() {
        if (this.isReconnecting) {
            console.log('Ya hay un intento de reconexión en progreso...');
            return;
        }
        
        this.isReconnecting = true;
        console.log('Iniciando bot de WhatsApp con Baileys...');
        config.validateApiKey();
        
        try {
            // Configurar autenticación multi-archivo
            const { state, saveCreds } = await useMultiFileAuthState('./auth_baileys');
            
            // Obtener versión más reciente de Baileys
            const { version, isLatest } = await fetchLatestBaileysVersion();
            console.log(`Usando versión de WhatsApp Web: ${version.join('.')} (última: ${isLatest})`);
            
            // Store no es necesario en baileys v6
            
            // Crear socket de WhatsApp con configuración mejorada para producción
            this.sock = makeWASocket({
                version,
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' }))
                },
                printQRInTerminal: false,
                logger: pino({ level: 'silent' }),
                browser: ['Ubuntu', 'Chrome', '131.0.0'],
                generateHighQualityLinkPreview: false,
                syncFullHistory: false,
                getMessage: async () => {
                    return { conversation: 'No disponible' };
                },
                defaultQueryTimeoutMs: undefined,
                connectTimeoutMs: 60000,
                keepAliveIntervalMs: 30000,
                qrTimeout: undefined,
                markOnlineOnConnect: false
            });
            
        
        // Guardar credenciales cuando se actualicen
        this.sock.ev.on('creds.update', saveCreds);
        
        // Manejar actualizaciones de conexión
        this.sock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect, qr } = update;
            
            if (qr) {
                console.log('Escanea este código QR con WhatsApp:');
                console.log('O visita: http://tu-servidor:4242/qr');
                this.currentQR = qr;
                qrcode.generate(qr, { small: true });
            }
            
            if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
                console.log('Conexión cerrada debido a', lastDisconnect?.error, ', reconectando:', shouldReconnect);
                
                // Si es error 405, 401, 403, limpiar sesión y reiniciar
                if (statusCode === 405 || statusCode === 401 || statusCode === 403) {
                    this.reconnectAttempts++;

                    if (this.reconnectAttempts > this.maxReconnectAttempts) {
                        console.log('❌ Máximo de intentos de reconexión alcanzado. Por favor usa el botón de reiniciar sesión en /qr');
                        this.isReconnecting = false;
                        return;
                    }

                    console.log(`Error ${statusCode} detectado. Intento ${this.reconnectAttempts}/${this.maxReconnectAttempts}. Limpiando sesión...`);
                    this.clearSession();

                    this.isReconnecting = false;
                    setTimeout(() => this.start(), 5000);
                } else if (statusCode === 515) {
                    // Error 515: NO limpiar sesión, solo esperar y reconectar
                    this.reconnectAttempts++;
                    if (this.reconnectAttempts > 5) {
                        console.log('❌ Demasiados errores 515. Limpiando sesión...');
                        this.clearSession();
                        this.reconnectAttempts = 0;
                    }
                    console.log(`Error 515 (Stream Error). Reintentando en 15 segundos... (${this.reconnectAttempts}/5)`);
                    this.isReconnecting = false;
                    setTimeout(() => this.start(), 15000);
                } else if (shouldReconnect && statusCode !== DisconnectReason.loggedOut) {
                    this.reconnectAttempts = 0;
                    this.isReconnecting = false;
                    setTimeout(() => this.start(), 5000);
                } else {
                    this.isReconnecting = false;
                }
            } else if (connection === 'open') {
                console.log('¡Bot de WhatsApp conectado y listo!');
                this.currentQR = null;
                this.reconnectAttempts = 0;
                this.isReconnecting = false;
                logger.log('SYSTEM', 'Bot iniciado correctamente con Baileys');
                sessionManager.startCleanupTimer(this.sock);
            }
        });
        
        } catch (error) {
            console.error('Error iniciando bot:', error);
            this.isReconnecting = false;
            
            if (this.reconnectAttempts < this.maxReconnectAttempts) {
                this.reconnectAttempts++;
                console.log(`Reintentando en 5 segundos... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
                setTimeout(() => this.start(), 5000);
            }
        }
        
        // Manejar mensajes entrantes
        this.sock.ev.on('messages.upsert', async (m) => {
            try {
                const msg = m.messages[0];
                if (!msg.message) return;
                
                // Log para debugging
                console.log('Mensaje recibido - fromMe:', msg.key.fromMe, 'remoteJid:', msg.key.remoteJid);
                
                // Ignorar mensajes propios
                if (msg.key.fromMe) {
                    console.log('Ignorando mensaje propio');
                    return;
                }
                
                // Obtener el número del remitente
                const from = msg.key.remoteJid;
                const isGroup = from.endsWith('@g.us');
                const isLead = from.endsWith('@lid');

                // DEBUG: Log completo del mensaje para leads
                if (isLead) {
                    console.log('═══════════════════════════════════════════');
                    console.log('🔍 DEBUG LEAD - Estructura completa del mensaje:');
                    console.log('msg.key:', JSON.stringify(msg.key, null, 2));
                    console.log('msg.senderPn:', msg.senderPn);
                    console.log('msg.participant:', msg.participant);
                    console.log('msg.pushName:', msg.pushName);
                    console.log('msg.verifiedBizName:', msg.verifiedBizName);
                    console.log('Propiedades de msg:', Object.keys(msg));
                    console.log('msg completo:', JSON.stringify(msg, null, 2));
                    console.log('═══════════════════════════════════════════');
                }

                // Solo responder a mensajes privados
                if (isGroup) return;

                // Obtener el texto del mensaje
                const conversation = msg.message.conversation ||
                                   msg.message.extendedTextMessage?.text ||
                                   '';

                // Ignorar mensajes sin texto
                if (!conversation || conversation.trim() === '') {
                    console.log('Mensaje ignorado - Sin contenido de texto');
                    return;
                }

                // Extraer información del usuario
                // Para leads (@lid), obtener número real desde msg.key.senderPn
                let userId;
                if (isLead && msg.key.senderPn) {
                    userId = msg.key.senderPn.replace('@s.whatsapp.net', '');
                    console.log(`📱 Lead detectado - LID: ${from}, Número real: ${userId}`);
                } else if (isLead) {
                    // Si es lead pero no tiene senderPn, usar el LID como identificador
                    userId = from.replace('@lid', '');
                    console.log(`⚠️ Lead sin senderPn - usando LID: ${userId}`);
                } else {
                    userId = from.replace('@s.whatsapp.net', '');
                }
                const userName = msg.pushName || userId;
                
                await logger.log('cliente', conversation, userId, userName);
                
                // Verificar si está en modo humano o soporte
                const isHuman = await humanModeManager.isHumanMode(userId);
                const isSupport = await humanModeManager.isSupportMode(userId);
                
                if (isHuman || isSupport) {
                    const mode = isSupport ? 'SOPORTE' : 'HUMANO';
                    await logger.log('SYSTEM', `Mensaje ignorado - Modo ${mode} activo para ${userName} (${userId})`);
                    return;
                }
                
                // Procesar mensaje y generar respuesta
                const response = await this.processMessage(userId, conversation, from);
                
                // Enviar respuesta
                await this.sock.sendMessage(from, { text: response });
                await logger.log('bot', response, userId, userName);
                
            } catch (error) {
                await this.handleError(error, m.messages[0]);
            }
        });
    }
    
    async processMessage(userId, userMessage, chatId) {
        // Agregar mensaje del usuario a la sesión
        await sessionManager.addMessage(userId, 'user', userMessage, chatId);
        
        // Preparar mensajes para la IA
        const messages = [
            { role: 'system', content: this.systemPrompt },
            ...(await sessionManager.getMessages(userId, chatId))
        ];
        
        // Generar respuesta con IA
        const aiResponse = await aiService.generateResponse(messages);
        
        // Verificar si la respuesta contiene el marcador de activar soporte
        if (aiResponse.includes('{{ACTIVAR_SOPORTE}}')) {
            // Remover el marcador de la respuesta
            const cleanResponse = aiResponse.replace('{{ACTIVAR_SOPORTE}}', '').trim();
            
            // Activar modo soporte
            await humanModeManager.setMode(userId, 'support');
            await sessionManager.updateSessionMode(userId, chatId, 'support');
            
            // Agregar respuesta limpia a la sesión
            await sessionManager.addMessage(userId, 'assistant', cleanResponse, chatId);
            
            // Registrar en logs
            await logger.log('SYSTEM', `Modo SOPORTE activado automáticamente para ${userId}`);
            
            return cleanResponse;
        }
        
        // Agregar respuesta de IA a la sesión
        await sessionManager.addMessage(userId, 'assistant', aiResponse, chatId);
        
        return aiResponse;
    }
    
    async handleError(error, message) {
        console.error('Error procesando mensaje:', error);

        const from = message.key.remoteJid;
        const isLead = from.endsWith('@lid');
        let userId;
        if (isLead && message.key.senderPn) {
            userId = message.key.senderPn.replace('@s.whatsapp.net', '');
        } else if (isLead) {
            userId = from.replace('@lid', '');
        } else {
            userId = from.replace('@s.whatsapp.net', '');
        }
        
        let errorMessage = 'Lo siento, ocurrió un error. Inténtalo de nuevo.';
        
        if (error.message.includes('autenticación') || error.message.includes('API key')) {
            errorMessage = 'Error de configuración del bot. Por favor, contacta al administrador.';
        }
        
        try {
            await this.sock.sendMessage(from, { text: errorMessage });
            logger.log('ERROR', error.message, userId);
        } catch (sendError) {
            console.error('Error enviando mensaje de error:', sendError);
        }
    }
    
    async stop() {
        console.log('Cerrando bot...');
        if (this.sock) {
            this.sock.end();
        }
    }
    
    async clearSession() {
        const fs = require('fs').promises;
        const path = require('path');
        const authPath = path.join(process.cwd(), 'auth_baileys');
        
        try {
            await fs.rm(authPath, { recursive: true, force: true });
            console.log('Sesión eliminada correctamente');
        } catch (err) {
            console.log('No había sesión previa o ya fue eliminada');
        }
    }
    
    async logout() {
        console.log('Cerrando sesión de WhatsApp...');
        try {
            this.reconnectAttempts = 0;
            this.isReconnecting = false;
            
            if (this.sock) {
                try {
                    await this.sock.logout();
                } catch (err) {
                    console.log('Error al hacer logout:', err.message);
                }
            }
            
            await this.clearSession();
            
            // Reiniciar el bot para generar nuevo QR
            setTimeout(() => this.start(), 2000);
            return true;
        } catch (error) {
            console.error('Error al cerrar sesión:', error);
            return false;
        }
    }
}

module.exports = WhatsAppBot;