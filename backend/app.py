"""
app.py - Servidor FastAPI para el asistente de navegación
Recibe frames del frontend, procesa con YOLO y devuelve predicciones + instrucciones
"""

from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from vision_service import analyze_and_speak, initialize_clients as init_vision_clients
import cv2
import numpy as np
import base64
import io
import os
import logging
from datetime import datetime
from typing import Dict, List, Optional
from object_detector import ObjectDetector
from navigation_logic import NavigationLogic

# Configurar logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Inicializar FastAPI
app = FastAPI(title="BlindPower API", version="1.0.0")

# Configurar CORS - en producción, especificar dominios específicos
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "*").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

# Modelos Pydantic para validación
class Base64ImageRequest(BaseModel):
    image: str = Field(..., description="Imagen en formato base64")

# Inicializar módulos globales
object_detector = None
navigation_logic = None

@app.on_event("startup")
async def startup_event():
    """Inicializa el detector de objetos al arrancar el servidor"""
    global object_detector, navigation_logic
    
    logger.info("🚀 Iniciando BlindPower API...")
    
    try:
        # Inicializar detector de objetos
        logger.info("📦 Cargando modelo YOLO...")
        object_detector = ObjectDetector()
        await object_detector.load_model()
        
        # Inicializar lógica de navegación
        navigation_logic = NavigationLogic()
        try:
            init_vision_clients()
            logger.info("✅ Servicios de visión inicializados")
        except Exception as e:
            logger.warning(f"⚠️ Servicios de visión no disponibles: {str(e)}")
        
        logger.info("✅ Servidor listo para recibir requests")
    except Exception as e:
        logger.error(f"❌ Error al inicializar: {str(e)}", exc_info=True)
        raise

@app.post("/analyze_image")
async def analyze_image(
    file: UploadFile = File(...),
    question: Optional[str] = None
):
    """
    Endpoint para analizar imagen con Claude y generar audio con ElevenLabs
    
    Args:
        file: Imagen en formato JPEG/PNG (multipart/form-data)
        question: Pregunta opcional sobre la imagen (query parameter)
    
    Returns:
        JSON con:
            - success: bool
            - text: str (respuesta de Claude)
            - audio_base64: str (audio MP3 en base64)
            - audio_format: str ("mp3")
            - error: str (si hay error)
    """
    try:
        # Validar tipo de contenido
        if file.content_type and file.content_type not in ["image/jpeg", "image/jpg", "image/png", "image/webp"]:
            raise HTTPException(
                status_code=400, 
                detail="Tipo de archivo no soportado. Use JPEG, PNG o WebP."
            )
        
        # Leer imagen
        logger.info(f"📥 Analizando imagen: {file.filename}")
        contents = await file.read()
        
        # Decodificar imagen
        frame = _decode_image_from_bytes(contents)
        height, width = frame.shape[:2]
        logger.info(f"✅ Imagen decodificada: {width}x{height} píxeles")
        
        # Pregunta por defecto
        pregunta = question or "¿qué es esto?"
        logger.info(f"❓ Pregunta: {pregunta}")
        
        # Analizar y generar audio
        result = analyze_and_speak(frame, pregunta)
        
        if not result.get("success"):
            raise HTTPException(
                status_code=500,
                detail=result.get("error", "Error al procesar imagen")
            )
        
        logger.info(f"✅ Análisis completado: {result['text']}")
        
        return JSONResponse(content=result)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Error en análisis de imagen: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error al procesar imagen: {str(e)}")

@app.get("/")
async def root():
    """Endpoint de salud"""
    return {
        "status": "ok",
        "message": "BlindPower API está funcionando",
        "endpoints": {
            "/predict": "POST - Envía un frame para detección",
            "/health": "GET - Estado del servidor"
        }
    }

@app.get("/health")
async def health():
    """Endpoint de salud detallado"""
    model_loaded = (
        object_detector is not None 
        and hasattr(object_detector, 'is_model_loaded') 
        and object_detector.is_model_loaded
    )
    return {
        "status": "healthy" if model_loaded else "degraded",
        "model_loaded": model_loaded,
        "navigation_logic_ready": navigation_logic is not None
    }

@app.post("/test")
async def test_endpoint():
    """Endpoint de prueba simple"""
    return {
        "message": "Endpoint funcionando correctamente",
        "timestamp": str(datetime.now())
    }

