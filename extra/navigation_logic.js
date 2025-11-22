/**
 * navigation_logic.js
 * Lógica de navegación que convierte detecciones en instrucciones de movimiento
 * Prioriza obstáculos cercanos y peligrosos
 */

class NavigationLogic {
    constructor() {
        this.frameWidth = 640; // Ancho estándar del frame
        this.frameHeight = 480; // Alto estándar del frame
        this.dangerZone = 0.3; // 30% del frame = zona de peligro cercano
        this.lastInstruction = null;
        this.instructionCooldown = 2000; // 2 segundos entre instrucciones similares
        this.lastInstructionTime = {};
    }

    /**
     * Procesa las detecciones y genera instrucciones de navegación
     * @param {Array} detections - Array de detecciones del detector
     * @param {number} frameWidth - Ancho del frame
     * @param {number} frameHeight - Alto del frame
     * @returns {Object} Instrucción de navegación con texto y prioridad
     */
    processDetections(detections, frameWidth = 640, frameHeight = 480) {
        this.frameWidth = frameWidth;
        this.frameHeight = frameHeight;
        
        if (!detections || detections.length === 0) {
            return null;
        }

        // Categorizar detecciones
        const trafficLights = detections.filter(d => d.type === 'traffic_light');
        const crosswalks = detections.filter(d => d.type === 'crosswalk');
        const obstacles = detections.filter(d => d.type === 'obstacle');

        // Prioridad 1: Semáforos (máxima prioridad)
        if (trafficLights.length > 0) {
            const instruction = this.processTrafficLight(trafficLights[0]);
            if (instruction) return instruction;
        }

        // Prioridad 2: Obstáculos cercanos y peligrosos
        const dangerousObstacles = this.getDangerousObstacles(obstacles);
        if (dangerousObstacles.length > 0) {
            const instruction = this.processObstacles(dangerousObstacles);
            if (instruction) return instruction;
        }

        // Prioridad 3: Pasos de peatones
        if (crosswalks.length > 0) {
            const instruction = this.processCrosswalk(crosswalks[0]);
            if (instruction) return instruction;
        }

        return null;
    }

    /**
     * Procesa detección de semáforo
     */
    processTrafficLight(trafficLight) {
        const state = trafficLight.state || 'unknown';
        const confidence = trafficLight.confidence || 0;
        
        // Solo procesar si la confianza es suficiente
        if (confidence < 0.4) {
            return null;
        }

        let instruction = null;

        switch (state) {
            case 'red':
                instruction = {
                    text: '⚠️ Semáforo en rojo. Espera antes de cruzar.',
                    priority: 10,
                    type: 'traffic_light',
                    action: 'stop'
                };
                break;
            case 'yellow':
                instruction = {
                    text: '⚠️ Semáforo en amarillo. Ten precaución.',
                    priority: 9,
                    type: 'traffic_light',
                    action: 'caution'
                };
                break;
            case 'green':
                instruction = {
                    text: '✅ Semáforo en verde. Puedes cruzar con precaución.',
                    priority: 8,
                    type: 'traffic_light',
                    action: 'go'
                };
                break;
            default:
                instruction = {
                    text: '🔴 Semáforo detectado. Verifica el estado antes de cruzar.',
                    priority: 7,
                    type: 'traffic_light',
                    action: 'check'
                };
        }

        return this.checkCooldown(instruction);
    }

