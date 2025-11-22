/**
 * object_detector.js
 * Módulo de detección de objetos usando TensorFlow.js y COCO-SSD
 * Detecta semáforos, pasos de peatones, obstáculos y otros objetos relevantes
 */

class ObjectDetector {
    constructor() {
        this.model = null;
        this.isModelLoaded = false;
        this.processingInterval = null;
        this.lastProcessTime = 0;
        this.minProcessInterval = 500; // Procesar cada 500ms (2 FPS)
        
        // Categorías de objetos que nos interesan
        this.relevantClasses = {
            // Obstáculos
            'person': 'persona',
            'car': 'auto',
            'truck': 'camion',
            'bus': 'autobus',
            'motorcycle': 'motocicleta',
            'bicycle': 'bicicleta',
            'umbrella': 'paraguas',
            'backpack': 'mochila',
            'handbag': 'bolso',
            'suitcase': 'maleta',
            // Semáforos y señales (COCO-SSD no tiene semáforos, usaremos detección de color)
            'traffic light': 'semáforo',
            'stop sign': 'señal de alto',
            // Pasos de peatones (detectaremos por patrones)
            'crosswalk': 'paso de peatones'
        };
    }

    /**
     * Carga el modelo COCO-SSD
     */
    async loadModel() {
        try {
            this.log('Cargando modelo de detección de objetos...');
            
            // Cargar modelo COCO-SSD desde TensorFlow.js
            this.model = await cocoSsd.load({
                base: 'mobilenet_v2', // Modelo más rápido para MVP
                modelUrl: undefined // Usar modelo preentrenado desde CDN
            });
            
            this.isModelLoaded = true;
            this.log('✅ Modelo cargado exitosamente', 'success');
            return true;
        } catch (error) {
            this.log(`❌ Error al cargar el modelo: ${error.message}`, 'error');
            this.isModelLoaded = false;
            return false;
        }
    }

    /**
     * Detecta objetos en un frame de video
     * @param {HTMLVideoElement|HTMLImageElement|HTMLCanvasElement} element - Elemento de video/imagen
     * @returns {Promise<Array>} Array de detecciones con bounding boxes, clase y confianza
     */
    async predict(element) {
        if (!this.isModelLoaded || !this.model) {
            this.log('⚠️ Modelo no cargado aún', 'error');
            return [];
        }

        // Limitar frecuencia de procesamiento para mejor rendimiento
        const now = Date.now();
        if (now - this.lastProcessTime < this.minProcessInterval) {
            return [];
        }
        this.lastProcessTime = now;

        try {
            // Realizar predicción
            const predictions = await this.model.detect(element);
            
            // Filtrar y categorizar detecciones relevantes
            const relevantDetections = this.filterRelevantDetections(predictions);
            
            // Detectar semáforos por color (ya que COCO-SSD no los detecta bien)
            const trafficLights = await this.detectTrafficLights(element);
            relevantDetections.push(...trafficLights);
            
            // Detectar pasos de peatones (detección básica por patrones)
            const crosswalks = await this.detectCrosswalks(element);
            relevantDetections.push(...crosswalks);
            
            return relevantDetections;
        } catch (error) {
            this.log(`Error en predicción: ${error.message}`, 'error');
            return [];
        }
    }

    /**
     * Filtra detecciones relevantes para navegación
     */
    filterRelevantDetections(predictions) {
        return predictions
            .filter(pred => {
                // Filtrar por confianza mínima
                if (pred.score < 0.5) return false;
                
                // Filtrar por clases relevantes
                const className = pred.class.toLowerCase();
                return Object.keys(this.relevantClasses).some(
                    key => className.includes(key)
                );
            })
            .map(pred => ({
                bbox: pred.bbox, // [x, y, width, height]
                class: pred.class,
                classEs: this.relevantClasses[pred.class.toLowerCase()] || pred.class,
                confidence: pred.score,
                type: this.categorizeObject(pred.class)
            }));
    }

    /**
     * Categoriza objetos en tipos: obstacle, traffic_light, crosswalk
     */
    categorizeObject(className) {
        const lowerClass = className.toLowerCase();
        
        if (lowerClass.includes('traffic') || lowerClass.includes('light')) {
            return 'traffic_light';
        }
        if (lowerClass.includes('crosswalk') || lowerClass.includes('zebra')) {
            return 'crosswalk';
        }
        if (['person', 'car', 'truck', 'bus', 'motorcycle', 'bicycle', 
             'umbrella', 'backpack', 'handbag', 'suitcase'].includes(lowerClass)) {
            return 'obstacle';
        }
        
        return 'other';
    }

