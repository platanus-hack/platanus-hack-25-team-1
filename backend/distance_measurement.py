import cv2
import numpy as np
import math

class DistanceMeasurer:
    """
    Clase para medir la distancia de objetos usando OpenCV.
    Utiliza el tamaño aparente del objeto para estimar la distancia.
    """
    
    def __init__(self, focal_length=None, known_width=None, known_height=None):
        """
        Inicializa el medidor de distancia.
        
        Args:
            focal_length: Distancia focal de la cámara (se calcula si no se proporciona)
            known_width: Ancho conocido del objeto en cm (para calibración)
            known_height: Altura conocida del objeto en cm (para calibración)
        """
        self.focal_length = focal_length
        self.known_width = known_width  # en cm
        self.known_height = known_height  # en cm
        
    def calculate_focal_length(self, known_distance, known_width, width_in_image):
        """
        Calcula la distancia focal usando un objeto de referencia.
        
        Args:
            known_distance: Distancia conocida del objeto en cm
            known_width: Ancho conocido del objeto en cm
            width_in_image: Ancho del objeto en píxeles en la imagen
        """
        self.focal_length = (width_in_image * known_distance) / known_width
        print(f"Distancia focal calculada: {self.focal_length:.2f} píxeles")
        return self.focal_length
    
    def distance_to_camera(self, known_width, width_in_image):
        """
        Calcula la distancia al objeto usando el ancho conocido.
        
        Args:
            known_width: Ancho real del objeto en cm
            width_in_image: Ancho del objeto en píxeles en la imagen
            
        Returns:
            Distancia en cm
        """
        if self.focal_length is None:
            return None
        return (known_width * self.focal_length) / width_in_image
    
    def detect_object_by_color(self, frame, lower_bound, upper_bound):
        """
        Detecta un objeto por su color usando máscara HSV.
        
        Args:
            frame: Frame de la cámara
            lower_bound: Límite inferior del color en HSV (ej: np.array([0, 100, 100]))
            upper_bound: Límite superior del color en HSV (ej: np.array([10, 255, 255]))
            
        Returns:
            Contornos detectados y frame procesado
        """
        hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
        mask = cv2.inRange(hsv, lower_bound, upper_bound)
        
        # Operaciones morfológicas para limpiar la máscara
        kernel = np.ones((5, 5), np.uint8)
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)
        mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)
        
        # Encontrar contornos
        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        return contours, mask
    
    def detect_largest_contour(self, contours, min_area=100):
        """
        Encuentra el contorno más grande.
        
        Args:
            contours: Lista de contornos
            min_area: Área mínima para considerar un contorno válido
            
        Returns:
            El contorno más grande o None
        """
        if not contours:
            return None
        
        # Filtrar por área mínima
        valid_contours = [c for c in contours if cv2.contourArea(c) > min_area]
        
        if not valid_contours:
            return None
        
        # Retornar el contorno más grande
        return max(valid_contours, key=cv2.contourArea)
    
    def get_object_dimensions(self, contour):
        """
        Obtiene las dimensiones del objeto en píxeles.
        
        Args:
            contour: Contorno del objeto
            
        Returns:
            Ancho y alto en píxeles, y bounding box
        """
        x, y, w, h = cv2.boundingRect(contour)
        return w, h, (x, y, w, h)
    
    def draw_measurement(self, frame, bbox, distance):
        """
        Dibuja la medición en el frame.
        
        Args:
            frame: Frame de la cámara
            bbox: Bounding box (x, y, w, h)
            distance: Distancia calculada en cm
        """
        x, y, w, h = bbox
        
        # Dibujar rectángulo alrededor del objeto
        cv2.rectangle(frame, (x, y), (x + w, y + h), (0, 255, 0), 3)
        
        # Dibujar círculo en el centro del objeto
        center_x = x + w // 2
        center_y = y + h // 2
        cv2.circle(frame, (center_x, center_y), 5, (0, 255, 0), -1)
        
        # Mostrar distancia con fondo para mejor legibilidad
        if distance is not None:
            text = f"Distancia: {distance:.1f} cm"
            text_size = cv2.getTextSize(text, cv2.FONT_HERSHEY_SIMPLEX, 0.7, 2)[0]
            # Fondo negro semitransparente
            cv2.rectangle(frame, (x, y - 35), (x + text_size[0] + 10, y - 5), (0, 0, 0), -1)
            cv2.putText(frame, text, (x + 5, y - 15), 
                       cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
        else:
            text = "Calibrando..."
            text_size = cv2.getTextSize(text, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 2)[0]
            cv2.rectangle(frame, (x, y - 30), (x + text_size[0] + 10, y - 5), (0, 0, 0), -1)
            cv2.putText(frame, text, (x + 5, y - 10), 
                       cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 255), 2)


