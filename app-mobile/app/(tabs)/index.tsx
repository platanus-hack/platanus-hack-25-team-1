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
} from 'react-native';
import { CameraView, CameraType, useCameraPermissions } from 'expo-camera';
import * as Speech from 'expo-speech';
import { StatusBar } from 'expo-status-bar';
import { apiService, Detection, SafeZone } from '@/services/api';
import { Image } from 'expo-image';

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

  const cameraRef = useRef<CameraView>(null);
  const captureIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastInstructionTimeRef = useRef<number>(0);
  const isProcessingRef = useRef(false);
  const INSTRUCTION_COOLDOWN = 2000; // 2 segundos
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

          if (
            response.instruction.text !== lastInstruction ||
            timeSinceLastInstruction > INSTRUCTION_COOLDOWN
          ) {
            console.log(`🔊 Reproduciendo instrucción: "${response.instruction.text}"`);
            speakInstruction(response.instruction.text, response.instruction.priority);
            setLastInstruction(response.instruction.text);
            lastInstructionTimeRef.current = now;
          }
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

  const speakInstruction = (text: string, priority: number) => {
    // Cancelar instrucciones anteriores si es de alta prioridad
    if (priority >= 9) {
      Speech.stop();
    }

    Speech.speak(text, {
      language: 'es-ES',
      rate: 1.0,
      pitch: 1.0,
    });
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
});
