require('dotenv').config();

module.exports = {
    deepseekApiKey: process.env.DEEPSEEK_API_KEY,
    deepseekApiUrl: 'https://api.deepseek.com/v1/chat/completions',
    webPort: process.env.WEB_PORT || 3001,
    sessionTimeout: 2 * 60 * 60 * 1000, // 2 horas
    checkInterval: 60000, // 1 minuto
    maxMessages: 10, // Máximo de mensajes en contexto
    
    validateApiKey() {
        if (!this.deepseekApiKey || this.deepseekApiKey === 'tu_api_key_real_aqui') {
            console.error('⚠️  ERROR: No se ha configurado DEEPSEEK_API_KEY en el archivo .env');
            console.error('Por favor, crea un archivo .env y añade tu API key de DeepSeek');
            console.error('Ejemplo: DEEPSEEK_API_KEY=sk-xxxxxxxxxxxxx');
            process.exit(1);
        }
    }
};