def _decode_image_from_bytes(contents: bytes) -> np.ndarray:
    """
    Decodifica una imagen desde bytes a un array de numpy para OpenCV
    
    Args:
        contents: Bytes de la imagen
        
    Returns:
        Frame de OpenCV (BGR)
        
    Raises:
        HTTPException: Si no se puede decodificar la imagen
    """
    if not contents or len(contents) == 0:
        raise HTTPException(status_code=400, detail="Archivo vacío")
    
    # Validar tamaño máximo (10MB)
    MAX_FILE_SIZE = 10 * 1024 * 1024
    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=400, 
            detail=f"Archivo demasiado grande. Máximo permitido: {MAX_FILE_SIZE / 1024 / 1024}MB"
        )
    
    # Convertir a numpy array (OpenCV)
    nparr = np.frombuffer(contents, np.uint8)
    frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    
    if frame is None:
        raise HTTPException(
            status_code=400, 
            detail="No se pudo decodificar la imagen. Verifica que sea JPEG o PNG válido."
        )
    
    return frame

def _process_predictions(frame: np.ndarray) -> Dict:
    """
    Procesa un frame y genera la respuesta completa con detecciones e instrucciones
    
    Args:
        frame: Frame de OpenCV (BGR)
        
    Returns:
        Dict con la respuesta completa
    """
    if not object_detector or not object_detector.is_model_loaded:
        raise HTTPException(status_code=503, detail="Modelo no cargado aún")
    
    if navigation_logic is None:
        raise HTTPException(status_code=503, detail="Lógica de navegación no inicializada")
    
    # Obtener dimensiones del frame
    height, width = frame.shape[:2]
    logger.debug(f"Procesando frame: {width}x{height} píxeles")
    
    # Realizar detección
    predictions = object_detector.predict(frame)
    logger.debug(f"Detecciones encontradas: {len(predictions)}")
    
    # FILTRAR: Solo incluir objetos dentro de zona segura (excepto autos y semáforos)
    # Obtener zona segura primero (fija)
    safe_zone = navigation_logic.get_safe_zone_coordinates()
    
    # Filtrar detecciones: solo objetos en zona segura, excepto autos y semáforos
    filtered_predictions = []
    for pred in predictions:
        pred_type = pred.get('type', 'other')
        class_name = pred.get('class', '').lower()
        class_es = pred.get('class_es', '').lower()
        
        # Semáforos siempre se incluyen
        if pred_type == 'traffic_light':
            filtered_predictions.append(pred)
        # Autos siempre se incluyen
        elif class_name == 'car' or class_es == 'auto':
            filtered_predictions.append(pred)
        # Pasos de peatones siempre se incluyen (DESACTIVADO temporalmente)
        # elif pred_type == 'crosswalk':
        #     filtered_predictions.append(pred)
        # Otros objetos solo si están en zona segura
        elif navigation_logic._is_object_in_safe_zone(pred["bbox"]):
            filtered_predictions.append(pred)
    
    # Generar instrucciones de navegación con detecciones filtradas
    instruction = navigation_logic.process_detections(filtered_predictions, width, height)
    
    # Obtener obstáculos en zona segura
    obstacles_in_safe_zone = navigation_logic._get_obstacles_in_safe_zone(
        [p for p in filtered_predictions if p.get('type') == 'obstacle']
    )
    
    # Calcular distancias para todas las detecciones filtradas
    # EXCEPCIÓN: Semáforos siempre se muestran, sin importar la distancia
    for pred in filtered_predictions:
        if 'distance_meters' not in pred:
            object_type = pred.get('class', 'unknown')
            pred_type = pred.get('type', 'other')
            
            # Semáforos: no calcular distancia o usar distancia fija grande (siempre visibles)
            if pred_type == 'traffic_light':
                pred['distance_meters'] = 5.0  # Distancia fija para semáforos (siempre visibles)
                pred['is_close'] = True  # Siempre se muestran
            else:
                distance_meters = navigation_logic._calculate_distance(pred["bbox"], object_type)
                pred['distance_meters'] = distance_meters
                pred['is_close'] = distance_meters < 2.0  # Menos de 2 metros = cercano
    
    # Preparar respuesta (usar predicciones filtradas)
    response = {
        "success": True,
        "detections": [
            {
                "bbox": pred["bbox"],
                "class": pred["class"],
                "class_es": pred.get("class_es", pred["class"]),
                "confidence": float(pred["confidence"]),
                "type": pred["type"],
                "distance_meters": float(pred.get("distance_meters", 10.0)),
                "is_close": bool(pred.get("is_close", False)),  # True si < 2m
                "in_safe_zone": navigation_logic._is_object_in_safe_zone(pred["bbox"]),
                "direction": navigation_logic._get_direction_for_object_in_safe_zone(pred["bbox"]) if navigation_logic._is_object_in_safe_zone(pred["bbox"]) else None
            }
            for pred in filtered_predictions
        ],
        "instruction": {
            "text": instruction["text"] if instruction else "Continúa con precaución",
            "priority": instruction["priority"] if instruction else 0,
            "type": instruction["type"] if instruction else "none",
            "action": instruction.get("action", "none"),
            "direction": instruction.get("direction", "none")
        } if instruction else None,
        "safe_zone": {
            "bottom_left": safe_zone["bottom_left"],
            "bottom_right": safe_zone["bottom_right"],
            "top_left": safe_zone["top_left"],
            "top_right": safe_zone["top_right"],
            "center_x": safe_zone["center_x"],
            "top_y": safe_zone["top_y"],
            "bottom_y": safe_zone["bottom_y"],
            "top_width": safe_zone["top_width"],
            "bottom_width": safe_zone["bottom_width"],
            "is_clear": len(obstacles_in_safe_zone) == 0,
            "obstacle_count": len(obstacles_in_safe_zone)
        },
        "frame_info": {
            "width": width,
            "height": height
        }
    }
    
    return response

