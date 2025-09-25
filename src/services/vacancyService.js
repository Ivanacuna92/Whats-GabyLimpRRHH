import axios from 'axios';

class VacancyService {
    constructor() {
        this.apiUrl = 'https://gabylimp.aloia.dev/api/vacantes';
        this.cache = null;
        this.cacheTime = null;
        this.cacheExpiry = 5 * 60 * 1000; // 5 minutos de caché
    }

    async getVacancies() {
        try {
            // Verificar si tenemos caché válido
            if (this.cache && this.cacheTime && (Date.now() - this.cacheTime < this.cacheExpiry)) {
                console.log('📋 Usando caché de vacantes');
                return this.cache;
            }

            console.log('🔄 Consultando vacantes desde API...');
            const response = await axios.get(this.apiUrl, {
                timeout: 10000,
                headers: {
                    'User-Agent': 'GabyLimp-WhatsApp-Bot/1.0',
                    'Accept': 'application/json'
                }
            });

            // Guardar en caché
            this.cache = response.data;
            this.cacheTime = Date.now();

            console.log(`✅ ${response.data.length || 0} vacantes obtenidas`);
            return response.data;

        } catch (error) {
            console.error('❌ Error al obtener vacantes:', error.message);

            // Si hay caché, devolverlo aunque esté expirado
            if (this.cache) {
                console.log('⚠️ Usando caché de respaldo');
                return this.cache;
            }

            // Devolver array vacío si no hay caché
            return [];
        }
    }

    formatVacanciesForAI(vacancies) {
        if (!vacancies || vacancies.length === 0) {
            return "No hay vacantes disponibles en este momento.";
        }

        let formatted = "VACANTES DISPONIBLES:\n\n";

        vacancies.forEach((vacancy, index) => {
            formatted += `${index + 1}. ${vacancy.Puesto || vacancy.puesto || 'Puesto sin especificar'}\n`;

            if (vacancy.descripcion || vacancy.Descripcion) {
                formatted += `   Descripción: ${vacancy.descripcion || vacancy.Descripcion}\n`;
            }

            if (vacancy.requisitos || vacancy.Requisitos) {
                formatted += `   Requisitos: ${vacancy.requisitos || vacancy.Requisitos}\n`;
            }

            if (vacancy.Ubicacion || vacancy.ubicacion) {
                formatted += `   Ubicación: ${vacancy.Ubicacion || vacancy.ubicacion}\n`;
            }

            if (vacancy.Sueldo || vacancy.salario) {
                formatted += `   Salario: ${vacancy.Sueldo || vacancy.salario}\n`;
            }

            if (vacancy.Horario || vacancy.horario) {
                formatted += `   Horario: ${vacancy.Horario || vacancy.horario}\n`;
            }

            if (vacancy.beneficios || vacancy.Beneficios) {
                formatted += `   Beneficios: ${vacancy.beneficios || vacancy.Beneficios}\n`;
            }

            formatted += '\n';
        });

        return formatted;
    }

    async searchVacancy(keywords) {
        const vacancies = await this.getVacancies();

        if (!keywords || keywords.length === 0) {
            return vacancies;
        }

        const keywordLower = keywords.toLowerCase();

        return vacancies.filter(vacancy => {
            const searchableText = `
                ${vacancy.Puesto || vacancy.puesto || ''}
                ${vacancy.Descripcion || vacancy.descripcion || ''}
                ${vacancy.Requisitos || vacancy.requisitos || ''}
                ${vacancy.Ubicacion || vacancy.ubicacion || ''}
            `.toLowerCase();

            return searchableText.includes(keywordLower);
        });
    }

    clearCache() {
        this.cache = null;
        this.cacheTime = null;
        console.log('🗑️ Caché de vacantes limpiado');
    }

    // Método para forzar limpieza al inicializar
    initialize() {
        console.log('🔄 Inicializando VacancyService - Limpiando caché...');
        this.clearCache();
    }
}

export default new VacancyService();