const axios = require('axios');
const config = require('../config/config');
const vacancyService = require('./vacancyService').default;

// Limpiar caché al inicializar
if (vacancyService.initialize) {
    vacancyService.initialize();
}

class AIService {
    constructor() {
        this.apiKey = config.deepseekApiKey;
        this.apiUrl = config.deepseekApiUrl;
    }

    async generateResponse(messages) {
        try {
            // Incluir datos enriquecidos en el prompt del sistema
            const enrichedMessages = await this.addEnrichedDataToSystemPrompt(messages);

            const response = await axios.post(this.apiUrl, {
                model: 'deepseek-chat',
                messages: enrichedMessages,
                max_tokens: 1000,
                temperature: 0.5
            }, {
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json'
                }
            });

            return response.data.choices[0].message.content;
        } catch (error) {
            console.error('Error con DeepSeek API:', error.response?.data || error.message);

            if (error.response?.data?.error?.type === 'authentication_error') {
                throw new Error('Error de autenticación con API key');
            }

            throw new Error('Error generando respuesta de IA');
        }
    }

    async addEnrichedDataToSystemPrompt(messages) {
        try {
            // Clonar mensajes
            const enrichedMessages = [...messages];
            const systemMessage = enrichedMessages.find(m => m.role === 'system');

            if (!systemMessage) {
                return messages;
            }

            // SIEMPRE agregar información actualizada de vacantes al contexto
            // según las instrucciones del prompt (líneas 125-137)
            const vacancies = await vacancyService.getVacancies();
            const vacancyData = vacancyService.formatVacanciesForAI(vacancies);

            console.log('💼 Vacantes obtenidas para AI:', vacancies.length);

            systemMessage.content = systemMessage.content + `\n\n[INFORMACIÓN ACTUALIZADA DE VACANTES]\n${vacancyData}\n\nIMPORTANTE: Usa ÚNICAMENTE la información de vacantes proporcionada arriba. NO inventes puestos, salarios o requisitos. Si no hay vacantes disponibles o si la información solicitada no está en los datos proporcionados, indícalo claramente al candidato.`;

            console.log('💼 Información de vacantes agregada al contexto');

            return enrichedMessages;
        } catch (error) {
            console.error('Error agregando datos enriquecidos al prompt:', error);
            return messages;
        }
    }

    detectVacancyIntent(message) {
        const vacancyKeywords = [
            'vacante', 'trabajo', 'empleo', 'puesto', 'contratar', 'contratación',
            'trabajar', 'empleos', 'oportunidad', 'oportunidades', 'busco trabajo',
            'necesito trabajo', 'hay trabajo', 'están contratando', 'requisitos',
            'salario', 'sueldo', 'horario', 'turno', 'disponible', 'disponibles',
            'plaza', 'plazas', 'personal', 'reclutamiento', 'cv', 'currículum'
        ];

        const lowerMessage = message.toLowerCase();
        return vacancyKeywords.some(keyword => lowerMessage.includes(keyword));
    }
}

module.exports = new AIService();