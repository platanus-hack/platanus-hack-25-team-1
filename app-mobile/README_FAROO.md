# Faroo v2 - App Móvil

Aplicación móvil de asistencia de navegación para personas con discapacidad visual, construida con Expo React Native.

## Características

- **Cámara en tiempo real**: Captura frames y los envía al backend para procesamiento
- **Detección de obstáculos**: Visualiza obstáculos, semáforos y otros objetos en tiempo real
- **Zona segura**: Muestra una zona de navegación segura con perspectiva realista
- **Instrucciones de voz**: Síntesis de voz en español para guiar al usuario
- **Logo Faroo**: Interfaz con el logo característico de Faroo

## Requisitos previos

- Node.js 18+ instalado
- Expo CLI instalado globalmente: `npm install -g expo-cli`
- Backend de BlindPower ejecutándose (ver `/backend`)
- Dispositivo móvil o emulador con cámara

## Instalación

1. Instalar dependencias:
```bash
npm install
```

2. Iniciar el servidor de desarrollo:
```bash
npm start
```

3. Escanear el código QR con la app Expo Go (Android/iOS) o ejecutar en emulador:
```bash
# Para Android
npm run android

# Para iOS
npm run ios
```

## Configuración

### URL del Backend

Por defecto, la app intenta conectarse a `http://localhost:8000`. Para cambiar esto:

1. Edita el archivo `app/(tabs)/index.tsx`
2. Busca la línea: `const [serverUrl, setServerUrl] = useState('http://localhost:8000');`
3. Cambia la URL por la de tu backend

**Importante**: Si estás usando un dispositivo físico, necesitas usar la IP local de tu computadora, no `localhost`. Por ejemplo: `http://192.168.1.100:8000`

### Encontrar tu IP local

**macOS/Linux:**
```bash
ifconfig | grep "inet " | grep -v 127.0.0.1
```

**Windows:**
```bash
ipconfig
```

## Uso

1. **Conceder permisos**: La primera vez que abras la app, deberás conceder permisos de cámara
2. **Iniciar Copiloto**: Presiona el botón "🚀 Iniciar Copiloto"
3. **Navegación**: La app comenzará a:
   - Capturar frames cada 500ms
   - Enviarlos al backend para procesamiento
   - Mostrar detecciones en pantalla con rectángulos de colores
   - Reproducir instrucciones de voz
4. **Detener**: Presiona "⏹ Detener" cuando termines

## Componentes principales

### Archivos importantes

- `app/(tabs)/index.tsx` - Pantalla principal de Faroo con cámara
- `services/api.ts` - Servicio para comunicación con el backend
- `app/(tabs)/_layout.tsx` - Layout de navegación

### Funcionalidades implementadas

#### 1. Captura de cámara
- Captura automática de frames cada 500ms (2 FPS)
- Soporte para cámara frontal y trasera
- Prevención de capturas concurrentes

#### 2. Comunicación con backend
- Envío de imágenes al endpoint `/predict`
- Manejo de errores de red
- Health check del servidor

#### 3. Visualización de detecciones
- Dibujado de bounding boxes con `react-native-svg`
- Colores según tipo y distancia:
  - 🔴 Rojo: Obstáculo cercano en zona segura
  - 🟠 Naranja: Obstáculo cercano fuera de zona
  - ⚫ Gris: Obstáculo lejano
  - 🟢 Verde/🟡 Amarillo/🔴 Rojo: Semáforos según estado
- Zona segura con trapecio en perspectiva
- Etiquetas con nombre y distancia

#### 4. Síntesis de voz
- Reproducción de instrucciones en español
- Cooldown de 2 segundos entre instrucciones similares
- Cancelación de instrucciones de baja prioridad

## Estructura de código

```
app-mobile/
├── app/
│   ├── (tabs)/
│   │   ├── index.tsx         # Pantalla principal Faroo
│   │   ├── explore.tsx       # Pantalla de configuración (opcional)
│   │   └── _layout.tsx       # Layout de tabs
│   ├── _layout.tsx           # Layout raíz
│   └── modal.tsx            # Modal de ejemplo
├── services/
│   └── api.ts               # Servicio API
├── components/              # Componentes reutilizables
├── constants/              # Constantes y temas
└── assets/                 # Recursos (imágenes, fonts)
```

## Troubleshooting

### No se puede conectar al backend
- Verifica que el backend esté ejecutándose
- Si usas un dispositivo físico, usa la IP local en lugar de `localhost`
- Verifica que el firewall no bloquee el puerto 8000

### La cámara no funciona
- Verifica que hayas concedido permisos de cámara
- Reinicia la app
- En iOS, verifica los permisos en Configuración > Faroo

### Las detecciones no aparecen
- Verifica la consola de logs con `npx react-native log-android` o `npx react-native log-ios`
- Verifica que el backend esté retornando detecciones válidas

## API del Backend

La app se comunica con el backend usando el endpoint `/predict`:

**Request:**
```
POST /predict
Content-Type: multipart/form-data

file: <imagen JPEG/PNG>
```

**Response:**
```json
{
  "success": true,
  "detections": [...],
  "instruction": {...},
  "safe_zone": {...},
  "frame_info": {...}
}
```

Ver documentación del backend para más detalles.

## Mejoras futuras

- [ ] Pantalla de configuración para cambiar URL del servidor
- [ ] Ajuste de intervalo de captura
- [ ] Historial de instrucciones
- [ ] Modo nocturno
- [ ] Grabación de sesiones para debugging
- [ ] Soporte offline con caché de instrucciones

## Licencia

MIT - Ver LICENSE para más detalles

## Contacto

Para reportar bugs o sugerencias, abre un issue en el repositorio.
