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
        
        # Zona segura FIJA: representa el corredor de paso del usuario (~60-80cm de ancho real)
        # Ubicada en la parte central inferior del frame (donde el usuario caminaría)
        # Forma trapezoidal para respetar la perspectiva (más ancha abajo, más estrecha arriba)
        # SIEMPRE CENTRADA: No se ajusta dinámicamente
        self.safe_zone_bottom_width_ratio = 0.25  # 25% del ancho en la parte inferior (cerca) - ~60cm reales
        self.safe_zone_top_width_ratio = 0.12     # 12% del ancho en la parte superior (lejos) - más estrecho
        self.safe_zone_height_ratio = 0.45        # 45% del alto del frame (parte inferior) - más distancia
        self.safe_zone_bottom_margin = 0.08       # 8% de margen desde abajo (altura de cámara)
        
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
        # crosswalks = [d for d in detections if d.get('type') == 'crosswalk']  # DESACTIVADO temporalmente
        obstacles = [d for d in detections if d.get('type') == 'obstacle']
        
        # Prioridad 1: Semáforos (máxima prioridad)
        if traffic_lights:
            instruction = self._process_traffic_light(traffic_lights[0])
            if instruction:
                return instruction
        
        # Obtener zona segura (fija, no se ajusta)
        safe_zone_coords = self.get_safe_zone_coordinates()
        
        # FILTRAR: Solo considerar objetos dentro de la zona segura (excepto autos y semáforos)
        # Los autos se detectan siempre (pueden estar fuera de la zona)
        # Los semáforos se detectan siempre (están arriba)
        filtered_obstacles = self._filter_objects_by_safe_zone(obstacles)
        
        # Prioridad 2: Zona segura (obstáculos bloqueando el camino)
        safe_zone_obstacles = self._get_obstacles_in_safe_zone(filtered_obstacles)
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
        
        # Prioridad 4: Autos (siempre detectados, incluso fuera de zona segura)
        cars = [d for d in detections if d.get('class') == 'car' or d.get('class_es') == 'auto']
        if cars:
            # Filtrar solo autos cercanos o en zona de peligro
            dangerous_cars = [c for c in cars if self._is_dangerous_object(c)]
            if dangerous_cars:
                instruction = self._process_cars(dangerous_cars)
                if instruction:
                    return instruction
        
        # Prioridad 5: Pasos de peatones (DESACTIVADO temporalmente)
        # if crosswalks:
        #     instruction = self._process_crosswalk(crosswalks[0])
        #     if instruction:
        #         return instruction
        
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
            
            # Calcular distancia real en metros
            object_type = obs.get('class', 'unknown')
            distance_meters = self._calculate_distance(obs['bbox'], object_type)
            obs['distance_meters'] = distance_meters
            
            # Solo considerar si está a menos de 2 metros
            if distance_meters < 2.0:
                # Categorizar por posición
                if center_obs_x < center_x - self.frame_width * 0.15:
                    obstacles_left.append({**obs, 'distance': distance_meters})
                elif center_obs_x > center_x + self.frame_width * 0.15:
                    obstacles_right.append({**obs, 'distance': distance_meters})
                else:
                    obstacles_center.append({**obs, 'distance': distance_meters})
        
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
        """
        Filtra obstáculos peligrosos: solo los que están a menos de 2 metros
        
        Args:
            obstacles: Lista de detecciones de obstáculos
        
        Returns:
            Lista de obstáculos peligrosos (< 2 metros)
        """
        dangerous = []
        DISTANCE_THRESHOLD = 2.0  # 2 metros
        
        for obs in obstacles:
            # Calcular distancia real en metros
            object_type = obs.get('class', 'unknown')
            distance_meters = self._calculate_distance(obs['bbox'], object_type)
            
            # Agregar distancia a la detección
            obs['distance_meters'] = distance_meters
            
            # Solo es peligroso si está a menos de 2 metros
            if distance_meters < DISTANCE_THRESHOLD:
                # También verificar confianza
                is_confident = obs.get('confidence', 0) > 0.5
                if is_confident:
                    dangerous.append(obs)
        
        return dangerous
    
    def _calculate_distance(self, bbox: List[float], object_type: str = 'unknown') -> float:
        """
        Calcula distancia aproximada en METROS desde la cámara al objeto
        Usa método basado en altura del objeto y posición vertical en el frame
        
        Args:
            bbox: [x, y, w, h] del objeto
            object_type: Tipo de objeto para estimar tamaño real
        
        Returns:
            Distancia en metros
        """
        x, y, w, h = bbox
        
        # Tamaños reales estimados en metros (altura típica)
        real_heights = {
            'person': 1.7,      # Altura promedio de una persona: ~170cm
            'car': 1.5,         # Altura promedio de un auto: ~150cm
            'truck': 2.5,       # Altura promedio de un camión: ~250cm
            'bus': 3.0,         # Altura promedio de un autobús: ~300cm
            'motorcycle': 1.2,   # Altura promedio de una moto: ~120cm
            'bicycle': 1.0,     # Altura promedio de una bicicleta: ~100cm
            'chair': 0.9,       # Altura promedio de una silla: ~90cm
            'bench': 0.5,       # Altura promedio de un banco: ~50cm
            'traffic light': 3.0, # Altura típica de un semáforo: ~300cm
            'unknown': 1.0      # Tamaño por defecto: ~100cm
        }
        
        # Obtener altura real estimada
        real_height = real_heights.get(object_type.lower(), real_heights['unknown'])
        
        # Método mejorado: usar altura del objeto y posición vertical
        # Objetos más abajo en el frame = más cerca
        # Objetos más pequeños = más lejos
        
        # Calcular posición vertical (0 = arriba, 1 = abajo)
        bottom_y = y + h
        vertical_position = bottom_y / self.frame_height if self.frame_height > 0 else 0.5
        
        # Calcular tamaño relativo del objeto
        frame_area = self.frame_width * self.frame_height
        object_area = w * h
        size_ratio = object_area / frame_area if frame_area > 0 else 0.01
        
        # Fórmula mejorada: combinar tamaño y posición
        # Objetos grandes y abajo = muy cerca
        # Objetos pequeños y arriba = lejos
        
        # Distancia base basada en tamaño
        # Si el objeto ocupa mucho del frame, está cerca
        if size_ratio > 0.1:  # Más del 10% del frame
            base_distance = 1.0  # Muy cerca
        elif size_ratio > 0.05:  # Más del 5% del frame
            base_distance = 2.0
        elif size_ratio > 0.02:  # Más del 2% del frame
            base_distance = 4.0
        elif size_ratio > 0.01:  # Más del 1% del frame
            base_distance = 6.0
        else:
            base_distance = 10.0  # Lejos
        
        # Ajustar según posición vertical
        # Objetos en la parte inferior (vertical_position > 0.7) están más cerca
        if vertical_position > 0.8:
            distance_meters = base_distance * 0.7  # Reducir distancia (más cerca)
        elif vertical_position > 0.6:
            distance_meters = base_distance * 0.85
        elif vertical_position < 0.3:
            distance_meters = base_distance * 1.5  # Aumentar distancia (más lejos)
        else:
            distance_meters = base_distance
        
        # Ajustar según altura real del objeto
        # Si el objeto es muy alto (como un semáforo), puede estar más lejos de lo que parece
        if real_height > 2.0:  # Objetos altos (semáforos, postes)
            distance_meters *= 1.3
        
        # Limitar distancia mínima y máxima razonables
        distance_meters = max(0.5, min(distance_meters, 30.0))
        
        return distance_meters
    
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
        ZONA FIJA: Siempre centrada, no se ajusta dinámicamente
        
        Args:
            detections: Lista de detecciones (ignorado, zona siempre fija)
        
        Returns:
            Dict con coordenadas del trapecio (bottom_left, bottom_right, top_left, top_right)
        """
        # Centro FIJO: siempre en el centro del frame
        center_x = self.frame_width / 2
        
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
            'base_center_x': float(center_x),  # Siempre igual al center_x (zona fija)
            'top_y': float(top_y),
            'bottom_y': float(bottom_y),
            'top_width': float(top_width),
            'bottom_width': float(bottom_width),
            'path_adjusted': False,  # Siempre False (zona fija)
            'path_confidence': 0.0  # Siempre 0 (zona fija)
        }
    
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
    
    def _get_direction_for_object_in_safe_zone(self, bbox: List[float]) -> int:
        """
        Calcula la dirección de movimiento necesaria para evitar un objeto en la zona segura
        
        Args:
            bbox: [x, y, width, height] del objeto
        
        Returns:
            0 si debe moverse a la izquierda (objeto a la derecha)
            1 si debe moverse a la derecha (objeto a la izquierda)
        """
        safe_zone = self.get_safe_zone_coordinates()
        obj_x, obj_y, obj_w, obj_h = bbox
        obj_center_x = obj_x + obj_w / 2
        
        # Comparar con el centro de la zona segura
        safe_zone_center_x = safe_zone['center_x']
        
        # Si el objeto está a la izquierda del centro de la zona segura
        # → moverse a la derecha (1) para dejarlo a la izquierda
        if obj_center_x < safe_zone_center_x:
            return 1  # Moverse a la derecha
        else:
            return 0  # Moverse a la izquierda
    
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
                # Calcular distancia real en metros
                object_type = obs.get('class', 'unknown')
                distance_meters = self._calculate_distance(obs['bbox'], object_type)
                obs['distance_meters'] = distance_meters
                
                # Calcular dirección de movimiento (0 = izquierda, 1 = derecha)
                direction = self._get_direction_for_object_in_safe_zone(obs['bbox'])
                
                # Solo considerar si está a menos de 2 metros
                if distance_meters < 2.0:
                    safe_zone_obstacles.append({
                        **obs, 
                        'distance': distance_meters, 
                        'in_safe_zone': True,
                        'direction': direction
                    })
        
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
    
    def _filter_objects_by_safe_zone(self, obstacles: List[Dict]) -> List[Dict]:
        """
        Filtra objetos: solo incluye los que están dentro de la zona segura
        EXCEPCIÓN: Autos siempre se incluyen (pueden estar fuera)
        
        Args:
            obstacles: Lista de detecciones de obstáculos
        
        Returns:
            Lista filtrada de obstáculos
        """
        filtered = []
        
        for obs in obstacles:
            # Autos siempre se incluyen (sin importar posición)
            if obs.get('class') == 'car' or obs.get('class_es') == 'auto':
                filtered.append(obs)
            # Otros objetos solo si están en zona segura
            elif self._is_object_in_safe_zone(obs['bbox']):
                filtered.append(obs)
        
        return filtered
    
    def _is_dangerous_object(self, obj: Dict) -> bool:
        """
        Verifica si un objeto es peligroso (cercano o grande)
        
        Args:
            obj: Detección de objeto
        
        Returns:
            True si es peligroso
        """
        x, y, w, h = obj['bbox']
        
        # Calcular tamaño relativo
        area = w * h
        frame_area = self.frame_width * self.frame_height
        relative_size = area / frame_area if frame_area > 0 else 0
        
        # Objeto grande = cercano
        is_close = relative_size > 0.05  # Más del 5% del frame
        
        # Objeto en zona de peligro (parte inferior)
        is_in_danger_zone = y + h > self.frame_height * (1 - self.danger_zone)
        
        # Alta confianza
        is_confident = obj.get('confidence', 0) > 0.6
        
        return (is_close or is_in_danger_zone) and is_confident
    
    def _process_cars(self, cars: List[Dict]) -> Optional[Dict]:
        """
        Procesa detecciones de autos (siempre detectados, incluso fuera de zona)
        Solo marca como peligrosos los que están a menos de 2 metros
        
        Args:
            cars: Lista de detecciones de autos
        
        Returns:
            Instrucción de navegación o None
        """
        if not cars:
            return None
        
        # Calcular distancia para cada auto
        dangerous_cars = []
        for car in cars:
            distance_meters = self._calculate_distance(car['bbox'], 'car')
            car['distance_meters'] = distance_meters
            
            # Solo es peligroso si está a menos de 2 metros
            if distance_meters < 2.0:
                dangerous_cars.append(car)
        
        if dangerous_cars:
            closest = min(dangerous_cars, key=lambda x: x.get('distance_meters', 10.0))
            distance = closest.get('distance_meters', 0)
            return self._check_cooldown({
                'text': f"⚠️ Auto detectado a {distance:.1f}m. Ten precaución.",
                'priority': 8,
                'type': 'obstacle',
                'action': 'caution',
                'direction': 'center'
            })
        
        return None
    
    def reset(self):
        """Resetea el estado de la lógica"""
        self.last_instruction_time = {}

