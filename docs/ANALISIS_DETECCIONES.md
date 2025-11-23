# 📊 Análisis de Capacidades de Detección - BlindPower

## Resumen Ejecutivo

Este proyecto es un **asistente de navegación para personas con discapacidad visual** que utiliza visión por computadora para detectar objetos y generar instrucciones de voz en tiempo real.

---

## 🎯 Objetos que el Sistema Puede Detectar

### 1. **SEMÁFOROS** 🚦
**Prioridad: MÁXIMA (10)**

#### Métodos de Detección:
- **YOLOv8**: Detecta semáforos usando el modelo preentrenado COCO
- **Detección por Color**: Método complementario que busca círculos rojos/amarillos/verdes en la parte superior del frame

#### Estados Detectados:
- ✅ **Rojo** (`state: 'red'`) → "Semáforo en rojo. Espera antes de cruzar."
- ⚠️ **Amarillo** (`state: 'yellow'`) → "Semáforo en amarillo. Ten precaución."
- ✅ **Verde** (`state: 'green'`) → "Semáforo en verde. Puedes cruzar con precaución."
- ❓ **Indeterminado** → "Semáforo detectado. Verifica el estado antes de cruzar."

#### Información Proporcionada:
- Bounding box del semáforo
- Estado del semáforo (rojo/amarillo/verde)
- Confianza de la detección
- Posición relativa en el frame

---

### 2. **PASOS DE PEATONES** 🚶
**Prioridad: MEDIA (5)**

#### Métodos de Detección:
- **Detección por Patrones**: Busca líneas horizontales blancas en la parte inferior del frame
- **Morfología**: Usa operaciones morfológicas para detectar múltiples líneas paralelas
- **Umbral**: Detecta cuando hay 3 o más líneas horizontales

#### Características:
- Analiza la región inferior del frame (60% hacia abajo)
- Busca líneas blancas con threshold de 200
- Calcula bounding box de todas las líneas detectadas
- Confianza basada en número de líneas encontradas

#### Instrucción:
- "Paso de peatones detectado. Verifica el tráfico antes de cruzar."

---

### 3. **OBSTÁCULOS** ⚠️
**Prioridad: ALTA (6-9)**

#### Tipos de Obstáculos Detectados:

##### Vehículos:
- 🚗 **Auto** (`car`)
- 🚛 **Camión** (`truck`)
- 🚌 **Autobús** (`bus`)
- 🏍️ **Motocicleta** (`motorcycle`)
- 🚲 **Bicicleta** (`bicycle`)

##### Personas:
- 👤 **Persona** (`person`)

##### Objetos:
- ☂️ **Paraguas** (`umbrella`)
- 🎒 **Mochila** (`backpack`)
- 👜 **Bolso** (`handbag`)
- 🧳 **Maleta** (`suitcase`)
- 💺 **Silla** (`chair`)
- 🪑 **Banco** (`bench`)

#### Análisis de Obstáculos:

**Categorización por Posición:**
- **Centro**: Obstáculos directamente adelante → Prioridad 9
- **Izquierda**: Obstáculos a la izquierda → Prioridad 6
- **Derecha**: Obstáculos a la derecha → Prioridad 6
- **Ambos lados**: Obstáculos a ambos lados → Prioridad 7

**Cálculo de Distancia:**
- Basado en tamaño relativo del objeto en el frame
- Objetos grandes = cercanos
- Objetos pequeños = lejanos

**Zona de Peligro:**
- 30% inferior del frame = zona de peligro
- Obstáculos en esta zona tienen mayor prioridad

#### Instrucciones Generadas:
- **Obstáculo en centro**: "Obstáculo [tipo] directamente adelante. Detente o busca una ruta alternativa."
- **Obstáculo a la izquierda**: "Obstáculo [tipo] a la izquierda. Muévete ligeramente a la derecha."
- **Obstáculo a la derecha**: "Obstáculo [tipo] a la derecha. Muévete ligeramente a la izquierda."
- **Obstáculos a ambos lados**: "Obstáculos a ambos lados. Continúa con precaución."

