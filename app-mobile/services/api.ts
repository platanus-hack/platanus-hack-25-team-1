/**
 * API Service - Comunicación con el backend de BlindPower
 */

export interface Detection {
  bbox: number[];
  class: string;
  class_es: string;
  confidence: number;
  type: string;
  distance_meters: number;
  is_close: boolean;
  in_safe_zone: boolean;
  state?: string; // Para semáforos
}

export interface Instruction {
  text: string;
  priority: number;
  type: string;
  action: string;
  direction: string;
}

export interface SafeZone {
  bottom_left: number[];
  bottom_right: number[];
  top_left: number[];
  top_right: number[];
  center_x: number;
  top_y: number;
  bottom_y: number;
  top_width: number;
  bottom_width: number;
  is_clear: boolean;
  obstacle_count: number;
}

export interface PredictionResponse {
  success: boolean;
  detections: Detection[];
  instruction: Instruction | null;
  safe_zone: SafeZone;
  frame_info: {
    width: number;
    height: number;
  };
}

export interface AnalyzeImageResponse {
  success: boolean;
  text: string;
  audio_base64: string;
  audio_format: string;
  error?: string;
}

class ApiService {
  private baseUrl: string;

  constructor(baseUrl: string = 'https://ryi9nvetjj.us-east-1.awsapprunner.com') {
    this.baseUrl = baseUrl;
  }

  /**
   * Actualiza la URL del servidor
   */
  setBaseUrl(url: string) {
    this.baseUrl = url;
  }

  /**
   * Verifica si el servidor está disponible
   */
  async checkHealth(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        return false;
      }

      const data = await response.json();
      return data.status === 'healthy';
    } catch (error) {
      console.error('Health check failed:', error);
      return false;
    }
  }

  /**
   * Envía un frame al backend para procesamiento
   * @param imageUri - URI de la imagen capturada
   */
  async predict(imageUri: string): Promise<PredictionResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 segundos timeout

    try {
      console.log(`🚀 Enviando imagen al servidor: ${this.baseUrl}/predict`);

      // Crear FormData para enviar la imagen
      const formData = new FormData();

      // En React Native, necesitamos usar un objeto especial para las imágenes
      const filename = imageUri.split('/').pop() || 'photo.jpg';
      const match = /\.(\w+)$/.exec(filename);
      const type = match ? `image/${match[1]}` : 'image/jpeg';

      // Platform-specific handling
      let fileObject: any;

      if (typeof window !== 'undefined' && !imageUri.startsWith('file://')) {
        // Web platform: convert to blob
        console.log('🌐 Plataforma Web detectada - Convirtiendo a Blob');
        const response = await fetch(imageUri);
        const blob = await response.blob();
        fileObject = new File([blob], filename, { type });
      } else {
        // Mobile platform: use React Native format
        fileObject = {
          uri: imageUri,
          name: filename,
          type,
        };
      }

      console.log(`📎 Archivo a enviar:`, { name: filename, type, uri: imageUri.substring(0, 50) + '...' });

      formData.append('file', fileObject);

      const response = await fetch(`${this.baseUrl}/predict`, {
        method: 'POST',
        body: formData,
        headers: {
          'Accept': 'application/json',
          // NO incluir Content-Type para multipart/form-data - el browser lo agrega automáticamente
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      console.log(`📡 Respuesta del servidor: ${response.status} ${response.statusText}`);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ Error HTTP ${response.status}:`, errorText);
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const data: PredictionResponse = await response.json();

      console.log(`✅ Datos recibidos:`, {
        success: data.success,
        detections: data.detections?.length,
        hasInstruction: !!data.instruction,
        hasSafeZone: !!data.safe_zone,
      });

      // Validar que la respuesta tenga la estructura correcta
      if (!data.success) {
        throw new Error('Respuesta del servidor indica fallo');
      }

      return data;
    } catch (error: any) {
      clearTimeout(timeoutId);

      if (error.name === 'AbortError') {
        console.error('❌ Timeout: La petición tardó más de 10 segundos');
        throw new Error('Timeout: El servidor tardó demasiado en responder');
      }

      console.error('❌ Error en predict:', error);
      throw error;
    }
  }

  /**
   * Envía una imagen en base64 al backend
   * @param base64Image - Imagen en formato base64
   */
  async predictBase64(base64Image: string): Promise<Partial<PredictionResponse>> {
    try {
      const response = await fetch(`${this.baseUrl}/predict_base64`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          image: base64Image,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Base64 prediction failed:', error);
      throw error;
    }
  }

  /**
   * Analiza una imagen con Claude y genera audio con ElevenLabs
   * @param imageUri - URI de la imagen capturada
   * @param question - Pregunta del usuario sobre la imagen
   */
  async analyzeImage(imageUri: string, question?: string): Promise<AnalyzeImageResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 segundos timeout (Claude + ElevenLabs)

    try {
      console.log(`🔍 Analizando imagen con pregunta: "${question || '¿qué es esto?'}"`);

      // Crear FormData para enviar la imagen
      const formData = new FormData();

      // En React Native, necesitamos usar un objeto especial para las imágenes
      const filename = imageUri.split('/').pop() || 'photo.jpg';
      const match = /\.(\w+)$/.exec(filename);
      const type = match ? `image/${match[1]}` : 'image/jpeg';

      // Platform-specific handling
      let fileObject: any;

      if (typeof window !== 'undefined' && !imageUri.startsWith('file://')) {
        // Web platform: convert to blob
        console.log('🌐 Plataforma Web detectada - Convirtiendo a Blob');
        const response = await fetch(imageUri);
        const blob = await response.blob();
        fileObject = new File([blob], filename, { type });
      } else {
        // Mobile platform: use React Native format
        fileObject = {
          uri: imageUri,
          name: filename,
          type,
        };
      }

      formData.append('file', fileObject);

      // Construir URL con query parameter si hay pregunta
      let url = `${this.baseUrl}/analyze_image`;
      if (question) {
        url += `?question=${encodeURIComponent(question)}`;
      }

      const response = await fetch(url, {
        method: 'POST',
        body: formData,
        headers: {
          'Accept': 'application/json',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      console.log(`📡 Respuesta de análisis: ${response.status} ${response.statusText}`);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ Error HTTP ${response.status}:`, errorText);
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const data: AnalyzeImageResponse = await response.json();

      console.log(`✅ Análisis recibido:`, {
        success: data.success,
        hasText: !!data.text,
        hasAudio: !!data.audio_base64,
        audioFormat: data.audio_format,
      });

      if (!data.success) {
        throw new Error(data.error || 'Error al analizar la imagen');
      }

      return data;
    } catch (error: any) {
      clearTimeout(timeoutId);

      if (error.name === 'AbortError') {
        console.error('❌ Timeout: La petición tardó más de 30 segundos');
        throw new Error('Timeout: El servidor tardó demasiado en responder');
      }

      console.error('❌ Error en analyzeImage:', error);
      throw error;
    }
  }
}

// Exportar instancia singleton
export const apiService = new ApiService();