def main():
    """
    Función principal para ejecutar la medición de distancia.
    """
    # Inicializar cámara
    cap = cv2.VideoCapture(0)
    
    if not cap.isOpened():
        print("Error: No se pudo abrir la cámara")
        return
    
    # Configuración inicial para detectar naranjas
    # Rango HSV para color naranja (entre rojo y amarillo)
    lower_orange = np.array([5, 100, 100])   # Límite inferior naranja
    upper_orange = np.array([25, 255, 255])  # Límite superior naranja
    
    # Crear medidor de distancia
    measurer = DistanceMeasurer()
    
    # Modo de calibración
    calibration_mode = True
    calibration_distance = 30  # Distancia conocida en cm para calibración
    known_object_width = 7.5  # Diámetro promedio de una naranja en cm
    
    print("=" * 60)
    print("MEDICIÓN DE DISTANCIA CON OPENCV - DETECCIÓN DE NARANJAS")
    print("=" * 60)
    print("\nInstrucciones:")
    print(f"1. Coloca la naranja a {calibration_distance} cm de la cámara")
    print(f"2. Asegúrate de que la naranja esté bien iluminada y visible")
    print("3. Presiona 'c' para calibrar cuando la naranja esté claramente detectada")
    print("4. Presiona 'q' para salir")
    print("\nLa naranja debe estar completamente visible en la imagen")
    print("=" * 60)
    
    while True:
        ret, frame = cap.read()
        if not ret:
            break
        
        # Voltear frame horizontalmente para efecto espejo
        frame = cv2.flip(frame, 1)
        
        # Detectar naranja
        contours, mask = measurer.detect_object_by_color(frame, lower_orange, upper_orange)
        largest_contour = measurer.detect_largest_contour(contours, min_area=500)
        
        distance = None
        
        # Información general en pantalla
        info_y = 30
        cv2.putText(frame, "NARANJA DETECTADA" if largest_contour is not None else "BUSCANDO NARANJA...", 
                   (10, info_y), cv2.FONT_HERSHEY_SIMPLEX, 0.7, 
                   (0, 255, 0) if largest_contour is not None else (0, 0, 255), 2)
        
        if largest_contour is not None:
            w, h, bbox = measurer.get_object_dimensions(largest_contour)
            
            if calibration_mode:
                # Mostrar información de calibración
                info_y += 35
                cv2.putText(frame, "MODO CALIBRACION", 
                           (10, info_y), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 255), 2)
                info_y += 25
                cv2.putText(frame, f"Coloca la naranja a {calibration_distance} cm", 
                           (10, info_y), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)
                info_y += 25
                cv2.putText(frame, f"Ancho detectado: {w} px", 
                           (10, info_y), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)
                info_y += 25
                cv2.putText(frame, "Presiona 'c' para calibrar", 
                           (10, info_y), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 255), 2)
            else:
                # Calcular distancia
                if measurer.focal_length is not None:
                    distance = measurer.distance_to_camera(known_object_width, w)
                    info_y += 35
                    cv2.putText(frame, "MODO MEDICION", 
                               (10, info_y), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)
            
            # Dibujar medición
            measurer.draw_measurement(frame, bbox, distance)
        else:
            info_y += 35
            cv2.putText(frame, "No se detecto naranja", 
                       (10, info_y), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 255), 1)
            info_y += 25
            cv2.putText(frame, "Asegurate de buena iluminacion", 
                       (10, info_y), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)
        
        # Instrucciones en la parte inferior
        cv2.putText(frame, "Presiona 'q' para salir", 
                   (10, frame.shape[0] - 20), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)
        
        # Mostrar frames
        cv2.imshow('Medicion de Distancia - Naranja', frame)
        cv2.imshow('Mascara de Deteccion', mask)
        
        # Controles
        key = cv2.waitKey(1) & 0xFF
        if key == ord('q'):
            break
        elif key == ord('c') and largest_contour is not None and calibration_mode:
            w, h, bbox = measurer.get_object_dimensions(largest_contour)
            measurer.calculate_focal_length(calibration_distance, known_object_width, w)
            calibration_mode = False
            print(f"\nCalibración completada!")
            print(f"Ahora puedes mover el objeto y ver la distancia medida.")
    
    cap.release()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()