---

### 4. **ZONA SEGURA** ✅
**Prioridad: MEDIA-BAJA (3-9)**

#### Concepto:
- Representa el **corredor de paso del usuario** (~60-80cm de ancho real)
- Forma **trapezoidal** para respetar la perspectiva
- Más ancha abajo (cerca) → Más estrecha arriba (lejos)

#### Dimensiones:
- **Ancho inferior**: 25% del ancho del frame (~60cm reales)
- **Ancho superior**: 12% del ancho del frame (~30-40cm reales)
- **Altura**: 45% del alto del frame
- **Margen inferior**: 8% desde abajo (altura de cámara)

#### Funcionalidades:
- **Detección de obstáculos en zona segura**: Prioridad 9
- **Ajuste dinámico**: Se ajusta según pasos de peatones detectados
- **Estado libre**: "Zona segura libre. Sigue recto." (Prioridad 3)

#### Instrucciones:
- **Obstáculo bloqueando**: "⚠️ [Objeto] bloqueando tu camino. Muévete a la [izquierda/derecha]."
- **Zona libre**: "✅ Zona segura libre. Sigue recto."

---

## 🔧 Tecnologías Utilizadas

### Backend:
- **YOLOv8** (Ultralytics): Modelo de detección de objetos preentrenado
- **OpenCV**: Procesamiento de imágenes y visión por computadora
- **FastAPI**: Servidor web para API REST
- **NumPy**: Operaciones matemáticas y arrays

### Frontend:
- **WebRTC**: Captura de video desde cámara
- **Web Speech API**: Síntesis de voz (texto a voz)
- **Canvas API**: Visualización de detecciones
- **Fetch API**: Comunicación con backend

---

## 📈 Prioridades de Instrucciones

El sistema prioriza las instrucciones en el siguiente orden:

1. **Prioridad 10**: Semáforo en rojo (ALTO)
2. **Prioridad 9**: 
   - Semáforo en amarillo
   - Obstáculo en zona segura
   - Obstáculo peligroso en centro
3. **Prioridad 8**: Semáforo en verde
4. **Prioridad 7**: 
   - Semáforo detectado (estado indeterminado)
   - Obstáculos a ambos lados
5. **Prioridad 6**: Obstáculos a los lados
6. **Prioridad 5**: Paso de peatones
7. **Prioridad 3**: Zona segura libre

---

## 🎨 Visualización

### En el Frontend:
- **Bounding boxes**: Rectángulos alrededor de objetos detectados
- **Zona segura**: Trapecio verde semi-transparente
- **Información de detecciones**: Lista de objetos detectados
- **Instrucciones**: Texto mostrado en pantalla y leído por voz

### Colores:
- **Verde**: Zona segura, semáforo en verde
- **Rojo**: Semáforo en rojo, obstáculos peligrosos
- **Amarillo**: Semáforo en amarillo, advertencias

---

## 🔍 Limitaciones Actuales

### No Detecta (aún):
- ❌ **Huellas podotáctiles** (vías podotáctiles) - *En desarrollo en `tactile_test/`*
- ❌ **Señales de tráfico** (excepto stop sign)
- ❌ **Bordillos o escalones**
- ❌ **Pozos o desniveles**
- ❌ **Animales** (perros, gatos, etc.)

### Limitaciones Técnicas:
- **Modelo YOLOv8**: Usa modelo COCO preentrenado (80 clases)
- **Detección de semáforos**: Puede fallar con semáforos pequeños o lejanos
- **Detección de pasos de peatones**: Solo detecta líneas horizontales blancas
- **Zona segura**: Fija, no se adapta a cambios de terreno

---

## 🚀 Funcionalidades Adicionales

