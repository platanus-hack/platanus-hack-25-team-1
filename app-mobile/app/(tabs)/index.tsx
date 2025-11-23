import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Platform,
  Alert,
  ActivityIndicator,
  Vibration,
} from 'react-native';
import { CameraView, CameraType, useCameraPermissions } from 'expo-camera';
import * as Speech from 'expo-speech';
import { StatusBar } from 'expo-status-bar';
import { apiService, Detection, SafeZone } from '@/services/api';
import { Image } from 'expo-image';
import Svg, { Line, Path, Text as SvgText, Circle } from 'react-native-svg';
import { Audio } from 'expo-av';
import { Paths, File as FSFile } from 'expo-file-system';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function FarooScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [isRunning, setIsRunning] = useState(false);
  const [cameraType, setCameraType] = useState<CameraType>('back');
  const [detections, setDetections] = useState<Detection[]>([]);
  const [safeZone, setSafeZone] = useState<SafeZone | null>(null);
  const [lastInstruction, setLastInstruction] = useState<string>('');
  const [serverUrl, setServerUrl] = useState('https://ryi9nvetjj.us-east-1.awsapprunner.com');
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [debugInfo, setDebugInfo] = useState<string>('');
  const [lastDangerState, setLastDangerState] = useState<boolean>(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const cameraRef = useRef<CameraView>(null);
  const captureIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastInstructionTimeRef = useRef<number>(0);
  const isProcessingRef = useRef(false);
  const soundRef = useRef<Audio.Sound | null>(null);
  const isSpeakingRef = useRef(false); // Flag para saber si está hablando
  const INSTRUCTION_COOLDOWN = 5000; // 5 segundos - evitar bombardeo
  const CAPTURE_INTERVAL = 1000; // 1000ms (1 FPS) - Más lento para mayor confiabilidad

  useEffect(() => {
    // Configurar URL del servidor
    apiService.setBaseUrl(serverUrl);
  }, [serverUrl]);

  useEffect(() => {
    return () => {
      // Cleanup al desmontar
      if (captureIntervalRef.current) {
        clearInterval(captureIntervalRef.current);
      }
      Speech.stop();

      // Limpiar audio
      if (soundRef.current) {
        soundRef.current.unloadAsync();
      }
    };
  }, []);

  const handleStartCopilot = async () => {
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        Alert.alert('Permiso necesario', 'Se requiere acceso a la cámara para usar Faroo');
        return;
      }
    }

    // Verificar conectividad con el servidor
    const isHealthy = await apiService.checkHealth();
    if (!isHealthy) {
      Alert.alert(
        'Servidor no disponible',
        `No se puede conectar al servidor en ${serverUrl}. Verifica que esté ejecutándose.`
      );
      return;
    }

    setIsRunning(true);

    // Iniciar captura periódica
    captureIntervalRef.current = setInterval(() => {
      captureAndProcess();
    }, CAPTURE_INTERVAL);
  };

  const handleStopCopilot = () => {
    setIsRunning(false);

    if (captureIntervalRef.current) {
      clearInterval(captureIntervalRef.current);
      captureIntervalRef.current = null;
    }

    setDetections([]);
    setSafeZone(null);
    Speech.stop();
  };

  const captureAndProcess = async () => {
    // Prevenir llamadas concurrentes usando ref (más confiable que state)
    if (!cameraRef.current || isProcessingRef.current) {
      return;
    }

    try {
      isProcessingRef.current = true;
      setIsProcessing(true);

      const startTime = Date.now();
      setStatusMessage('📸 Capturando...');

      // Capturar foto con mejor calidad
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.7,
        base64: false,
        skipProcessing: true, // Más rápido
      });

      if (!photo || !photo.uri) {
        console.warn('⚠️ No se pudo capturar la foto');
        setStatusMessage('⚠️ Error al capturar');
        return;
      }

      const captureTime = Date.now() - startTime;
      console.log(`✅ Foto capturada en ${captureTime}ms`);
      setStatusMessage('📤 Enviando al servidor...');

      // Enviar al backend con timeout
      const networkStartTime = Date.now();
      const response = await apiService.predict(photo.uri);
      const networkTime = Date.now() - networkStartTime;

      console.log(`🌐 Respuesta del servidor en ${networkTime}ms`);
      console.log(`📊 Detecciones recibidas: ${response.detections?.length || 0}`);

      if (response && response.success) {
        // Actualizar detecciones
        const detectionsCount = response.detections?.length || 0;
        setDetections(response.detections || []);
        setSafeZone(response.safe_zone || null);

        setStatusMessage(`✅ ${detectionsCount} detección${detectionsCount !== 1 ? 'es' : ''}`);
        setDebugInfo(`Captura: ${captureTime}ms | Red: ${networkTime}ms`);

        // Log detallado de lo que se recibió
        console.log('📦 Respuesta completa:', JSON.stringify(response, null, 2));

        // Procesar instrucción
        if (response.instruction && response.instruction.text) {
          const now = Date.now();
          const timeSinceLastInstruction = now - lastInstructionTimeRef.current;
          const instructionText = response.instruction.text.toLowerCase();

          // Formatear mensaje con "Advertencia" para movimientos
          let formattedInstruction = response.instruction.text;
          if (instructionText.includes('muévete') || instructionText.includes('muevete')) {
            // Cambiar "Muévete a la derecha" por "Advertencia, muévete a la derecha"
            if (instructionText.includes('derecha')) {
              formattedInstruction = 'Advertencia, muévete a la derecha';
            } else if (instructionText.includes('izquierda')) {
              formattedInstruction = 'Advertencia, muévete a la izquierda';
            }
          }

          // Determinar si hay peligro actual
          const isDanger = instructionText.includes('izquierda') ||
                          instructionText.includes('derecha') ||
                          instructionText.includes('detener') ||
                          instructionText.includes('cuidado') ||
                          instructionText.includes('auto') ||
                          instructionText.includes('persona');

          // Solo hablar si:
          // 1. NO está hablando actualmente
          // 2. Instrucción diferente a la anterior O ha pasado el cooldown
          // 3. Es una situación de peligro O transición a seguro
          const isNewInstruction = formattedInstruction !== lastInstruction;
          const cooldownPassed = timeSinceLastInstruction > INSTRUCTION_COOLDOWN;
          const isRelevantSituation = isDanger || (!isDanger && lastDangerState);

          const shouldSpeak = (
            !isSpeakingRef.current && // NO está hablando
            isRelevantSituation && // Situación relevante
            (isNewInstruction || cooldownPassed) // Instrucción nueva O cooldown pasado
          );

          if (shouldSpeak) {
            console.log(`🔊 Reproduciendo instrucción: "${formattedInstruction}"`);
            speakInstruction(formattedInstruction, response.instruction.priority);
            setLastInstruction(formattedInstruction);
            lastInstructionTimeRef.current = now;
          } else {
            if (isSpeakingRef.current) {
              console.log(`⏸️ Instrucción bloqueada: ya está hablando`);
            } else if (formattedInstruction === lastInstruction && !cooldownPassed) {
              console.log(`⏱️ Instrucción bloqueada por cooldown (${Math.floor(timeSinceLastInstruction/1000)}s < ${INSTRUCTION_COOLDOWN/1000}s)`);
            }
          }

          // Actualizar estado de peligro
          setLastDangerState(isDanger);
        } else {
          // Si NO hay instrucción, significa que está seguro
          // Volver automáticamente a verde (zona segura)
          if (lastDangerState) {
            console.log('✅ Sin detecciones - Volviendo a zona segura');
            setLastInstruction('Zona segura, puedes avanzar');
          }
          setLastDangerState(false);
        }
      } else {
        console.warn('⚠️ Respuesta inválida del servidor:', response);
        setStatusMessage('⚠️ Respuesta inválida');
      }
    } catch (error: any) {
      console.error('❌ Error completo al procesar frame:', error);
      console.error('❌ Stack trace:', error.stack);
      setStatusMessage(`❌ Error: ${error.message || 'Desconocido'}`);

      // Mostrar error específico
      if (error.message?.includes('Network request failed')) {
        setDebugInfo('Error de red - Verifica conexión');
      } else if (error.message?.includes('timeout')) {
        setDebugInfo('Timeout - Servidor muy lento');
      } else {
        setDebugInfo(error.message?.substring(0, 50) || 'Error desconocido');
      }
    } finally {
      isProcessingRef.current = false;
      setIsProcessing(false);
    }
  };

  const vibrateForInstruction = (text: string) => {
    const textLower = text.toLowerCase();

    if (textLower.includes('izquierda')) {
      // 1 vibración para moverse a la izquierda
      Vibration.vibrate(300);
    } else if (textLower.includes('derecha')) {
      // 2 vibraciones para moverse a la derecha
      Vibration.vibrate([0, 200, 200, 200]);
    } else if (textLower.includes('detener') || textLower.includes('cuidado') || textLower.includes('persona') || textLower.includes('auto')) {
      // 3 vibraciones para obstáculo delante
      Vibration.vibrate([0, 200, 200, 200, 200, 200]);
    }
  };

  const speakInstruction = (text: string, priority: number) => {
    // No hablar si ya está hablando (a menos que sea de alta prioridad)
    if (isSpeakingRef.current && priority < 9) {
      console.log('⏸️ Instrucción bloqueada: ya está hablando');
      return;
    }

    // Vibrar según la instrucción
    vibrateForInstruction(text);

    // Cancelar instrucciones anteriores si es de alta prioridad
    if (priority >= 9) {
      Speech.stop();
      isSpeakingRef.current = false;
    }

    // Marcar que está hablando
    isSpeakingRef.current = true;

    Speech.speak(text, {
      language: 'es-ES',
      rate: 1.0,
      pitch: 1.0,
      onDone: () => {
        isSpeakingRef.current = false;
        console.log('✅ Instrucción completada');
      },
      onStopped: () => {
        isSpeakingRef.current = false;
      },
      onError: () => {
        isSpeakingRef.current = false;
      },
    });
  };

  // Funciones para AI Query - Pregunta predefinida "¿Qué veo?"
  const handleAIButtonPress = async () => {
    if (isAnalyzing) {
      return;
    }

    try {
      Vibration.vibrate(100); // Feedback háptico
      Speech.speak('Analizando lo que ves', { language: 'es-ES' });

      // Hacer pregunta predefinida: "¿Qué veo?"
      await handleAIQuery('¿Qué veo?');
    } catch (error) {
      console.error('❌ Error al procesar consulta:', error);
      Alert.alert('Error', 'No se pudo procesar la consulta');
    }
  };

  const handleAIQuery = async (question: string) => {
    if (!cameraRef.current) {
      Alert.alert('Error', 'Cámara no disponible');
      return;
    }

    try {
      setIsAnalyzing(true);
      console.log(`🔍 Procesando consulta: "${question}"`);

      // Capturar foto actual
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        base64: false,
        skipProcessing: true,
      });

      if (!photo || !photo.uri) {
        throw new Error('No se pudo capturar la foto');
      }

      console.log('📸 Foto capturada, enviando a API...');

      // Enviar a la API para análisis con Claude
      const result = await apiService.analyzeImage(photo.uri, question);

      console.log(`✅ Respuesta recibida: "${result.text}"`);

      // Reproducir audio de respuesta
      if (result.audio_base64) {
        try {
          await playAudioFromBase64(result.audio_base64);
          console.log('✅ Audio reproducido exitosamente');
        } catch (audioError) {
          console.error('❌ Error al reproducir audio, usando Speech como fallback:', audioError);
          // Fallback a texto hablado si falla el audio
          Speech.speak(result.text, { language: 'es-ES' });
        }
      } else {
        // Fallback a texto hablado si no hay audio
        console.log('⚠️ No hay audio en la respuesta, usando Speech');
        Speech.speak(result.text, { language: 'es-ES' });
      }

      setLastInstruction(`IA: ${result.text}`);
    } catch (error: any) {
      console.error('❌ Error al procesar consulta:', error);
      Alert.alert('Error', 'No se pudo procesar tu consulta. Intenta de nuevo.');
      Speech.speak('Hubo un error al procesar tu consulta', { language: 'es-ES' });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const playAudioFromBase64 = async (base64Audio: string) => {
    try {
      // Limpiar audio anterior
      if (soundRef.current) {
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }

      console.log('🔊 Guardando audio como archivo temporal...');

      // Crear archivo temporal en el directorio de caché
      const tempFile = new FSFile(Paths.cache, 'temp_audio.mp3');

      // Convertir base64 a ArrayBuffer
      const binaryString = atob(base64Audio);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // Escribir el archivo
      await tempFile.write(bytes);

      console.log('✅ Audio guardado, reproduciendo...');

      // Cargar y reproducir el archivo de audio
      const { sound } = await Audio.Sound.createAsync(
        { uri: tempFile.uri },
        { shouldPlay: true }
      );

      soundRef.current = sound;

      // Esperar a que termine y limpiar el archivo temporal
      sound.setOnPlaybackStatusUpdate(async (status) => {
        if (status.isLoaded && status.didJustFinish) {
          await sound.unloadAsync();
          soundRef.current = null;

          // Eliminar archivo temporal
          try {
            await tempFile.delete();
            console.log('🗑️ Archivo temporal eliminado');
          } catch (err) {
            console.warn('⚠️ No se pudo eliminar el archivo temporal:', err);
          }
        }
      });
    } catch (error) {
      console.error('❌ Error al reproducir audio:', error);
      throw error;
    }
  };

  const toggleCamera = () => {
    setCameraType((current) => (current === 'back' ? 'front' : 'back'));
  };

  if (!permission) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#667eea" />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <View style={styles.permissionContainer}>
          <Image
            source={require('@/assets/images/logo.jpeg')}
            style={styles.logoImageLarge}
            contentFit="contain"
          />
          <Text style={styles.permissionText}>
            Se requiere permiso para acceder a la cámara
          </Text>
          <TouchableOpacity style={styles.button} onPress={requestPermission}>
            <Text style={styles.buttonText}>Conceder Permiso</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* Logo/Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Faroo</Text>
      </View>

      {/* Cámara */}
      <View style={styles.cameraContainer}>
        <CameraView
          ref={cameraRef}
          style={styles.camera}
          facing={cameraType}
          animateShutter={false}
        />

        {/* Zona segura visual - SIEMPRE visible, cambia de color según estado */}
        {isRunning && (
          <Svg
            style={StyleSheet.absoluteFill}
            width={SCREEN_WIDTH}
            height={SCREEN_HEIGHT}
          >
            {/* Forma trapezoidal de la zona segura - Replicando la lógica del backend */}
            {/*
              safe_zone_bottom_width_ratio = 0.35 (35% del ancho en la parte inferior)
              safe_zone_top_width_ratio = 0.18 (18% del ancho en la parte superior)
              safe_zone_height_ratio = 0.50 (50% del alto del frame)
              safe_zone_bottom_margin = 0.05 (5% de margen desde abajo)
            */}
            <Path
              d={`
                M ${SCREEN_WIDTH * 0.325} ${SCREEN_HEIGHT * 0.45}
                L ${SCREEN_WIDTH * 0.41} ${SCREEN_HEIGHT * 0.95}
                L ${SCREEN_WIDTH * 0.59} ${SCREEN_HEIGHT * 0.95}
                L ${SCREEN_WIDTH * 0.675} ${SCREEN_HEIGHT * 0.45}
                Z
              `}
              stroke={lastDangerState ? "#e74c3c" : "#27ae60"}
              strokeWidth="3"
              fill={lastDangerState ? "rgba(231, 76, 60, 0.15)" : "rgba(39, 174, 96, 0.15)"}
              strokeDasharray="10, 5"
            />

            {/* Líneas laterales más visibles */}
            <Line
              x1={SCREEN_WIDTH * 0.325}
              y1={SCREEN_HEIGHT * 0.45}
              x2={SCREEN_WIDTH * 0.41}
              y2={SCREEN_HEIGHT * 0.95}
              stroke={lastDangerState ? "#e74c3c" : "#27ae60"}
              strokeWidth="4"
            />
            <Line
              x1={SCREEN_WIDTH * 0.675}
              y1={SCREEN_HEIGHT * 0.45}
              x2={SCREEN_WIDTH * 0.59}
              y2={SCREEN_HEIGHT * 0.95}
              stroke={lastDangerState ? "#e74c3c" : "#27ae60"}
              strokeWidth="4"
            />

            {/* Texto indicador - cambia según estado */}
            <SvgText
              x={SCREEN_WIDTH / 2}
              y={SCREEN_HEIGHT * 0.88}
              fill={lastDangerState ? "#e74c3c" : "#27ae60"}
              fontSize="18"
              fontWeight="bold"
              textAnchor="middle"
            >
              {lastDangerState ? "⚠ Peligro Detectado" : "✓ Zona Segura"}
            </SvgText>
          </Svg>
        )}

        {/* Botón flotante de AI en el centro */}
        <TouchableOpacity
          style={[
            styles.aiButton,
            isAnalyzing && styles.aiButtonActive
          ]}
          onPress={handleAIButtonPress}
          disabled={isAnalyzing}
          activeOpacity={0.7}
        >
          {isAnalyzing ? (
            <View style={styles.aiButtonContent}>
              <ActivityIndicator size="large" color="#fff" />
              <Text style={styles.aiButtonText}>🤖 Analizando...</Text>
            </View>
          ) : (
            <View style={styles.aiButtonContent}>
              <Text style={styles.aiButtonIcon}>🤖</Text>
              <Text style={styles.aiButtonText}>¿Qué veo?</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* Controles */}
      <View style={styles.controls}>
        <TouchableOpacity
          style={[styles.button, styles.primaryButton, isRunning && styles.buttonDisabled]}
          onPress={handleStartCopilot}
          disabled={isRunning}
        >
          <Text style={styles.buttonText}>🚀 Iniciar Copiloto</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.secondaryButton, !isRunning && styles.buttonDisabled]}
          onPress={handleStopCopilot}
          disabled={!isRunning}
        >
          <Text style={styles.buttonText}>⏹ Detener</Text>
        </TouchableOpacity>

        {Platform.OS !== 'web' && (
          <TouchableOpacity
            style={[styles.button, styles.toggleButton]}
            onPress={toggleCamera}
          >
            <Text style={styles.buttonText}>📷 Cambiar Cámara</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Indicador de última instrucción */}
      {lastInstruction && (
        <View style={styles.instructionBar}>
          <Text style={styles.instructionText}>📢 {lastInstruction}</Text>
        </View>
      )}

      {/* Barra de estado y debug */}
      {isRunning && (
        <View style={styles.statusBar}>
          <Text style={styles.statusText}>{statusMessage}</Text>
          {debugInfo && <Text style={styles.debugText}>{debugInfo}</Text>}
          {isProcessing && (
            <ActivityIndicator size="small" color="#667eea" style={{ marginLeft: 10 }} />
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#1a1a1a',
  },
  permissionTitle: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#667eea',
    marginBottom: 20,
  },
  permissionText: {
    fontSize: 18,
    color: '#fff',
    textAlign: 'center',
    marginBottom: 30,
  },
  header: {
    position: 'absolute',
    top: 50,
    left: 0,
    right: 0,
    zIndex: 10,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
  },
  logoImageLarge: {
    width: 250,
    height: 80,
    marginBottom: 20,
  },
  cameraContainer: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  camera: {
    flex: 1,
  },
  controls: {
    position: 'absolute',
    bottom: 20,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    gap: 10,
  },
  button: {
    paddingVertical: 15,
    paddingHorizontal: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 120,
  },
  primaryButton: {
    backgroundColor: '#667eea',
  },
  secondaryButton: {
    backgroundColor: '#e74c3c',
  },
  toggleButton: {
    backgroundColor: '#95a5a6',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  instructionBar: {
    position: 'absolute',
    bottom: 100,
    left: 10,
    right: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    padding: 15,
    borderRadius: 10,
    borderLeftWidth: 4,
    borderLeftColor: '#27ae60',
  },
  instructionText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  statusBar: {
    position: 'absolute',
    top: 120,
    left: 10,
    right: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    padding: 10,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  statusText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  debugText: {
    color: '#aaa',
    fontSize: 12,
    marginTop: 4,
    width: '100%',
  },
  aiButton: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: [{ translateX: -75 }, { translateY: -75 }],
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: 'rgba(102, 126, 234, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 10,
    borderWidth: 4,
    borderColor: '#fff',
  },
  aiButtonActive: {
    backgroundColor: 'rgba(46, 213, 115, 0.95)',
  },
  aiButtonContent: {
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  aiButtonIcon: {
    fontSize: 48,
  },
  aiButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
});
