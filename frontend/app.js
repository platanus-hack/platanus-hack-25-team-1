/**
 * app.js - Script principal del frontend
 * Captura frames de la cámara, los envía al backend y reproduce instrucciones de voz
 */

// Configuración
const CONFIG = {
    captureInterval: 500, // Capturar frame cada 100ms (10 FPS)
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
    instructionCooldown: 2000, // 2 segundos entre instrucciones similares
    isMobile: false, // Si es dispositivo móvil
    currentCamera: 'environment' // Cámara actual: 'user' (frontal) o 'environment' (trasera) - CAMBIAR AQUÍ
};

/**
 * Detecta si es un dispositivo móvil
 */
function detectMobile() {
    const userAgent = navigator.userAgent || navigator.vendor || window.opera;
    const isMobileDevice = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent.toLowerCase());
    const isSmallScreen = window.innerWidth <= 768;
    return isMobileDevice || isSmallScreen;
}

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
    
    // Detectar si es móvil
    state.isMobile = detectMobile();
    
    // Mostrar selector de cámara solo en móviles
    const cameraSelector = document.getElementById('cameraSelector');
    const cameraSelect = document.getElementById('cameraSelect');
    
    if (state.isMobile) {
        cameraSelector.style.display = 'block';
        log('📱 Dispositivo móvil detectado - Selector de cámara habilitado');
        
        // Event listener para cambio de cámara
        cameraSelect.addEventListener('change', async (e) => {
            if (state.isRunning) {
                log('🔄 Cambiando cámara...');
                // Detener stream actual
                if (state.stream) {
                    state.stream.getTracks().forEach(track => track.stop());
                }
                // Actualizar cámara seleccionada
                state.currentCamera = e.target.value;
                // Reiniciar con nueva cámara
                await startCopilot();
            } else {
                state.currentCamera = e.target.value;
                log(`📷 Cámara seleccionada: ${state.currentCamera === 'user' ? 'Frontal' : 'Trasera'}`);
            }
        });
    } else {
        cameraSelector.style.display = 'none';
        log('💻 Dispositivo de escritorio detectado - Usando única cámara disponible');
    }
    
    // Botones
    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');
    const toggleLogsBtn = document.getElementById('toggleLogs');
    const fullscreenBtn = document.getElementById('fullscreenBtn');

    // Event listeners
    startBtn.addEventListener('click', startCopilot);
    stopBtn.addEventListener('click', stopCopilot);
    toggleLogsBtn.addEventListener('click', toggleLogs);
    fullscreenBtn.addEventListener('click', toggleFullscreen);
    
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
 * Entra en modo pantalla completa
 */
function enterFullscreen() {
    const videoContainer = document.getElementById('videoContainer');

    // Solo entrar si no está ya en pantalla completa
    if (!document.fullscreenElement &&
        !document.webkitFullscreenElement &&
        !document.mozFullScreenElement &&
        !document.msFullscreenElement) {

        if (videoContainer.requestFullscreen) {
            videoContainer.requestFullscreen().catch(err => {
                log(`⚠️ Error al activar pantalla completa: ${err.message}`);
            });
        } else if (videoContainer.webkitRequestFullscreen) {
            videoContainer.webkitRequestFullscreen(); // Safari
        } else if (videoContainer.mozRequestFullScreen) {
            videoContainer.mozRequestFullScreen(); // Firefox
        } else if (videoContainer.msRequestFullscreen) {
            videoContainer.msRequestFullscreen(); // IE/Edge
        }
        log('🖥️ Pantalla completa activada');
    }
}

/**
 * Alterna pantalla completa para el contenedor de video
 */
function toggleFullscreen() {
    if (!document.fullscreenElement &&
        !document.webkitFullscreenElement &&
        !document.mozFullScreenElement &&
        !document.msFullscreenElement) {
        // Entrar en pantalla completa
        enterFullscreen();
    } else {
        // Salir de pantalla completa
        if (document.exitFullscreen) {
            document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
        } else if (document.mozCancelFullScreen) {
            document.mozCancelFullScreen();
        } else if (document.msExitFullscreen) {
            document.msExitFullscreen();
        }
        log('🖥️ Pantalla completa desactivada');
    }
}