### Sistema de Cooldown:
- Evita instrucciones repetitivas
- Cooldown de 2 segundos entre instrucciones similares
- No aplica a instrucciones de alta prioridad (9+)

### Cálculo de Distancia:
- Estimación basada en tamaño relativo del objeto
- No es medición precisa, solo aproximación

### Ajuste Dinámico de Zona Segura:
- Se ajusta según pasos de peatones detectados
- Interpolación suave para evitar cambios bruscos
- Máximo ajuste: 15% del ancho del frame

---

## 📊 Estadísticas de Detección

### Modelo YOLOv8:
- **Clases detectables**: 80 clases COCO
- **Clases relevantes filtradas**: ~12 clases
- **Confianza mínima**: 0.5 (configurable)
- **Velocidad**: ~30 FPS en GPU, ~5-10 FPS en CPU

### Métodos Complementarios:
- **Semáforos por color**: Confianza 0.7 (fija)
- **Pasos de peatones**: Confianza basada en número de líneas (máx 0.8)

---

## 🎯 Casos de Uso

### Escenarios Soportados:
1. ✅ **Caminar por acera**: Detecta obstáculos y zona segura
2. ✅ **Cruzar calle**: Detecta semáforos y pasos de peatones
3. ✅ **Navegación en interiores**: Detecta obstáculos (personas, muebles)
4. ✅ **Evitar colisiones**: Detecta vehículos y objetos cercanos

### Escenarios No Soportados (aún):
1. ❌ **Seguir vías podotáctiles**: En desarrollo
2. ❌ **Detectar bordillos**: No implementado
3. ❌ **Navegación GPS**: No incluido
4. ❌ **Reconocimiento de texto**: No incluido

---

## 📝 Notas Técnicas

### Formato de Detecciones:
```json
{
  "bbox": [x, y, width, height],
  "class": "car",
  "class_es": "auto",
  "confidence": 0.85,
  "type": "obstacle",
  "state": null  // Solo para semáforos
}
```

### Tipos de Detección:
- `traffic_light`: Semáforos
- `crosswalk`: Pasos de peatones
- `obstacle`: Obstáculos (vehículos, personas, objetos)
- `other`: Otros objetos no categorizados

---

## 🔮 Futuras Mejoras (Basado en código)

### En Desarrollo:
- ✅ **Detección de huellas podotáctiles** (`tactile_test/` con modelo `best.pt`)
- 🔄 **Segmentación de suelo** (mencionado en código pero no implementado completamente)
- 🔄 **Tracking de objetos** (mencionado pero no implementado)

### Potenciales Mejoras:
- Integración de modelo `best.pt` para huellas podotáctiles
- Mejora de detección de semáforos con modelos especializados
- Detección de señales de tráfico adicionales
- Reconocimiento de texto (nombres de calles, números)
- Integración con GPS para navegación

---

## 📚 Archivos Clave

### Backend:
- `backend/object_detector.py`: Lógica de detección con YOLOv8
- `backend/navigation_logic.py`: Generación de instrucciones
- `backend/app.py`: Servidor FastAPI

### Frontend:
- `frontend/app.js`: Captura de video y comunicación con API
- `frontend/index.html`: Interfaz de usuario

### Desarrollo:
- `tactile_test/`: Pruebas del modelo de huellas podotáctiles (`best.pt`)

---

## ✅ Conclusión

El sistema **BlindPower** es capaz de detectar:

1. ✅ **Semáforos** con estado (rojo/amarillo/verde)
2. ✅ **Pasos de peatones** (líneas horizontales)
3. ✅ **Obstáculos** (12 tipos: vehículos, personas, objetos)
4. ✅ **Zona segura** (corredor de paso del usuario)
5. 🔄 **Huellas podotáctiles** (en desarrollo con modelo `best.pt`)

**Total de clases detectables**: ~12 clases relevantes de las 80 del modelo COCO, más detecciones complementarias (semáforos por color, pasos de peatones por patrones).