    /**
     * Detecta semáforos por color (detección básica)
     * Busca círculos rojos, amarillos y verdes en la parte superior del frame
     */
    async detectTrafficLights(videoElement) {
        // Crear canvas temporal para análisis
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = videoElement.videoWidth || videoElement.width;
        canvas.height = videoElement.videoHeight || videoElement.height;
        
        ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
        
        // Analizar región superior del frame (donde suelen estar los semáforos)
        const topRegion = ctx.getImageData(0, 0, canvas.width, canvas.height * 0.3);
        const imageData = topRegion.data;
        
        const detections = [];
        let redPixels = 0;
        let yellowPixels = 0;
        let greenPixels = 0;
        
        // Contar píxeles de colores de semáforo
        for (let i = 0; i < imageData.length; i += 4) {
            const r = imageData[i];
            const g = imageData[i + 1];
            const b = imageData[i + 2];
            
            // Rojo (semáforo rojo)
            if (r > 200 && g < 100 && b < 100) {
                redPixels++;
            }
            // Amarillo (semáforo amarillo)
            else if (r > 200 && g > 150 && b < 100) {
                yellowPixels++;
            }
            // Verde (semáforo verde)
            else if (r < 100 && g > 200 && b < 100) {
                greenPixels++;
            }
        }
        
        const totalPixels = imageData.length / 4;
        const threshold = totalPixels * 0.001; // 0.1% de píxeles del color
        
        // Si detectamos suficiente cantidad de un color, asumimos semáforo
        if (redPixels > threshold) {
            detections.push({
                bbox: [canvas.width * 0.4, 0, canvas.width * 0.2, canvas.height * 0.15],
                class: 'traffic light',
                classEs: 'semáforo',
                confidence: Math.min(0.9, redPixels / threshold / 10),
                type: 'traffic_light',
                state: 'red'
            });
        } else if (yellowPixels > threshold) {
            detections.push({
                bbox: [canvas.width * 0.4, 0, canvas.width * 0.2, canvas.height * 0.15],
                class: 'traffic light',
                classEs: 'semáforo',
                confidence: Math.min(0.9, yellowPixels / threshold / 10),
                type: 'traffic_light',
                state: 'yellow'
            });
        } else if (greenPixels > threshold) {
            detections.push({
                bbox: [canvas.width * 0.4, 0, canvas.width * 0.2, canvas.height * 0.15],
                class: 'traffic light',
                classEs: 'semáforo',
                confidence: Math.min(0.9, greenPixels / threshold / 10),
                type: 'traffic_light',
                state: 'green'
            });
        }
        
        return detections;
    }

    /**
     * Detecta pasos de peatones por patrones de líneas (detección básica)
     */
    async detectCrosswalks(videoElement) {
        // Para MVP, detectamos líneas horizontales en la parte inferior del frame
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = videoElement.videoWidth || videoElement.width;
        canvas.height = videoElement.videoHeight || videoElement.height;
        
        ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
        
        // Analizar región inferior (donde suelen estar los pasos de peatones)
        const bottomRegion = ctx.getImageData(0, canvas.height * 0.7, canvas.width, canvas.height * 0.3);
        const imageData = bottomRegion.data;
        
        // Buscar patrones de líneas blancas/amarillas alternadas
        // (Implementación simplificada para MVP)
        let whiteLineCount = 0;
        
        for (let y = 0; y < bottomRegion.height; y += 5) {
            let linePixels = 0;
            for (let x = 0; x < bottomRegion.width; x++) {
                const idx = (y * bottomRegion.width + x) * 4;
                const r = imageData[idx];
                const g = imageData[idx + 1];
                const b = imageData[idx + 2];
                
                // Blanco o amarillo (líneas de paso de peatones)
                if ((r > 200 && g > 200 && b > 200) || (r > 200 && g > 200 && b < 100)) {
                    linePixels++;
                }
            }
            
            if (linePixels > bottomRegion.width * 0.3) {
                whiteLineCount++;
            }
        }
        
        // Si hay varias líneas horizontales, probablemente es un paso de peatones
        if (whiteLineCount >= 3) {
            return [{
                bbox: [0, canvas.height * 0.7, canvas.width, canvas.height * 0.3],
                class: 'crosswalk',
                classEs: 'paso de peatones',
                confidence: Math.min(0.8, whiteLineCount / 10),
                type: 'crosswalk'
            }];
        }
        
        return [];
    }

    /**
     * Logging helper
     */
    log(message, type = 'info') {
        console.log(`[ObjectDetector] ${message}`);
        
        const logsDiv = document.getElementById('logs');
        if (logsDiv) {
            const logEntry = document.createElement('div');
            logEntry.className = `log-entry ${type}`;
            logEntry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
            logsDiv.insertBefore(logEntry, logsDiv.firstChild);
            
            // Limitar logs
            while (logsDiv.children.length > 20) {
                logsDiv.removeChild(logsDiv.lastChild);
            }
        }
    }
}

// Exportar instancia global
const objectDetector = new ObjectDetector();