/**
 * Aplica efecto espejo solo para cámara frontal
 * La cámara trasera muestra la imagen normal, la frontal se refleja
 */
function applyMirrorEffect() {
    const video = state.video;
    const canvas = state.canvas;

    if (state.currentCamera === 'user') {
        // Cámara frontal: aplicar efecto espejo
        video.style.transform = 'scaleX(-1)';
        canvas.style.transform = 'scaleX(-1)';
        log('🪞 Efecto espejo activado (cámara frontal)');
    } else {
        // Cámara trasera: mostrar imagen normal
        video.style.transform = 'scaleX(1)';
        canvas.style.transform = 'scaleX(1)';
        log('📷 Imagen normal (cámara trasera)');
    }
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

        // Configurar opciones de video según dispositivo
        const videoConstraints = {
            width: { ideal: 640 },
            height: { ideal: 480 }
        };
        
        // En móviles: usar facingMode según selección
        // En desktop: no especificar facingMode (usa la única cámara disponible)
        if (state.isMobile) {
            videoConstraints.facingMode = state.currentCamera; // 'user' (frontal) o 'environment' (trasera)
            log(`📷 Solicitando cámara: ${state.currentCamera === 'user' ? 'Frontal' : 'Trasera'}`);
        } else {
            // Desktop: no especificar facingMode, usar cualquier cámara disponible
            log('📷 Solicitando cámara disponible (escritorio)');
        }
        
        // Solicitar acceso a la cámara
        state.stream = await navigator.mediaDevices.getUserMedia({
            video: videoConstraints,
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

            // Aplicar efecto espejo solo para cámara frontal
            applyMirrorEffect();

            // En móviles, activar pantalla completa automáticamente
            if (state.isMobile) {
                setTimeout(() => {
                    enterFullscreen();
                }, 500); // Pequeño delay para asegurar que el video esté listo
            }

            // Iniciar captura de frames
            state.isRunning = true;
            state.captureInterval = setInterval(captureAndProcess, CONFIG.captureInterval);

            // Actualizar UI
            document.getElementById('startBtn').disabled = true;
            document.getElementById('stopBtn').disabled = false;

            // Deshabilitar selector de cámara mientras está corriendo (para evitar cambios)
            if (state.isMobile) {
                document.getElementById('cameraSelect').disabled = true;
            }
            
            updateStatus('✅ Copiloto activo - Procesando...');
            
            log('✅ Copiloto iniciado correctamente');
        }, { once: true });
        
        // También escuchar cuando el video esté listo para reproducir
        state.video.addEventListener('canplay', () => {
            log('▶️ Video listo para reproducir');
        });
        
    } catch (error) {
        log(`❌ Error al acceder a la cámara: ${error.message}`, 'error');
        // showError(`No se pudo acceder a la cámara: ${error.message}`);
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
    
    // Habilitar selector de cámara cuando se detiene
    if (state.isMobile) {
        document.getElementById('cameraSelect').disabled = false;
    }
    
    updateStatus('Copiloto detenido');
    
    // Detener síntesis de voz
    if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
    }
    
    log('✅ Copiloto detenido');
}

// Control de procesamiento para evitar sobrecarga
let isProcessing = false;
let pendingFrame = null;

/**
 * Captura un frame y lo procesa
 */
async function captureAndProcess() {
    if (!state.isRunning || !state.video) {
        return;
    }
    
    // Si ya hay un frame procesándose, guardar este para procesarlo después
    if (isProcessing) {
        pendingFrame = true; // Marcar que hay un frame pendiente
        return;
    }
    
    // Verificar que el video esté listo
    if (state.video.readyState !== state.video.HAVE_ENOUGH_DATA) {
        return;
    }
    
    // Verificar que el canvas esté configurado
    if (state.canvas.width === 0 || state.canvas.height === 0) {
        state.canvas.width = state.video.videoWidth || 640;
        state.canvas.height = state.video.videoHeight || 480;
        return;
    }
    
    isProcessing = true;
    
    try {
        // Dibujar frame en canvas
        state.ctx.drawImage(state.video, 0, 0, state.canvas.width, state.canvas.height);
        
        // Convertir canvas a blob
        state.canvas.toBlob(async (blob) => {
            if (!blob) {
                isProcessing = false;
                return;
            }
            
            // Enviar al backend (sin await para no bloquear)
            sendFrameToBackend(blob).finally(() => {
                isProcessing = false;
                // Si hay un frame pendiente, procesarlo inmediatamente
                if (pendingFrame) {
                    pendingFrame = false;
                    // Usar setTimeout para no bloquear
                    setTimeout(() => captureAndProcess(), 0);
                }
            });
        }, 'image/jpeg', 0.85); // Calidad ligeramente reducida para velocidad
        
    } catch (error) {
        log(`❌ Error al capturar frame: ${error.message}`, 'error');
        isProcessing = false;
    }
}