@app.post("/predict")
async def predict(file: UploadFile = File(...)):
    """
    Endpoint principal: recibe un frame y devuelve predicciones + instrucciones
    
    Args:
        file: Imagen en formato JPEG/PNG (multipart/form-data)
    
    Returns:
        JSON con detecciones, instrucciones y metadata
    """
    try:
        # Validar tipo de contenido
        if file.content_type and file.content_type not in ["image/jpeg", "image/jpg", "image/png", "image/webp"]:
            logger.warning(f"Tipo de archivo no soportado: {file.content_type}")
            raise HTTPException(
                status_code=400, 
                detail="Tipo de archivo no soportado. Use JPEG, PNG o WebP."
            )
        
        # Leer imagen del request
        logger.info(f"📥 Recibiendo archivo: {file.filename}, tipo: {file.content_type}")
        contents = await file.read()
        logger.debug(f"📦 Tamaño del archivo: {len(contents)} bytes")
        
        # Decodificar imagen
        frame = _decode_image_from_bytes(contents)
        height, width = frame.shape[:2]
        logger.info(f"✅ Imagen decodificada: {width}x{height} píxeles")
        
        # Procesar predicciones
        response = _process_predictions(frame)
        
        logger.info(
            f"✅ Detecciones: {len(response['detections'])}, "
            f"Instrucción: {response['instruction']['text'] if response['instruction'] else 'Ninguna'}"
        )
        
        return JSONResponse(content=response)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Error en predicción: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error al procesar frame: {str(e)}")

@app.post("/predict_base64")
async def predict_base64(data: Base64ImageRequest):
    """
    Endpoint alternativo: recibe frame en base64 (útil para testing)
    
    Args:
        data: Base64ImageRequest con campo "image" conteniendo base64 string
    
    Returns:
        JSON con detecciones e instrucciones
    """
    try:
        image_data = data.image
        
        # Remover prefijo data:image si existe
        if "," in image_data:
            image_data = image_data.split(",")[1]
        
        # Validar que sea base64 válido
        try:
            img_bytes = base64.b64decode(image_data, validate=True)
        except Exception as e:
            raise HTTPException(
                status_code=400, 
                detail=f"Base64 inválido: {str(e)}"
            )
        
        # Decodificar imagen usando función compartida
        frame = _decode_image_from_bytes(img_bytes)
        height, width = frame.shape[:2]
        logger.info(f"✅ Imagen base64 decodificada: {width}x{height} píxeles")
        
        # Procesar predicciones (reutilizar lógica compartida)
        response = _process_predictions(frame)
        
        # Simplificar respuesta para base64 (sin safe_zone completo)
        simplified_response = {
            "success": response["success"],
            "detections": [
                {
                    "bbox": det["bbox"],
                    "class": det["class"],
                    "class_es": det["class_es"],
                    "confidence": det["confidence"],
                    "type": det["type"]
                }
                for det in response["detections"]
            ],
            "instruction": response["instruction"],
            "frame_info": response["frame_info"]
        }
        
        return JSONResponse(content=simplified_response)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Error en predicción base64: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")

