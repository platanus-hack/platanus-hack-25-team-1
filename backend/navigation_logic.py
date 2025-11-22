"""
navigation_logic.py - Lógica de navegación
Convierte detecciones en instrucciones de voz simples
"""

from typing import List, Dict, Optional
import logging

logger = logging.getLogger(__name__)

class NavigationLogic:
    """
    Genera instrucciones de navegación basadas en detecciones
    """
    
    def __init__(self):
        self.frame_width = 640
        self.frame_height = 480
        self.danger_zone = 0.3  # 30% del frame = zona de peligro
        
        # Zona segura: representa el corredor de paso del usuario (~60-80cm de ancho real)
        # Ubicada en la parte central inferior del frame (donde el usuario caminaría)
        # Forma trapezoidal para respetar la perspectiva (más ancha abajo, más estrecha arriba)
        # Dimensiones más realistas para un paso humano
        self.safe_zone_bottom_width_ratio = 0.25  # 25% del ancho en la parte inferior (cerca) - ~60cm reales
        self.safe_zone_top_width_ratio = 0.12     # 12% del ancho en la parte superior (lejos) - más estrecho
        self.safe_zone_height_ratio = 0.45        # 45% del alto del frame (parte inferior) - más distancia
        self.safe_zone_bottom_margin = 0.08       # 8% de margen desde abajo (altura de cámara)
        
        # Para ajuste dinámico según detecciones
        self.detected_path_center = None  # Centro del camino detectado (pasos de peatones, líneas)
        self.path_confidence = 0.0  # Confianza en la detección del camino
        
        self.last_instruction_time = {}
        self.instruction_cooldown = 2000  # 2 segundos entre instrucciones similares
    
    def process_detections(self, detections: List[Dict], frame_width: int = 640, frame_height: int = 480) -> Optional[Dict]:
        """
        Procesa detecciones y genera instrucción de navegación
        
        Args:
            detections: Lista de detecciones del detector
            frame_width: Ancho del frame
            frame_height: Alto del frame
        
        Returns:
            Dict con instrucción (text, priority, type, action) o None
        """
        self.frame_width = frame_width
        self.frame_height = frame_height
        
        if not detections or len(detections) == 0:
            return None
        
        # Categorizar detecciones
        traffic_lights = [d for d in detections if d.get('type') == 'traffic_light']
        crosswalks = [d for d in detections if d.get('type') == 'crosswalk']
        obstacles = [d for d in detections if d.get('type') == 'obstacle']
        
        # Prioridad 1: Semáforos (máxima prioridad)
        if traffic_lights:
            instruction = self._process_traffic_light(traffic_lights[0])
            if instruction:
                return instruction
        
        # Actualizar zona segura con detecciones para ajuste dinámico
        safe_zone_coords = self.get_safe_zone_coordinates(detections)
        
        # Prioridad 2: Zona segura (obstáculos bloqueando el camino)
        safe_zone_obstacles = self._get_obstacles_in_safe_zone(obstacles)
        if safe_zone_obstacles:
            instruction = self._process_safe_zone_obstacles(safe_zone_obstacles)
            if instruction:
                return instruction
        
        # Prioridad 3: Zona segura libre (instrucción positiva)
        if not safe_zone_obstacles and obstacles:
            # Hay obstáculos pero no en la zona segura
            instruction = self._process_safe_zone_clear()
            if instruction:
                return instruction
        
        # Prioridad 4: Obstáculos peligrosos fuera de zona segura
        dangerous_obstacles = self._get_dangerous_obstacles(obstacles)
        if dangerous_obstacles:
            instruction = self._process_obstacles(dangerous_obstacles)
            if instruction:
                return instruction
        
        # Prioridad 5: Pasos de peatones
        if crosswalks:
            instruction = self._process_crosswalk(crosswalks[0])
            if instruction:
                return instruction
        
        # Si no hay detecciones pero el sistema está activo, confirmar zona segura
        if not detections:
            return self._process_safe_zone_clear()
        
        return None
    
    def _process_traffic_light(self, traffic_light: Dict) -> Optional[Dict]:
        """Procesa detección de semáforo"""
        state = traffic_light.get('state')
        confidence = traffic_light.get('confidence', 0)
        
        if confidence < 0.4:
            return None
        
        instruction = None
        
        if state == 'red':
            instruction = {
                'text': '⚠️ Semáforo en rojo. Espera antes de cruzar.',
                'priority': 10,
                'type': 'traffic_light',
                'action': 'stop'
            }
        elif state == 'yellow':
            instruction = {
                'text': '⚠️ Semáforo en amarillo. Ten precaución.',
                'priority': 9,
                'type': 'traffic_light',
                'action': 'caution'
            }
        elif state == 'green':
            instruction = {
                'text': '✅ Semáforo en verde. Puedes cruzar con precaución.',
                'priority': 8,
                'type': 'traffic_light',
                'action': 'go'
            }
        else:
            instruction = {
                'text': '🔴 Semáforo detectado. Verifica el estado antes de cruzar.',
                'priority': 7,
                'type': 'traffic_light',
                'action': 'check'
            }
        
        return self._check_cooldown(instruction)
    
    def _process_obstacles(self, obstacles: List[Dict]) -> Optional[Dict]:
        """Procesa detecciones de obstáculos"""
        if not obstacles:
            return None
        
        center_x = self.frame_width / 2
        obstacles_left = []
        obstacles_right = []
        obstacles_center = []
        
        for obs in obstacles:
            x, y, w, h = obs['bbox']
            center_obs_x = x + w / 2
            distance = self._calculate_distance(obs['bbox'])
            
            # Categorizar por posición
            if center_obs_x < center_x - self.frame_width * 0.15:
                obstacles_left.append({**obs, 'distance': distance})
            elif center_obs_x > center_x + self.frame_width * 0.15:
                obstacles_right.append({**obs, 'distance': distance})
            else:
                obstacles_center.append({**obs, 'distance': distance})
        
        # Prioridad: obstáculos en el centro
        if obstacles_center:
            closest = min(obstacles_center, key=lambda x: x['distance'])
            return self._check_cooldown({
                'text': f"⚠️ Obstáculo {closest.get('class_es', 'objeto')} directamente adelante. Detente o busca una ruta alternativa.",
                'priority': 9,
                'type': 'obstacle',
                'action': 'stop',
                'direction': 'center'
            })
        
        # Obstáculos a los lados
        if obstacles_left and obstacles_right:
            return self._check_cooldown({
                'text': '⚠️ Obstáculos a ambos lados. Continúa con precaución.',
                'priority': 7,
                'type': 'obstacle',
                'action': 'caution',
                'direction': 'both'
            })
        elif obstacles_left:
            closest = min(obstacles_left, key=lambda x: x['distance'])
            return self._check_cooldown({
                'text': f"Obstáculo {closest.get('class_es', 'objeto')} a la izquierda. Muévete ligeramente a la derecha.",
                'priority': 6,
                'type': 'obstacle',
                'action': 'move_right',
                'direction': 'left'
            })
        elif obstacles_right:
            closest = min(obstacles_right, key=lambda x: x['distance'])
            return self._check_cooldown({
                'text': f"Obstáculo {closest.get('class_es', 'objeto')} a la derecha. Muévete ligeramente a la izquierda.",
                'priority': 6,
                'type': 'obstacle',
                'action': 'move_left',
                'direction': 'right'
            })
        
        return None
    
    def _process_crosswalk(self, crosswalk: Dict) -> Optional[Dict]:
        """Procesa detección de paso de peatones"""
        confidence = crosswalk.get('confidence', 0)
        
        if confidence < 0.3:
            return None
        
        return self._check_cooldown({
            'text': '🚶 Paso de peatones detectado. Verifica el tráfico antes de cruzar.',
            'priority': 5,
            'type': 'crosswalk',
            'action': 'caution'
        })
    
    def _get_dangerous_obstacles(self, obstacles: List[Dict]) -> List[Dict]:
        """Filtra obstáculos peligrosos (cercanos y grandes)"""
        dangerous = []
        
        for obs in obstacles:
            x, y, w, h = obs['bbox']
            
            # Calcular tamaño relativo
            area = w * h
            frame_area = self.frame_width * self.frame_height
            relative_size = area / frame_area if frame_area > 0 else 0
            
            # Obstáculo grande = cercano
            is_close = relative_size > 0.05  # Más del 5% del frame
            
            # Obstáculo en zona de peligro (parte inferior)
            is_in_danger_zone = y + h > self.frame_height * (1 - self.danger_zone)
            
            # Alta confianza
            is_confident = obs.get('confidence', 0) > 0.6
            
            if (is_close or is_in_danger_zone) and is_confident:
                dangerous.append(obs)
        
        return dangerous
    
    def _calculate_distance(self, bbox: List[float]) -> float:
        """Calcula distancia aproximada basada en tamaño"""
        x, y, w, h = bbox
        area = w * h
        frame_area = self.frame_width * self.frame_height
        relative_size = area / frame_area if frame_area > 0 else 0.01
        
        # Tamaño relativo inversamente proporcional a distancia
        return 1.0 / (relative_size + 0.01)
    
    def _check_cooldown(self, instruction: Dict) -> Optional[Dict]:
        """Verifica cooldown para evitar instrucciones repetitivas"""
        import time
        
        now = time.time() * 1000  # milisegundos
        key = f"{instruction['type']}_{instruction['action']}"
        
        if key in self.last_instruction_time:
            time_since = now - self.last_instruction_time[key]
            if time_since < self.instruction_cooldown and instruction['priority'] < 9:
                # Solo ignorar si no es de alta prioridad
                return None
        
        self.last_instruction_time[key] = now
        return instruction
    
    def get_safe_zone_coordinates(self, detections: Optional[List[Dict]] = None) -> Dict:
        """
        Calcula las coordenadas de la zona segura en el frame (trapecio con perspectiva)
        Ajusta dinámicamente según pasos de peatones y líneas detectadas
        
        Args:
            detections: Lista de detecciones para ajustar la zona según el camino detectado
        
        Returns:
            Dict con coordenadas del trapecio (bottom_left, bottom_right, top_left, top_right)
        """
        # Calcular centro base (centro del frame)
        base_center_x = self.frame_width / 2
        
        # Ajustar centro según detecciones de camino (pasos de peatones, líneas)
        center_x = self._calculate_path_center(detections, base_center_x)
        
        # Parte inferior (cerca de la cámara) - más ancha
        # Representa ~60-80cm de ancho real a ~0.5m de distancia
        bottom_width = self.frame_width * self.safe_zone_bottom_width_ratio
        bottom_y = self.frame_height * (1 - self.safe_zone_bottom_margin)
        bottom_left_x = center_x - (bottom_width / 2)
        bottom_right_x = center_x + (bottom_width / 2)
        
        # Parte superior (lejos de la cámara) - más estrecha
        # Representa ~30-40cm de ancho real a ~2-3m de distancia
        top_width = self.frame_width * self.safe_zone_top_width_ratio
        top_y = bottom_y - (self.frame_height * self.safe_zone_height_ratio)
        top_left_x = center_x - (top_width / 2)
        top_right_x = center_x + (top_width / 2)
        
        return {
            'bottom_left': [float(bottom_left_x), float(bottom_y)],
            'bottom_right': [float(bottom_right_x), float(bottom_y)],
            'top_left': [float(top_left_x), float(top_y)],
            'top_right': [float(top_right_x), float(top_y)],
            'center_x': float(center_x),
            'base_center_x': float(base_center_x),
            'top_y': float(top_y),
            'bottom_y': float(bottom_y),
            'top_width': float(top_width),
            'bottom_width': float(bottom_width),
            'path_adjusted': self.detected_path_center is not None,
            'path_confidence': float(self.path_confidence)
        }
    
    def _calculate_path_center(self, detections: Optional[List[Dict]], default_center: float) -> float:
        """
        Calcula el centro del camino basado en detecciones de pasos de peatones y líneas
        
        Args:
            detections: Lista de detecciones
            default_center: Centro por defecto (centro del frame)
        
        Returns:
            Centro X ajustado del camino
        """
        if not detections:
            self.detected_path_center = None
            self.path_confidence = 0.0
            return default_center
        
        # Buscar pasos de peatones (mejor indicador del camino)
        crosswalks = [d for d in detections if d.get('type') == 'crosswalk']
        
        if crosswalks:
            # Usar el centro del paso de peatones como guía
            crosswalk = crosswalks[0]
            x, y, w, h = crosswalk['bbox']
            path_center = x + (w / 2)
            confidence = crosswalk.get('confidence', 0.5)
            
            # Suavizar el ajuste (no cambiar bruscamente)
            if self.detected_path_center is None:
                self.detected_path_center = path_center
            else:
                # Interpolación suave (70% nuevo, 30% anterior)
                self.detected_path_center = self.detected_path_center * 0.3 + path_center * 0.7
            
            self.path_confidence = confidence
            
            # Ajustar el centro de la zona segura hacia el centro del paso de peatones
            # Pero limitar el ajuste para no desviarse demasiado
            max_adjustment = self.frame_width * 0.15  # Máximo 15% del ancho
            adjustment = (self.detected_path_center - default_center) * confidence
            adjustment = max(-max_adjustment, min(max_adjustment, adjustment))
            
            return default_center + adjustment
        
        # Si no hay pasos de peatones, buscar líneas verticales u otros indicadores
        # Por ahora, usar centro por defecto
        self.detected_path_center = None
        self.path_confidence = 0.0
        return default_center
    
    def _is_object_in_safe_zone(self, bbox: List[float]) -> bool:
        """
        Verifica si un objeto está dentro de la zona segura (trapecio con perspectiva)
        
        Args:
            bbox: [x, y, width, height] del objeto
        
        Returns:
            True si el objeto está dentro de la zona segura
        """
        safe_zone = self.get_safe_zone_coordinates()
        
        obj_x, obj_y, obj_w, obj_h = bbox
        obj_center_x = obj_x + obj_w / 2
        obj_center_y = obj_y + obj_h / 2
        
        # Verificar si el centro del objeto está dentro del trapecio
        # Usar punto en polígono para trapecio
        if not (safe_zone['top_y'] <= obj_center_y <= safe_zone['bottom_y']):
            return False
        
        # Calcular el ancho del trapecio a la altura del objeto (interpolación lineal)
        # El trapecio va de top_width (arriba) a bottom_width (abajo)
        y_ratio = (obj_center_y - safe_zone['top_y']) / (safe_zone['bottom_y'] - safe_zone['top_y'])
        width_at_y = safe_zone['top_width'] + (safe_zone['bottom_width'] - safe_zone['top_width']) * y_ratio
        
        # Verificar si el centro X está dentro del ancho del trapecio a esa altura
        left_bound = safe_zone['center_x'] - (width_at_y / 2)
        right_bound = safe_zone['center_x'] + (width_at_y / 2)
        
        center_in_zone = left_bound <= obj_center_x <= right_bound
        
        # También verificar si hay superposición significativa
        # Calcular área de superposición aproximada
        obj_bottom = obj_y + obj_h
        obj_top = obj_y
        
        # Verificar si alguna parte del objeto está en la zona
        if obj_bottom < safe_zone['top_y'] or obj_top > safe_zone['bottom_y']:
            return False
        
        # Calcular límites del trapecio en la parte superior e inferior del objeto
        obj_top_ratio = max(0, min(1, (obj_top - safe_zone['top_y']) / (safe_zone['bottom_y'] - safe_zone['top_y'])))
        obj_bottom_ratio = max(0, min(1, (obj_bottom - safe_zone['top_y']) / (safe_zone['bottom_y'] - safe_zone['top_y'])))
        
        width_at_obj_top = safe_zone['top_width'] + (safe_zone['bottom_width'] - safe_zone['top_width']) * obj_top_ratio
        width_at_obj_bottom = safe_zone['top_width'] + (safe_zone['bottom_width'] - safe_zone['top_width']) * obj_bottom_ratio
        
        left_at_obj_top = safe_zone['center_x'] - (width_at_obj_top / 2)
        right_at_obj_top = safe_zone['center_x'] + (width_at_obj_top / 2)
        left_at_obj_bottom = safe_zone['center_x'] - (width_at_obj_bottom / 2)
        right_at_obj_bottom = safe_zone['center_x'] + (width_at_obj_bottom / 2)
        
        # Verificar superposición horizontal
        obj_left = obj_x
        obj_right = obj_x + obj_w
        
        overlap_left = max(left_at_obj_top, left_at_obj_bottom, obj_left)
        overlap_right = min(right_at_obj_top, right_at_obj_bottom, obj_right)
        
        if overlap_left < overlap_right:
            overlap_width = overlap_right - overlap_left
            overlap_height = min(obj_bottom, safe_zone['bottom_y']) - max(obj_top, safe_zone['top_y'])
            overlap_area = overlap_width * overlap_height
            obj_area = obj_w * obj_h
            
            # Si hay superposición significativa (>25% del objeto)
            significant_overlap = overlap_area > obj_area * 0.25
            return center_in_zone or significant_overlap
        
        return center_in_zone
    
    def _get_obstacles_in_safe_zone(self, obstacles: List[Dict]) -> List[Dict]:
        """
        Filtra obstáculos que están dentro de la zona segura
        
        Args:
            obstacles: Lista de detecciones de obstáculos
        
        Returns:
            Lista de obstáculos dentro de la zona segura
        """
        safe_zone_obstacles = []
        
        for obs in obstacles:
            if self._is_object_in_safe_zone(obs['bbox']):
                # Calcular distancia estimada
                distance = self._calculate_distance(obs['bbox'])
                safe_zone_obstacles.append({**obs, 'distance': distance, 'in_safe_zone': True})
        
        # Ordenar por distancia (más cercanos primero)
        safe_zone_obstacles.sort(key=lambda x: x.get('distance', 1000))
        
        return safe_zone_obstacles
    
    def _process_safe_zone_obstacles(self, obstacles: List[Dict]) -> Optional[Dict]:
        """
        Procesa obstáculos dentro de la zona segura
        
        Args:
            obstacles: Lista de obstáculos en la zona segura
        
        Returns:
            Instrucción de navegación
        """
        if not obstacles:
            return None
        
        # Obtener el obstáculo más cercano
        closest = obstacles[0]
        obj_type = closest.get('class_es', 'objeto')
        
        # Determinar dirección de desviación basada en posición del obstáculo
        x, y, w, h = closest['bbox']
        obj_center_x = x + w / 2
        frame_center_x = self.frame_width / 2
        
        # Si el obstáculo está más a la izquierda del centro, desviar a la derecha
        if obj_center_x < frame_center_x:
            return self._check_cooldown({
                'text': f"⚠️ {obj_type.capitalize()} bloqueando tu camino. Muévete a la derecha.",
                'priority': 9,
                'type': 'safe_zone',
                'action': 'move_right',
                'direction': 'right',
                'obstacle_count': len(obstacles)
            })
        else:
            return self._check_cooldown({
                'text': f"⚠️ {obj_type.capitalize()} bloqueando tu camino. Muévete a la izquierda.",
                'priority': 9,
                'type': 'safe_zone',
                'action': 'move_left',
                'direction': 'left',
                'obstacle_count': len(obstacles)
            })
    
    def _process_safe_zone_clear(self) -> Optional[Dict]:
        """
        Genera instrucción cuando la zona segura está libre
        
        Returns:
            Instrucción de avanzar
        """
        return self._check_cooldown({
            'text': '✅ Zona segura libre. Sigue recto.',
            'priority': 3,
            'type': 'safe_zone',
            'action': 'go_forward',
            'direction': 'forward'
        })
    
    def reset(self):
        """Resetea el estado de la lógica"""
        self.last_instruction_time = {}

