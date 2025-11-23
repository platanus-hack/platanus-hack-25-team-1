# Objetos que debería detectar el modelo de huellas podotáctiles

## 📋 Resumen

El modelo `best.pt` está entrenado para detectar **huellas podotáctiles** (vías podotáctiles) en el suelo. Estas son guías táctiles para personas con discapacidad visual.

## 🎯 Objetos principales a detectar

### 1. **Losas Podotáctiles (Baldosas con textura)**
- **Descripción**: Baldosas rectangulares con textura diferente a las baldosas normales
- **Características**:
  - Forma rectangular o cuadrada
  - Textura rugosa o con patrones (líneas, puntos, círculos)
  - Color generalmente amarillo/beige, pero puede variar con el tiempo y suciedad
  - Diferente textura visual comparada con baldosas circundantes

### 2. **Círculos de Intersección**
- **Descripción**: Círculos en los vértices de las losas que indican intersecciones
- **Características**:
  - Forma circular
  - Generalmente en el centro o vértices de losas
  - Indican cambios de dirección o intersecciones
  - Textura diferente al resto de la losa

### 3. **Líneas de Vías Podotáctiles (Nx1)**
- **Descripción**: Líneas rectas formadas por múltiples losas alineadas
- **Características**:
  - Forma alargada (mucho más larga que ancha)
  - Orientación vertical o diagonal (NO horizontal)
  - Múltiples losas conectadas formando una línea
  - Ancho constante a lo largo de la línea

### 4. **Patrones Característicos**
- **Líneas paralelas**: Patrones de líneas en la superficie
- **Puntos elevados**: Textura con puntos/bumps
- **Diferencias de textura**: Áreas con textura significativamente diferente a las baldosas normales

## 🚫 Objetos que NO debería detectar

- Baldosas normales del suelo (sin textura podotáctica)
- Líneas horizontales (crosswalks, no son vías podotáctiles)
- Bordes de aceras o caminos
- Áreas grandes sin patrón específico
- Objetos que no sean parte del suelo

## 📊 Información que el modelo proporciona

Cuando detecta un objeto, el modelo YOLO-seg proporciona:

1. **Máscara de segmentación**: Área exacta del objeto detectado (píxel por píxel)
2. **Bounding box**: Rectángulo que encierra el objeto
3. **Confianza**: Probabilidad de que la detección sea correcta (0.0 a 1.0)
4. **Clase**: Tipo de objeto detectado (si el modelo tiene múltiples clases)

## 🔍 Cómo verificar qué detecta el modelo

Ejecuta el script de análisis:

```bash
cd tactile_test
python analyze_model.py
```

Esto mostrará:
- Nombres de las clases que puede detectar
- Número de clases
- Información del modelo
- Prueba rápida con una imagen

## 💡 Notas importantes

1. **Baldosas sucias**: Con el tiempo, las baldosas podotáctiles se ensucian y pueden confundirse con baldosas normales. El modelo debería ser robusto a esto.

2. **Variaciones de color**: El color puede variar (amarillo, beige, gris sucio), pero la textura es lo más importante.

3. **Orientación**: Las vías podotáctiles son generalmente verticales o diagonales, NO horizontales.

4. **Forma Nx1**: Las vías son líneas (mucho más largas que anchas), formadas por múltiples losas.

## 🎨 Visualización

En los scripts de prueba, las detecciones se muestran en **VERDE**:
- Overlay verde semi-transparente: Área segmentada (máscara)
- Rectángulos verdes: Bounding boxes alrededor de las detecciones
- Números verdes: Confianza de la detección

