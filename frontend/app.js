/**
 * app.js - Script principal del frontend
 * Captura frames de la cámara, los envía al backend y reproduce instrucciones de voz
 */

// Configuración
const CONFIG = {
    captureInterval: 500, // Capturar frame cada 500ms (2 FPS)
    serverUrl: 'http://localhost:8000',
    minConfidence: 0.5
};

// Estado de la aplicación
const state = {
    video: null,
    canvas: null,
    ctx: null,
    stream: null,
    isRunning: false,
    captureInterval: null,
    lastInstruction: null,
    lastInstructionTime: 0,
    instructionCooldown: 2000 // 2 segundos entre instrucciones similares
};

// Inicialización cuando el DOM está listo
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
});

/**
 * Inicializa la aplicación
 */
function initializeApp() {
    // Obtener referencias a elementos
    state.video = document.getElementById('video');
    state.canvas = document.getElementById('canvas');
    state.ctx = state.canvas.getContext('2d');
    
    // Botones
    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');
    const toggleLogsBtn = document.getElementById('toggleLogs');
    
    // Event listeners
    startBtn.addEventListener('click', startCopilot);
    stopBtn.addEventListener('click', stopCopilot);
    toggleLogsBtn.addEventListener('click', toggleLogs);
    
    // Configuración del servidor
    const serverUrlInput = document.getElementById('serverUrl');
    serverUrlInput.addEventListener('change', (e) => {
        CONFIG.serverUrl = e.target.value;
        log(`URL del servidor actualizada: ${CONFIG.serverUrl}`);
    });
    
    // Verificar soporte de Web Speech API
    if (!('speechSynthesis' in window)) {
        showError('Tu navegador no soporta síntesis de voz. Usa Chrome, Edge o Safari.');
    }
    
    log('✅ Aplicación inicializada');
}

/**
 * Inicia el copiloto
 */
async function startCopilot() {
    try {
        log('🚀 Iniciando copiloto...');

        // Verificar que navigator.mediaDevices está disponible
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            const isHttps = window.location.protocol === 'https:';
            const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

            if (!isHttps && !isLocalhost) {
                throw new Error('La cámara solo funciona con HTTPS. Accede a la aplicación usando HTTPS o localhost.');
            } else {
                throw new Error('Tu navegador no soporta acceso a la cámara. Usa Chrome, Firefox o Safari moderno.');
            }
        }

        // Solicitar acceso a la cámara
        state.stream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: 640 },
                height: { ideal: 480 },
                facingMode: 'user' // Cámara frontal
            },
            audio: false
        });
        
        // Conectar stream al video
        state.video.srcObject = state.stream;
        
        // Esperar a que el video esté listo
        state.video.addEventListener('loadedmetadata', () => {
            // Configurar canvas con las mismas dimensiones que el video
            const videoWidth = state.video.videoWidth || 640;
            const videoHeight = state.video.videoHeight || 480;
            
            state.canvas.width = videoWidth;
            state.canvas.height = videoHeight;
            
            log(`📹 Video configurado: ${videoWidth}x${videoHeight}`);
            log(`🖼️ Canvas configurado: ${state.canvas.width}x${state.canvas.height}`);
            
            // Iniciar captura de frames
            state.isRunning = true;
            state.captureInterval = setInterval(captureAndProcess, CONFIG.captureInterval);
            
            // Actualizar UI
            document.getElementById('startBtn').disabled = true;
            document.getElementById('stopBtn').disabled = false;
            updateStatus('✅ Copiloto activo - Procesando...');
            
            log('✅ Copiloto iniciado correctamente');
        }, { once: true });
        
        // También escuchar cuando el video esté listo para reproducir
        state.video.addEventListener('canplay', () => {
            log('▶️ Video listo para reproducir');
        });
        
    } catch (error) {
        log(`❌ Error al acceder a la cámara: ${error.message}`, 'error');
        showError(`No se pudo acceder a la cámara: ${error.message}`);
    }
}