    /**
     * Procesa detección de obstáculos
     */
    processObstacles(obstacles) {
        if (obstacles.length === 0) return null;

        // Analizar posición de obstáculos
        const centerX = this.frameWidth / 2;
        const obstaclesLeft = [];
        const obstaclesRight = [];
        const obstaclesCenter = [];

        obstacles.forEach(obs => {
            const [x, y, w, h] = obs.bbox;
            const centerObstacleX = x + w / 2;
            const distance = this.calculateDistance(obs.bbox);

            // Categorizar por posición
            if (centerObstacleX < centerX - this.frameWidth * 0.15) {
                obstaclesLeft.push({ ...obs, distance });
            } else if (centerObstacleX > centerX + this.frameWidth * 0.15) {
                obstaclesRight.push({ ...obs, distance });
            } else {
                obstaclesCenter.push({ ...obs, distance });
            }
        });

        // Prioridad: obstáculos en el centro (más peligrosos)
        if (obstaclesCenter.length > 0) {
            const closest = obstaclesCenter.reduce((prev, curr) => 
                curr.distance < prev.distance ? curr : prev
            );
            
            return this.checkCooldown({
                text: `⚠️ Obstáculo ${closest.classEs} directamente adelante. Detente o busca una ruta alternativa.`,
                priority: 9,
                type: 'obstacle',
                action: 'stop',
                direction: 'center'
            });
        }

        // Obstáculos a los lados
        if (obstaclesLeft.length > 0 && obstaclesRight.length > 0) {
            // Obstáculos en ambos lados
            return this.checkCooldown({
                text: '⚠️ Obstáculos a ambos lados. Continúa con precaución.',
                priority: 7,
                type: 'obstacle',
                action: 'caution',
                direction: 'both'
            });
        } else if (obstaclesLeft.length > 0) {
            const closest = obstaclesLeft.reduce((prev, curr) => 
                curr.distance < prev.distance ? curr : prev
            );
            
            return this.checkCooldown({
                text: `Obstáculo ${closest.classEs} a la izquierda. Muévete ligeramente a la derecha.`,
                priority: 6,
                type: 'obstacle',
                action: 'move_right',
                direction: 'left'
            });
        } else if (obstaclesRight.length > 0) {
            const closest = obstaclesRight.reduce((prev, curr) => 
                curr.distance < prev.distance ? curr : prev
            );
            
            return this.checkCooldown({
                text: `Obstáculo ${closest.classEs} a la derecha. Muévete ligeramente a la izquierda.`,
                priority: 6,
                type: 'obstacle',
                action: 'move_left',
                direction: 'right'
            });
        }

        return null;
    }

    /**
     * Procesa detección de paso de peatones
     */
    processCrosswalk(crosswalk) {
        const confidence = crosswalk.confidence || 0;
        
        if (confidence < 0.3) {
            return null;
        }

        return this.checkCooldown({
            text: '🚶 Paso de peatones detectado. Verifica el tráfico antes de cruzar.',
            priority: 5,
            type: 'crosswalk',
            action: 'caution'
        });
    }

    /**
     * Obtiene obstáculos peligrosos (cercanos y grandes)
     */
    getDangerousObstacles(obstacles) {
        return obstacles.filter(obs => {
            const [x, y, w, h] = obs.bbox;
            
            // Calcular distancia aproximada basada en tamaño
            const area = w * h;
            const frameArea = this.frameWidth * this.frameHeight;
            const relativeSize = area / frameArea;
            
            // Obstáculo grande = cercano
            const isClose = relativeSize > 0.05; // Más del 5% del frame
            
            // Obstáculo en zona de peligro (parte inferior del frame)
            const isInDangerZone = y + h > this.frameHeight * (1 - this.dangerZone);
            
            // Alta confianza
            const isConfident = obs.confidence > 0.6;
            
            return (isClose || isInDangerZone) && isConfident;
        });
    }

    /**
     * Calcula distancia aproximada basada en tamaño del bounding box
     */
    calculateDistance(bbox) {
        const [x, y, w, h] = bbox;
        const area = w * h;
        const frameArea = this.frameWidth * this.frameHeight;
        const relativeSize = area / frameArea;
        
        // Tamaño relativo inversamente proporcional a distancia
        // Más grande = más cercano
        return 1 / (relativeSize + 0.01); // Evitar división por cero
    }

    /**
     * Verifica cooldown para evitar instrucciones repetitivas
     */
    checkCooldown(instruction) {
        const now = Date.now();
        const key = `${instruction.type}_${instruction.action}`;
        
        if (this.lastInstructionTime[key]) {
            const timeSince = now - this.lastInstructionTime[key];
            if (timeSince < this.instructionCooldown && instruction.priority < 9) {
                // Solo ignorar si no es de alta prioridad
                return null;
            }
        }
        
        this.lastInstructionTime[key] = now;
        return instruction;
    }

    /**
     * Resetea el estado de la lógica de navegación
     */
    reset() {
        this.lastInstruction = null;
        this.lastInstructionTime = {};
    }
}

// Exportar instancia global
const navigationLogic = new NavigationLogic();

