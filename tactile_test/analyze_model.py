"""
Script para analizar el modelo best.pt y ver qué clases puede detectar
"""

from ultralytics import YOLO
import os

MODEL_PATH = "best.pt"

print("=" * 70)
print("ANÁLISIS DEL MODELO YOLO-seg")
print("=" * 70)

# 1. Verificar que el modelo existe
if not os.path.exists(MODEL_PATH):
    print(f"❌ Error: No se encontró {MODEL_PATH}")
    exit(1)

# 2. Cargar modelo
print(f"\n1️⃣ Cargando modelo: {MODEL_PATH}")
model = YOLO(MODEL_PATH)
print("✅ Modelo cargado")

# 3. Obtener información del modelo
print(f"\n2️⃣ Información del modelo:")
print(f"   - Tipo: {type(model.model).__name__}")
print(f"   - Device: {model.device}")

# 4. Obtener nombres de clases
print(f"\n3️⃣ Clases que puede detectar el modelo:")

# Intentar obtener nombres de clases de diferentes formas
try:
    # Método 1: model.names
    if hasattr(model, 'names') and model.names:
        names = model.names
        print(f"   ✅ Se encontraron {len(names)} clases:")
        for class_id, class_name in names.items():
            print(f"      - Clase {class_id}: '{class_name}'")
    else:
        print("   ⚠️ No se encontraron nombres de clases en model.names")
except Exception as e:
    print(f"   ⚠️ Error al obtener nombres: {e}")

# Intentar obtener de model.model.names
try:
    if hasattr(model.model, 'names') and model.model.names:
        names = model.model.names
        if names:
            print(f"\n   ✅ Nombres desde model.model.names ({len(names)} clases):")
            for class_id, class_name in names.items():
                print(f"      - Clase {class_id}: '{class_name}'")
except Exception as e:
    print(f"   ⚠️ Error al obtener desde model.model.names: {e}")

# Intentar obtener desde el yaml si existe
try:
    if hasattr(model, 'yaml') and model.yaml:
        yaml_data = model.yaml
        if 'names' in yaml_data:
            names = yaml_data['names']
            print(f"\n   ✅ Nombres desde YAML ({len(names)} clases):")
            if isinstance(names, dict):
                for class_id, class_name in names.items():
                    print(f"      - Clase {class_id}: '{class_name}'")
            elif isinstance(names, list):
                for i, class_name in enumerate(names):
                    print(f"      - Clase {i}: '{class_name}'")
except Exception as e:
    print(f"   ⚠️ Error al obtener desde YAML: {e}")

# 5. Información adicional del modelo
print(f"\n4️⃣ Información adicional:")

# Número de clases
try:
    if hasattr(model.model, 'nc'):
        num_classes = model.model.nc
        print(f"   - Número de clases: {num_classes}")
except:
    pass

# Parámetros del modelo
try:
    if hasattr(model.model, 'parameters'):
        total_params = sum(p.numel() for p in model.model.parameters())
        print(f"   - Parámetros totales: {total_params:,}")
except:
    pass

# 6. Probar con una imagen si existe
print(f"\n5️⃣ Prueba rápida de detección:")

test_images = ["test2.png", "../test2.png", "test.jpg", "../test.jpg"]
test_image = None

for img_path in test_images:
    if os.path.exists(img_path):
        test_image = img_path
        break

if test_image:
    print(f"   Usando imagen de prueba: {test_image}")
    try:
        import cv2
        import numpy as np
        
        img = cv2.imread(test_image)
        if img is not None:
            img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
            results = model(img_rgb, conf=0.25, verbose=False)
            result = results[0]
            
            if result.boxes is not None and len(result.boxes) > 0:
                print(f"   ✅ Se detectaron {len(result.boxes)} objetos:")
                classes_detected = {}
                for box in result.boxes:
                    cls = int(box.cls[0])
                    conf = float(box.conf[0])
                    if cls not in classes_detected:
                        classes_detected[cls] = []
                    classes_detected[cls].append(conf)
                
                for cls, confs in classes_detected.items():
                    class_name = model.names.get(cls, f"Clase {cls}") if hasattr(model, 'names') else f"Clase {cls}"
                    avg_conf = sum(confs) / len(confs)
                    print(f"      - {class_name} (clase {cls}): {len(confs)} detecciones, confianza promedio: {avg_conf:.2f}")
            else:
                print("   ⚠️ No se detectaron objetos en la imagen de prueba")
    except Exception as e:
        print(f"   ⚠️ Error en prueba: {e}")
else:
    print("   ℹ️ No se encontró imagen de prueba para hacer test rápido")

# 7. Resumen y recomendaciones
print(f"\n6️⃣ Resumen:")
print(f"   El modelo está diseñado para detectar huellas podotáctiles.")
print(f"   Debería detectar:")
print(f"      - Losas podotáctiles (rectángulos con textura)")
print(f"      - Círculos de intersección (en vértices)")
print(f"      - Líneas de vías podotáctiles (Nx1)")
print(f"      - Cualquier patrón característico de huellas podotáctiles")

print(f"\n" + "=" * 70)
print("✅ ANÁLISIS COMPLETADO")
print("=" * 70)