/**
 * Detiene el copiloto
 */
function stopCopilot() {
    log('⏹ Deteniendo copiloto...');
    
    state.isRunning = false;
    
    // Detener captura
    if (state.captureInterval) {
        clearInterval(state.captureInterval);
        state.captureInterval = null;
    }
    
    // Detener stream
    if (state.stream) {
        state.stream.getTracks().forEach(track => track.stop());
        state.stream = null;
    }
    
    // Limpiar video
    state.video.srcObject = null;
    
    // Limpiar canvas
    state.ctx.clearRect(0, 0, state.canvas.width, state.canvas.height);
    
    // Actualizar UI
    document.getElementById('startBtn').disabled = false;
    document.getElementById('stopBtn').disabled = true;
    updateStatus('Copiloto detenido');
    
    // Detener síntesis de voz
    if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
    }
    
    log('✅ Copiloto detenido');
}

/**
 * Captura un frame y lo procesa
 */
async function captureAndProcess() {
    if (!state.isRunning || !state.video) {
        return;
    }
    
    // Verificar que el video esté listo
    if (state.video.readyState !== state.video.HAVE_ENOUGH_DATA) {
        log('⏳ Esperando datos del video...', 'info');
        return;
    }
    
    // Verificar que el canvas esté configurado
    if (state.canvas.width === 0 || state.canvas.height === 0) {
        log('⏳ Configurando canvas...', 'info');
        state.canvas.width = state.video.videoWidth || 640;
        state.canvas.height = state.video.videoHeight || 480;
        return;
    }
    
    try {
        // Dibujar frame en canvas
        state.ctx.drawImage(state.video, 0, 0, state.canvas.width, state.canvas.height);
        
        // Convertir canvas a blob
        state.canvas.toBlob(async (blob) => {
            if (!blob) {
                log('❌ No se pudo crear blob del frame', 'error');
                return;
            }
            
            log(`📤 Enviando frame (${blob.size} bytes)`, 'info');
            
            // Enviar al backend
            await sendFrameToBackend(blob);
        }, 'image/jpeg', 0.8);
        
    } catch (error) {
        log(`❌ Error al capturar frame: ${error.message}`, 'error');
    }
}

/**
 * Envía frame al backend para procesamiento
 */
