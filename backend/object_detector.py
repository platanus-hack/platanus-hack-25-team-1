"""
object_detector.py - Detección de objetos usando YOLOv8
Detecta semáforos, pasos de peatones y obstáculos
"""

import cv2
import numpy as np
from typing import List, Dict, Optional
import logging

try:
    from ultralytics import YOLO
    YOLO_AVAILABLE = True
except ImportError:
    YOLO_AVAILABLE = False
    logging.warning("ultralytics no disponible. Instala con: pip install ultralytics")

logger = logging.getLogger(__name__)

class ObjectDetector:
    """
    Detector de objetos usando YOLOv8 preentrenado
    """
    
    def __init__(self, model_path: Optional[str] = None):
        """
        Inicializa el detector
        
        Args:
            model_path: Ruta al modelo YOLO personalizado (opcional)
                       Si None, usa modelo preentrenado 'yolov8n.pt' (nano, más rápido)
        """
        self.model = None
        self.is_model_loaded = False
        self.model_path = model_path or "yolov8n.pt"  # Nano model (más rápido para MVP)
        
        # Mapeo de clases COCO a nuestras categorías
        self.class_mapping = {
            # Obstáculos
            'person': {'type': 'obstacle', 'class_es': 'persona'},
            'car': {'type': 'obstacle', 'class_es': 'auto'},
            'truck': {'type': 'obstacle', 'class_es': 'camión'},
            'bus': {'type': 'obstacle', 'class_es': 'autobús'},
            'motorcycle': {'type': 'obstacle', 'class_es': 'motocicleta'},
            'bicycle': {'type': 'obstacle', 'class_es': 'bicicleta'},
            'umbrella': {'type': 'obstacle', 'class_es': 'paraguas'},
            'backpack': {'type': 'obstacle', 'class_es': 'mochila'},
            'handbag': {'type': 'obstacle', 'class_es': 'bolso'},
            'suitcase': {'type': 'obstacle', 'class_es': 'maleta'},
            'chair': {'type': 'obstacle', 'class_es': 'silla'},
            'bench': {'type': 'obstacle', 'class_es': 'banco'},
            # Semáforos (YOLO puede detectar algunos)
            'traffic light': {'type': 'traffic_light', 'class_es': 'semáforo'},
            'stop sign': {'type': 'traffic_light', 'class_es': 'señal de alto'},
        }
        
        # Clases relevantes para filtrar
        self.relevant_classes = list(self.class_mapping.keys())
    
    async def load_model(self):
        """
        Carga el modelo YOLO
        """
        if not YOLO_AVAILABLE:
            raise ImportError("ultralytics no está instalado. Instala con: pip install ultralytics")
        
        try:
            logger.info(f"📦 Cargando modelo YOLO: {self.model_path}")
            self.model = YOLO(self.model_path)
            self.is_model_loaded = True
            logger.info("✅ Modelo YOLO cargado exitosamente")
        except Exception as e:
            logger.error(f"❌ Error al cargar modelo: {str(e)}")
            self.is_model_loaded = False
            raise
    
    def predict(self, frame: np.ndarray, conf_threshold: float = 0.5) -> List[Dict]:
        """
        Realiza predicción en un frame
        
        Args:
            frame: Frame de OpenCV (BGR)
            conf_threshold: Umbral de confianza mínimo
        
        Returns:
            Lista de detecciones con bbox, clase, confianza y tipo
        """
        if not self.is_model_loaded or self.model is None:
            logger.warning("Modelo no cargado")
            return []
        
        try:
            # YOLO espera RGB, OpenCV usa BGR
            frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            
            # Realizar predicción
            results = self.model(frame_rgb, conf=conf_threshold, verbose=False)
            
            detections = []
            
            # Procesar resultados
            for result in results:
                boxes = result.boxes
                
                for box in boxes:
                    # Obtener información de la caja
                    cls = int(box.cls[0])
                    conf = float(box.conf[0])
                    class_name = result.names[cls]
                    
                    # Filtrar solo clases relevantes
                    if class_name.lower() not in self.relevant_classes:
                        continue
                    
                    # Obtener coordenadas del bounding box
                    x1, y1, x2, y2 = box.xyxy[0].cpu().numpy()
                    x, y, w, h = float(x1), float(y1), float(x2 - x1), float(y2 - y1)
                    
                    # Obtener información de mapeo
                    mapping = self.class_mapping.get(class_name.lower(), {})
                    
                    # Detectar estado del semáforo si es traffic light
                    state = None
                    if mapping.get('type') == 'traffic_light':
                        state = self._detect_traffic_light_state(frame, [x, y, w, h])
                    
                    # Agregar detección
                    detection = {
                        'bbox': [x, y, w, h],
                        'class': class_name,
                        'class_es': mapping.get('class_es', class_name),
                        'confidence': conf,
                        'type': mapping.get('type', 'other'),
                        'state': state
                    }
                    
                    detections.append(detection)
            
            # Detectar semáforos por color (método adicional)
            traffic_lights = self._detect_traffic_lights_by_color(frame)
            detections.extend(traffic_lights)
            
            # Detectar pasos de peatones
            crosswalks = self._detect_crosswalks(frame)
            detections.extend(crosswalks)
            
            return detections
            
        except Exception as e:
            logger.error(f"Error en predicción: {str(e)}")
            return []
    
    def _detect_traffic_light_state(self, frame: np.ndarray, bbox: List[float]) -> Optional[str]:
        """
        Detecta el estado de un semáforo (rojo, amarillo, verde) basado en color
        
        Args:
            frame: Frame completo
            bbox: [x, y, w, h] del semáforo
        
        Returns:
            'red', 'yellow', 'green' o None
        """
        x, y, w, h = map(int, bbox)
        
        # Extraer región del semáforo
        x = max(0, x)
        y = max(0, y)
        w = min(w, frame.shape[1] - x)
        h = min(h, frame.shape[0] - y)
        
        if w <= 0 or h <= 0:
            return None
        
        roi = frame[y:y+h, x:x+w]
        
        if roi.size == 0:
            return None
        
        # Convertir a HSV para mejor detección de color
        hsv = cv2.cvtColor(roi, cv2.COLOR_BGR2HSV)
        
        # Definir rangos de color
        # Rojo (dos rangos porque rojo está en ambos extremos del espectro HSV)
        lower_red1 = np.array([0, 100, 100])
        upper_red1 = np.array([10, 255, 255])
        lower_red2 = np.array([170, 100, 100])
        upper_red2 = np.array([180, 255, 255])
        
        mask_red1 = cv2.inRange(hsv, lower_red1, upper_red1)
        mask_red2 = cv2.inRange(hsv, lower_red2, upper_red2)
        mask_red = cv2.bitwise_or(mask_red1, mask_red2)
        
        # Amarillo
        lower_yellow = np.array([20, 100, 100])
        upper_yellow = np.array([30, 255, 255])
        mask_yellow = cv2.inRange(hsv, lower_yellow, upper_yellow)
        
        # Verde
        lower_green = np.array([40, 100, 100])
        upper_green = np.array([80, 255, 255])
        mask_green = cv2.inRange(hsv, lower_green, upper_green)
        
        # Contar píxeles de cada color
        red_pixels = cv2.countNonZero(mask_red)
        yellow_pixels = cv2.countNonZero(mask_yellow)
        green_pixels = cv2.countNonZero(mask_green)
        
        total_pixels = roi.shape[0] * roi.shape[1]
        threshold = total_pixels * 0.05  # 5% del área
        
        # Determinar estado
        if red_pixels > threshold and red_pixels > yellow_pixels and red_pixels > green_pixels:
            return 'red'
        elif yellow_pixels > threshold and yellow_pixels > green_pixels:
            return 'yellow'
        elif green_pixels > threshold:
            return 'green'
        
        return None
    
    def _detect_traffic_lights_by_color(self, frame: np.ndarray) -> List[Dict]:
        """
        Detecta semáforos buscando círculos de colores en la parte superior del frame
        Método complementario para cuando YOLO no detecta semáforos
        """
        detections = []
        
        try:
            # Analizar región superior (donde suelen estar los semáforos)
            height, width = frame.shape[:2]
            
            if height == 0 or width == 0:
                return detections
            
            top_region = frame[0:int(height * 0.4), :]
            
            if top_region.size == 0:
                return detections
            
            # Convertir a HSV
            hsv = cv2.cvtColor(top_region, cv2.COLOR_BGR2HSV)
            
            # Buscar círculos rojos, amarillos y verdes
            # Rojo
            lower_red1 = np.array([0, 100, 100])
            upper_red1 = np.array([10, 255, 255])
            lower_red2 = np.array([170, 100, 100])
            upper_red2 = np.array([180, 255, 255])
            
            mask_red1 = cv2.inRange(hsv, lower_red1, upper_red1)
            mask_red2 = cv2.inRange(hsv, lower_red2, upper_red2)
            mask_red = cv2.bitwise_or(mask_red1, mask_red2)
            
            # Verificar que la máscara no esté vacía
            if mask_red.size == 0 or cv2.countNonZero(mask_red) < 10:
                return detections
            
            # HoughCircles necesita una imagen en escala de grises (CV_8UC1)
            # La máscara ya es escala de grises, así que la usamos directamente
            circles = cv2.HoughCircles(
                mask_red,  # Ya es escala de grises, no necesita conversión
                cv2.HOUGH_GRADIENT,
                dp=1,
                minDist=20,
                param1=50,
                param2=30,
                minRadius=10,
                maxRadius=50
            )
            
            if circles is not None and len(circles) > 0:
                circles = np.uint16(np.around(circles))
                for circle in circles[0, :]:
                    x, y, r = circle
                    detections.append({
                        'bbox': [float(x - r), float(y), float(r * 2), float(r * 2)],
                        'class': 'traffic light',
                        'class_es': 'semáforo',
                        'confidence': 0.7,
                        'type': 'traffic_light',
                        'state': 'red'
                    })
        
        except Exception as e:
            # Silenciar errores en detección de semáforos por color (método complementario)
            logger.debug(f"Error en detección de semáforos por color: {str(e)}")
        
        return detections
    
    def _detect_crosswalks(self, frame: np.ndarray) -> List[Dict]:
        """
        Detecta pasos de peatones buscando patrones de líneas horizontales
        """
        detections = []
        
        try:
            height, width = frame.shape[:2]
            
            if height == 0 or width == 0:
                return detections
            
            # Analizar región inferior (donde suelen estar los pasos de peatones)
            bottom_start = int(height * 0.6)
            if bottom_start >= height:
                return detections
                
            bottom_region = frame[bottom_start:, :]
            
            if bottom_region.size == 0:
                return detections
            
            # Convertir a escala de grises
            gray = cv2.cvtColor(bottom_region, cv2.COLOR_BGR2GRAY)
            
            # Aplicar threshold para detectar líneas blancas
            _, thresh = cv2.threshold(gray, 200, 255, cv2.THRESH_BINARY)
            
            # Detectar líneas horizontales
            horizontal_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (40, 1))
            detected_lines = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, horizontal_kernel, iterations=2)
            
            # Contar líneas detectadas
            contours, _ = cv2.findContours(detected_lines, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            
            horizontal_lines = [c for c in contours if cv2.contourArea(c) > 100]
            
            # Si hay varias líneas horizontales, probablemente es un paso de peatones
            if len(horizontal_lines) >= 3:
                # Calcular bounding box de todas las líneas
                all_points = np.concatenate(horizontal_lines)
                x, y, w, h = cv2.boundingRect(all_points)
                
                # Ajustar coordenadas al frame completo
                y += bottom_start
                
                detections.append({
                    'bbox': [float(x), float(y), float(w), float(h)],
                    'class': 'crosswalk',
                    'class_es': 'paso de peatones',
                    'confidence': min(0.8, len(horizontal_lines) / 10.0),
                    'type': 'crosswalk'
                })
        
        except Exception as e:
            # Silenciar errores en detección de pasos de peatones (método complementario)
            logger.debug(f"Error en detección de pasos de peatones: {str(e)}")
        
        return detections
