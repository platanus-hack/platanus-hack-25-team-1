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

      const fileObject = {
        uri: imageUri,
        name: filename,
        type,
      } as any;

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
}

// Exportar instancia singleton
export const apiService = new ApiService();