async function sendFrameToBackend(blob) {
    try {
        const formData = new FormData();
        formData.append('file', blob, 'frame.jpg');
        
        log(`📡 Enviando a ${CONFIG.serverUrl}/predict`, 'info');
        
        const response = await fetch(`${CONFIG.serverUrl}/predict`, {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            log(`❌ HTTP error ${response.status}: ${errorText}`, 'error');
            throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
        }
        
        const data = await response.json();
        
        log(`✅ Respuesta recibida: ${data.detections?.length || 0} detecciones`, 'success');
        
        // Procesar respuesta
        processResponse(data);
        
    } catch (error) {
        log(`❌ Error al enviar frame: ${error.message}`, 'error');
        
        // Si el servidor no está disponible, mostrar mensaje
        if (error.message.includes('Failed to fetch') || 
            error.message.includes('NetworkError') ||
            error.message.includes('fetch')) {
            updateStatus('❌ No se puede conectar al servidor. Verifica que esté ejecutándose en ' + CONFIG.serverUrl);
        } else {
            updateStatus(`❌ Error: ${error.message}`);
        }
    }
}

/**
 * Procesa la respuesta del backend
 */
function processResponse(data) {
    if (!data.success) {
        return;
    }
    
    // Dibujar zona segura y bounding boxes en canvas
    drawDetections(data.detections, data.safe_zone);
    
    // Actualizar lista de detecciones
    updateDetectionsList(data.detections, data.safe_zone);
    
    // Procesar instrucción
    if (data.instruction) {
        const instruction = data.instruction;
        
        // Verificar cooldown
        const now = Date.now();
        const key = `${instruction.type}_${instruction.action}`;
        
        if (instruction.text !== state.lastInstruction || 
            (now - state.lastInstructionTime) > state.instructionCooldown) {
            
            // Reproducir instrucción
            speakInstruction(instruction.text, instruction.priority);
            
            // Actualizar UI
            updateInstructionsList(instruction);
            
            state.lastInstruction = instruction.text;
            state.lastInstructionTime = now;
        }
    }
}

/**
 * Dibuja bounding boxes y zona segura en el canvas
 */
function drawDetections(detections, safeZone) {
    // Limpiar canvas (mantener el video de fondo)
    state.ctx.drawImage(state.video, 0, 0, state.canvas.width, state.canvas.height);
    
    // Dibujar zona segura primero (para que quede detrás de los objetos)
    if (safeZone) {
        drawSafeZone(safeZone);
    }
    
    if (!detections || detections.length === 0) {
        return;
    }
    
    detections.forEach(detection => {
        const [x, y, w, h] = detection.bbox;
        
        // Color según tipo y si está en zona segura
        let color = '#00FF00'; // Verde por defecto
        let lineWidth = 3;
        
        if (detection.type === 'traffic_light') {
            color = detection.state === 'red' ? '#FF0000' : 
                   detection.state === 'yellow' ? '#FFFF00' : '#00FF00';
        } else if (detection.type === 'obstacle') {
            // Obstáculos en zona segura se marcan en rojo y más grueso
            if (detection.in_safe_zone) {
                color = '#FF0000'; // Rojo para obstáculos bloqueando
                lineWidth = 5;
            } else {
                color = '#FF6B00'; // Naranja para obstáculos fuera de zona segura
            }
        } else if (detection.type === 'crosswalk') {
            color = '#00FFFF'; // Cyan
        }
        
        // Dibujar rectángulo
        state.ctx.strokeStyle = color;
        state.ctx.lineWidth = lineWidth;
        state.ctx.strokeRect(x, y, w, h);
        
        // Si está en zona segura, agregar fondo rojo semitransparente
        if (detection.in_safe_zone && detection.type === 'obstacle') {
            state.ctx.fillStyle = 'rgba(255, 0, 0, 0.2)';
            state.ctx.fillRect(x, y, w, h);
        }
        
        // Dibujar etiqueta
        state.ctx.fillStyle = color;
        state.ctx.font = '16px Arial';
        state.ctx.fillText(
            `${detection.class_es} (${(detection.confidence * 100).toFixed(0)}%)`,
            x,
            y - 5
        );
    });
}

/**
 * Dibuja la zona segura en el canvas (trapecio con perspectiva realista)
 */
function drawSafeZone(safeZone) {
    if (!safeZone) return;
    
    // Extraer coordenadas del trapecio
    const bottomLeft = safeZone.bottom_left || [safeZone.x, safeZone.y + safeZone.height];
    const bottomRight = safeZone.bottom_right || [safeZone.x + safeZone.width, safeZone.y + safeZone.height];
    const topLeft = safeZone.top_left || [safeZone.x + (safeZone.width * 0.25), safeZone.y];
    const topRight = safeZone.top_right || [safeZone.x + (safeZone.width * 0.75), safeZone.y];
    
    const is_clear = safeZone.is_clear;
    const pathAdjusted = safeZone.path_adjusted || false;
    
    // Color según si está libre o bloqueada
    const fillColor = is_clear ? 'rgba(0, 255, 0, 0.12)' : 'rgba(255, 0, 0, 0.12)';
    const strokeColor = is_clear ? '#00FF00' : '#FF0000';
    
    // Dibujar trapecio (polígono) - corredor de paso
    state.ctx.beginPath();
    state.ctx.moveTo(bottomLeft[0], bottomLeft[1]);      // Esquina inferior izquierda
    state.ctx.lineTo(bottomRight[0], bottomRight[1]);    // Esquina inferior derecha
    state.ctx.lineTo(topRight[0], topRight[1]);          // Esquina superior derecha
    state.ctx.lineTo(topLeft[0], topLeft[1]);              // Esquina superior izquierda
    state.ctx.closePath();
    
    // Dibujar fondo semitransparente
    state.ctx.fillStyle = fillColor;
    state.ctx.fill();
    
    // Dibujar borde principal
    state.ctx.strokeStyle = strokeColor;
    state.ctx.lineWidth = 3;
    state.ctx.setLineDash([10, 5]); // Línea punteada
    state.ctx.stroke();
    
    // Dibujar línea central del corredor (opcional, para mejor visualización)
    if (is_clear) {
        const centerX = (bottomLeft[0] + bottomRight[0]) / 2;
        const centerTopX = (topLeft[0] + topRight[0]) / 2;
        const centerTopY = (topLeft[1] + topRight[1]) / 2;
        const centerBottomY = (bottomLeft[1] + bottomRight[1]) / 2;
        
        state.ctx.beginPath();
        state.ctx.moveTo(centerX, centerBottomY);
        state.ctx.lineTo(centerTopX, centerTopY);
        state.ctx.strokeStyle = 'rgba(0, 255, 0, 0.5)';
        state.ctx.lineWidth = 1;
        state.ctx.setLineDash([5, 5]);
        state.ctx.stroke();
    }
    
    state.ctx.setLineDash([]); // Resetear a línea sólida
    
    // Indicador si el camino fue ajustado dinámicamente
    if (pathAdjusted && safeZone.path_confidence > 0.5) {
        const indicatorX = (bottomLeft[0] + bottomRight[0]) / 2;
        const indicatorY = bottomLeft[1] - 5;
        
        state.ctx.fillStyle = '#2196F3';
        state.ctx.font = '12px Arial';
        state.ctx.textAlign = 'center';
        state.ctx.fillText('📍 Camino detectado', indicatorX, indicatorY);
    }
    
    // Etiqueta de zona segura (centrada en el trapecio)
    const labelX = (bottomLeft[0] + bottomRight[0]) / 2;
    const labelY = (bottomLeft[1] + topLeft[1]) / 2;
    
    state.ctx.fillStyle = strokeColor;
    state.ctx.font = 'bold 16px Arial';
    state.ctx.textAlign = 'center';
    state.ctx.fillText(
        is_clear ? '✅ CORREDOR LIBRE' : '⚠️ CORREDOR BLOQUEADO',
        labelX,
        labelY - 10
    );
    
    // Información adicional
    if (safeZone.obstacle_count > 0) {
        state.ctx.font = '13px Arial';
        state.ctx.fillText(
            `${safeZone.obstacle_count} obstáculo(s)`,
            labelX,
            labelY + 12
        );
    }
    
    // Resetear alineación de texto
    state.ctx.textAlign = 'left';
}

/**
 * Actualiza la lista de detecciones en el UI
 */
function updateDetectionsList(detections, safeZone) {
    const detectionsDiv = document.getElementById('detections');
    
    // Remover placeholder
    const placeholder = detectionsDiv.querySelector('.placeholder');
    if (placeholder) {
        placeholder.remove();
    }
    
    // Limpiar lista antigua (mantener solo las últimas 5)
    while (detectionsDiv.children.length >= 5) {
        detectionsDiv.removeChild(detectionsDiv.lastChild);
    }
    
    // Agregar información de zona segura primero
    if (safeZone) {
        const safeZoneItem = document.createElement('div');
        safeZoneItem.className = 'detection-item';
        safeZoneItem.style.borderLeftColor = safeZone.is_clear ? '#27ae60' : '#e74c3c';
        safeZoneItem.style.background = safeZone.is_clear ? '#e8f8f5' : '#fdeaea';
        safeZoneItem.innerHTML = `
            <strong>${safeZone.is_clear ? '✅ Zona Segura Libre' : '⚠️ Zona Segura Bloqueada'}</strong>
            ${safeZone.obstacle_count > 0 ? `(${safeZone.obstacle_count} obstáculo(s))` : ''}
            <span style="float: right; color: #999; font-size: 0.9em;">${new Date().toLocaleTimeString()}</span>
        `;
        detectionsDiv.insertBefore(safeZoneItem, detectionsDiv.firstChild);
    }
    
    // Agregar nuevas detecciones
    detections.forEach(detection => {
        const item = document.createElement('div');
        item.className = 'detection-item';
        
        // Resaltar si está en zona segura
        if (detection.in_safe_zone) {
            item.style.borderLeftColor = '#e74c3c';
            item.style.background = '#fdeaea';
        }
        
        item.innerHTML = `
            <strong>${detection.class_es}</strong> 
            (${(detection.confidence * 100).toFixed(0)}% confianza)
            ${detection.in_safe_zone ? '<span style="color: #e74c3c;">⚠️ En zona segura</span>' : ''}
            <span style="float: right; color: #999; font-size: 0.9em;">${new Date().toLocaleTimeString()}</span>
        `;
        detectionsDiv.insertBefore(item, detectionsDiv.firstChild);
    });
}

/**
 * Reproduce instrucción de audio usando Web Speech API
 */
function speakInstruction(text, priority = 5) {
    if (!('speechSynthesis' in window)) {
        return;
    }
    
    // Cancelar instrucciones anteriores si la nueva es de alta prioridad
    if (priority >= 9) {
        window.speechSynthesis.cancel();
    }
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'es-ES';
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;
    
    // Buscar voz en español
    const voices = window.speechSynthesis.getVoices();
    const spanishVoice = voices.find(voice => 
        voice.lang.includes('es') || voice.lang.includes('ES')
    );
    if (spanishVoice) {
        utterance.voice = spanishVoice;
    }
    
    window.speechSynthesis.speak(utterance);
    
    log(`🔊 Reproduciendo: ${text}`);
}

/**
 * Actualiza la lista de instrucciones en el UI
 */
function updateInstructionsList(instruction) {
    const instructionsDiv = document.getElementById('instructions');
    
    // Remover placeholder
    const placeholder = instructionsDiv.querySelector('.placeholder');
    if (placeholder) {
        placeholder.remove();
    }
    
    // Crear elemento
    const item = document.createElement('div');
    item.className = 'instruction-item';
    item.innerHTML = `
        <strong>📢 ${instruction.text}</strong>
        <span style="float: right; color: #999; font-size: 0.9em;">${new Date().toLocaleTimeString()}</span>
    `;
    
    // Agregar al inicio
    instructionsDiv.insertBefore(item, instructionsDiv.firstChild);
    
    // Limitar a 5 instrucciones
    while (instructionsDiv.children.length > 5) {
        instructionsDiv.removeChild(instructionsDiv.lastChild);
    }
}

/**
 * Actualiza el estado en el UI
 */
function updateStatus(message) {
    const statusDiv = document.getElementById('status');
    statusDiv.textContent = message;
}

/**
 * Muestra un error
 */
function showError(message) {
    updateStatus(`❌ ${message}`);
    log(`❌ Error: ${message}`, 'error');
}

/**
 * Logging helper
 */
function log(message, type = 'info') {
    console.log(`[BlindPower] ${message}`);
    
    const logsDiv = document.getElementById('logs');
    if (logsDiv && logsDiv.style.display !== 'none') {
        const logEntry = document.createElement('div');
        logEntry.className = `log-entry ${type}`;
        logEntry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
        logsDiv.insertBefore(logEntry, logsDiv.firstChild);
        
        // Limitar logs
        while (logsDiv.children.length > 50) {
            logsDiv.removeChild(logsDiv.lastChild);
        }
    }
}

/**
 * Toggle logs visibility
 */
function toggleLogs() {
    const logsDiv = document.getElementById('logs');
    if (logsDiv.style.display === 'none') {
        logsDiv.style.display = 'block';
    } else {
        logsDiv.style.display = 'none';
    }
}

