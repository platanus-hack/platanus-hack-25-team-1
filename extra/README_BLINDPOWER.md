# 🚦 BlindPower - Asistente de Navegación para Personas con Discapacidad Visual

MVP funcional de un asistente de navegación implementado como backend Python (FastAPI + YOLOv8) y frontend web, diseñado para hackathones de 24 horas.

## 🎯 Características

- ✅ Detección de **semáforos** (rojo, amarillo, verde)
- ✅ Detección de **pasos de peatones**
- ✅ Detección de **obstáculos** (personas, vehículos, objetos)
- ✅ **Instrucciones de voz en tiempo real** usando Web Speech API
- ✅ Visualización de detecciones con bounding boxes
- ✅ Interfaz web responsive y accesible

## 📋 Requisitos

### Backend (Python)
- Python 3.8 o superior
- Cámara web (opcional, para testing local)

### Frontend
- Navegador moderno (Chrome, Edge, Firefox, Safari)
- Acceso a cámara del dispositivo
- Conexión a internet (para cargar modelo YOLO la primera vez)

## 🚀 Instalación y Uso

### 1. Configurar entorno virtual

```bash
# Crear entorno virtual
python -m venv venv

# Activar (Windows)
.\venv\Scripts\Activate.ps1

# Activar (Linux/Mac)
source venv/bin/activate
```

### 2. Instalar dependencias

```bash
pip install -r requirements.txt
```

**Nota:** La primera vez que ejecutes el código, YOLOv8 descargará automáticamente el modelo preentrenado `yolov8n.pt` (nano, ~6MB). Esto puede tomar unos minutos.

### 3. Iniciar el servidor backend

```bash
python app.py
```

O usando uvicorn directamente:

```bash
uvicorn app:app --host 0.0.0.0 --port 8000 --reload
```

El servidor estará disponible en `http://localhost:8000`

### 4. Abrir el frontend

Abre `index.html` en tu navegador o sirve los archivos estáticos con un servidor local:

```bash
# Python simple server
python -m http.server 8080

# O usar cualquier servidor estático
# Luego abre: http://localhost:8080/index.html
```

### 5. Usar la aplicación

1. Haz clic en **"Iniciar Copiloto"**
2. Permite el acceso a la cámara cuando el navegador lo solicite
3. La aplicación comenzará a procesar frames y dar instrucciones de voz
4. Observa las detecciones en tiempo real en la interfaz

## 📁 Estructura del Proyecto

```
blindpower/
├── app.py                 # Servidor FastAPI principal
├── object_detector.py     # Detección con YOLOv8
├── navigation_logic.py    # Lógica de navegación
├── feedback.py            # Feedback de audio (opcional)
├── index.html             # Frontend HTML
├── app.js                 # JavaScript del frontend
├── style.css              # Estilos CSS
├── requirements.txt       # Dependencias Python
└── README_BLINDPOWER.md   # Este archivo
```

## 🔧 Configuración

### Cambiar URL del servidor

En `index.html`, puedes cambiar la URL del servidor en el campo de configuración o editar directamente en `app.js`:

```javascript
const CONFIG = {
    serverUrl: 'http://localhost:8000', // Cambiar aquí
    // ...
};
```

### Ajustar frecuencia de captura

En `app.js`, modifica `captureInterval`:

```javascript
const CONFIG = {
    captureInterval: 500, // milisegundos (500ms = 2 FPS)
    // ...
};
```

### Usar modelo YOLO diferente

En `object_detector.py`, cambia el modelo:

```python
self.model_path = model_path or "yolov8n.pt"  # nano (rápido)
# Opciones: yolov8n.pt, yolov8s.pt, yolov8m.pt, yolov8l.pt, yolov8x.pt
```

## 🧪 Testing

### Probar el backend directamente

```bash
# Verificar que el servidor está funcionando
curl http://localhost:8000/health

# O abrir en navegador
# http://localhost:8000/docs (documentación interactiva de FastAPI)
```

### Endpoints disponibles

- `GET /` - Información del API
- `GET /health` - Estado del servidor
- `POST /predict` - Procesar frame (multipart/form-data)
- `POST /predict_base64` - Procesar frame (base64 JSON)

## 🐛 Solución de Problemas

### Error: "Modelo no cargado"

- Espera unos segundos después de iniciar el servidor (el modelo se carga al inicio)
- Verifica que `ultralytics` esté instalado: `pip install ultralytics`
- Revisa los logs del servidor para ver errores de carga

### Error: "No se puede conectar al servidor"

- Verifica que el backend esté ejecutándose en el puerto correcto
- Asegúrate de que la URL en el frontend sea correcta
- Verifica que no haya firewall bloqueando la conexión

### La cámara no funciona

- Verifica permisos del navegador para acceder a la cámara
- Asegúrate de usar HTTPS o localhost (algunos navegadores requieren HTTPS para getUserMedia)
- Prueba en otro navegador

### Las instrucciones de voz no funcionan

- Verifica que tu navegador soporte Web Speech API (Chrome, Edge, Safari)
- Algunos navegadores requieren interacción del usuario antes de permitir síntesis de voz
- Verifica que no esté silenciado el navegador

## 🎨 Personalización

### Cambiar colores de detección

En `app.js`, función `drawDetections()`:

```javascript
if (detection.type === 'traffic_light') {
    color = '#FF0000'; // Cambiar color
}
```

### Modificar instrucciones

En `navigation_logic.py`, edita los textos de las instrucciones:

```python
instruction = {
    'text': 'Tu texto personalizado aquí',
    # ...
}
```

## 📝 Notas para Hackathon

- **MVP rápido**: El código está optimizado para funcionar rápidamente
- **Modelo ligero**: Usa YOLOv8n (nano) para mejor rendimiento
- **Procesamiento limitado**: Procesa 2 FPS para no sobrecargar el servidor
- **Visualización**: Los bounding boxes ayudan a demostrar el funcionamiento al jurado
- **Logs**: Incluye sistema de logs para debugging durante la presentación

## 🔮 Mejoras Futuras

- [ ] Soporte para múltiples cámaras
- [ ] Guardar historial de navegación
- [ ] Modo offline con modelo local
- [ ] Integración con mapas
- [ ] Detección de más tipos de objetos
- [ ] Calibración automática de distancia
- [ ] Soporte para múltiples idiomas

## 📄 Licencia

MVP para hackathon - Uso educativo y de demostración

## 👥 Créditos

Desarrollado para hackathon de 24 horas - BlindPower 2024

