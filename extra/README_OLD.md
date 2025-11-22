# Medición de Distancia con OpenCV

MVP para medir la distancia de objetos usando visión por computadora con OpenCV.

## 🎯 Características

- Detección de objetos por color
- Medición de distancia basada en el tamaño aparente del objeto
- Calibración simple con un objeto de referencia
- Interfaz visual en tiempo real

## 📋 Requisitos

- Python 3.7 o superior
- Cámara web
- Objeto de color conocido para detectar (por defecto: rojo)

## 🚀 Instalación

1. Crea y activa el entorno virtual:

**Windows (PowerShell):**
```bash
python -m venv venv
.\venv\Scripts\Activate.ps1
```

**Windows (CMD):**
```bash
python -m venv venv
venv\Scripts\activate
```

**Linux/Mac:**
```bash
python3 -m venv venv
source venv/bin/activate
```

2. Instala las dependencias:
```bash
pip install -r requirements.txt
```

## 💻 Uso

**Nota:** Asegúrate de tener el entorno virtual activado antes de ejecutar.

1. Ejecuta el script:
```bash
python distance_measurement.py
```

2. **Calibración inicial:**
   - Coloca un objeto de color (rojo por defecto) a 30 cm de la cámara
   - Asegúrate de que el objeto tenga aproximadamente 10 cm de ancho
   - Presiona 'c' cuando el objeto esté claramente visible para calibrar

3. **Medición:**
   - Una vez calibrado, mueve el objeto y verás la distancia medida en tiempo real
   - Presiona 'q' para salir

## ⚙️ Configuración

### Cambiar el color del objeto a detectar

Edita las siguientes líneas en `distance_measurement.py`:

```python
# Para objetos rojos (por defecto)
lower_red = np.array([0, 100, 100])
upper_red = np.array([10, 255, 255])

# Para objetos azules
lower_blue = np.array([100, 100, 100])
upper_blue = np.array([130, 255, 255])

# Para objetos verdes
lower_green = np.array([40, 100, 100])
upper_green = np.array([80, 255, 255])
```

### Ajustar parámetros de calibración

Modifica estos valores según tu objeto:

```python
calibration_distance = 30  # Distancia conocida en cm para calibración
known_object_width = 10   # Ancho conocido del objeto en cm
```

## 📝 Notas

- La precisión depende de la calidad de la cámara y la iluminación
- Funciona mejor con objetos de colores sólidos y bien iluminados
- El objeto debe tener un tamaño conocido para la calibración
- La distancia se mide en centímetros

## 🔧 Mejoras Futuras

- Detección de múltiples objetos
- Soporte para diferentes formas de objetos
- Calibración automática
- Guardar/recuperar parámetros de calibración
- Interfaz gráfica más avanzada