/**
 * Envía frame al backend para procesamiento
 */
async function sendFrameToBackend(blob) {
    try {
        const formData = new FormData();
        formData.append('file', blob, 'frame.jpg');
        
        const response = await fetch(`${CONFIG.serverUrl}/predict`, {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
        }
        
        const data = await response.json();
        
        // Procesar respuesta (sin logs excesivos para mejor rendimiento)
        processResponse(data);
        
    } catch (error) {
        // Solo mostrar errores importantes
        if (error.message.includes('Failed to fetch') || 
            error.message.includes('NetworkError') ||
            error.message.includes('fetch')) {
            updateStatus('❌ No se puede conectar al servidor. Verifica que esté ejecutándose en ' + CONFIG.serverUrl);
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
    // Solo dibujar objetos cercanos (< 2m) en rojo, los lejanos en otro color
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
            // Semáforos siempre se muestran, sin importar distancia
            // Color según estado: rojo, amarillo, verde
            if (detection.state === 'red') {
                color = '#FF0000'; // Rojo
                lineWidth = 5;
            } else if (detection.state === 'yellow') {
                color = '#FFFF00'; // Amarillo
                lineWidth = 4;
            } else if (detection.state === 'green') {
                color = '#00FF00'; // Verde
                lineWidth = 4;
            } else {
                color = '#FF8800'; // Naranja si no se detecta estado
                lineWidth = 3;
            }
        } else if (detection.type === 'obstacle') {
            // Usar distancia para determinar color
            const distanceMeters = detection.distance_meters || 10.0;
            const isClose = detection.is_close || (distanceMeters < 2.0);
            
            // Solo marcar en ROJO si está cerca (< 2m) Y en zona segura
            if (detection.in_safe_zone && isClose) {
                color = '#FF0000'; // Rojo para obstáculos cercanos bloqueando
                lineWidth = 5;
            } else if (isClose) {
                // Cercano pero fuera de zona segura
                color = '#FF6B00'; // Naranja
                lineWidth = 3;
            } else {
                // Lejano (> 2m): detectado pero no peligroso
                color = '#888888'; // Gris para objetos lejanos
                lineWidth = 2;
            }
        } else if (detection.type === 'crosswalk') {
            color = '#00FFFF'; // Cyan
        }
        
        // Dibujar rectángulo
        state.ctx.strokeStyle = color;
        state.ctx.lineWidth = lineWidth;
        state.ctx.strokeRect(x, y, w, h);
        
        // Solo agregar fondo rojo si está cerca (< 2m) Y en zona segura
        if (detection.in_safe_zone && detection.type === 'obstacle' && detection.is_close) {
            state.ctx.fillStyle = 'rgba(255, 0, 0, 0.2)';
            state.ctx.fillRect(x, y, w, h);
        }
        
        // Dibujar etiqueta con distancia y estado
        state.ctx.fillStyle = color;
        state.ctx.font = '16px Arial';
        let labelText = detection.class_es;
        
        // Para semáforos, mostrar estado
        if (detection.type === 'traffic_light' && detection.state) {
            const stateText = detection.state === 'red' ? 'ROJO' : 
                             detection.state === 'yellow' ? 'AMARILLO' : 
                             detection.state === 'green' ? 'VERDE' : '';
            labelText += ` [${stateText}]`;
        } else {
            // Para otros objetos, mostrar distancia
            const distanceMeters = detection.distance_meters || null;
            if (distanceMeters) {
                labelText += ` (${distanceMeters.toFixed(1)}m)`;
            }
        }
        
        labelText += ` (${(detection.confidence * 100).toFixed(0)}%)`;
        state.ctx.fillText(labelText, x, y - 5);
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

