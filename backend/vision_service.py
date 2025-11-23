"""
vision_service.py - Servicio de análisis de imágenes con Claude y síntesis de voz con ElevenLabs
"""

import cv2
import base64
import os
import logging
from typing import Optional
from dotenv import load_dotenv

# Cargar variables de entorno
load_dotenv()

try:
    from anthropic import Anthropic
    ANTHROPIC_AVAILABLE = True
except ImportError:
    ANTHROPIC_AVAILABLE = False
    logging.warning("anthropic no disponible. Instala con: pip install anthropic")

try:
    from elevenlabs import ElevenLabs
    ELEVENLABS_AVAILABLE = True
except ImportError:
    ELEVENLABS_AVAILABLE = False
    logging.warning("elevenlabs no disponible. Instala con: pip install elevenlabs")

logger = logging.getLogger(__name__)

ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY")
ELEVENLABS_VOICE_ID = os.getenv("ELEVENLABS_VOICE_ID")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")

# Inicializar clientes
claude_client = None
tts_client = None

def initialize_clients():
    """Inicializa los clientes de Claude y ElevenLabs"""
    global claude_client, tts_client
    
    if ANTHROPIC_AVAILABLE and ANTHROPIC_API_KEY:
        try:
            claude_client = Anthropic(api_key=ANTHROPIC_API_KEY)
            logger.info("✅ Cliente Claude inicializado")
        except Exception as e:
            logger.error(f"❌ Error al inicializar Claude: {str(e)}")
    
    if ELEVENLABS_AVAILABLE and ELEVENLABS_API_KEY:
        try:
            tts_client = ElevenLabs(api_key=ELEVENLABS_API_KEY)
            logger.info("✅ Cliente ElevenLabs inicializado")
        except Exception as e:
            logger.error(f"❌ Error al inicializar ElevenLabs: {str(e)}")

def analyze_image_with_claude(frame: cv2.Mat, question: str = "¿qué es esto?") -> Optional[str]:
    """
    Analiza una imagen usando Claude Vision API
    
    Args:
        frame: Frame de OpenCV (BGR)
        question: Pregunta del usuario sobre la imagen
    
    Returns:
        Respuesta de Claude en texto, o None si hay error
    """
    if not ANTHROPIC_AVAILABLE or not claude_client:
        logger.error("Claude no está disponible. Verifica ANTHROPIC_API_KEY")
        return None
    
    try:
        # Convertir frame a base64
        _, buffer = cv2.imencode(".jpg", frame)
        imagen_base64 = base64.b64encode(buffer).decode("utf-8")
        
        # Crear prompt
        prompt = f"""
Eres un asistente visual para personas con discapacidad visual. 
Responde en máximo 15 palabras y en español, de forma clara y concisa.
Pregunta del usuario: {question}
"""
        
        # Llamar a Claude
        respuesta = claude_client.messages.create(
            model="claude-sonnet-4-5-20250929",
            max_tokens=80,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": "image/jpeg",
                                "data": imagen_base64,
                            },
                        },
                        {"type": "text", "text": prompt},
                    ],
                }
            ],
        )
        
        text_response = respuesta.content[0].text
        logger.info(f"✅ Claude respondió: {text_response}")
        return text_response
        
    except Exception as e:
        logger.error(f"❌ Error al analizar imagen con Claude: {str(e)}")
        return None

def generate_audio_with_elevenlabs(text: str, voice_id: Optional[str] = None) -> Optional[bytes]:
    """
    Genera audio usando ElevenLabs TTS
    
    Args:
        text: Texto a convertir a voz
        voice_id: ID de voz (opcional, usa el de .env por defecto)
    
    Returns:
        Bytes del audio MP3, o None si hay error
    """
    if not ELEVENLABS_AVAILABLE or not tts_client:
        logger.error("ElevenLabs no está disponible. Verifica ELEVENLABS_API_KEY")
        return None
    
    try:
        voice = voice_id or ELEVENLABS_VOICE_ID
        
        # Generar audio
        audio_stream = tts_client.text_to_speech.convert(
            voice_id=voice,
            text=text,
            model_id="eleven_multilingual_v2",
            output_format="mp3_44100_128",
        )
        
        # Combinar chunks en bytes
        audio_bytes = b"".join(audio_stream)
        logger.info(f"✅ Audio generado: {len(audio_bytes)} bytes")
        return audio_bytes
        
    except Exception as e:
        logger.error(f"❌ Error al generar audio con ElevenLabs: {str(e)}")
        return None

def analyze_and_speak(frame: cv2.Mat, question: str = "¿qué es esto?") -> dict:
    """
    Analiza imagen y genera audio completo
    
    Args:
        frame: Frame de OpenCV (BGR)
        question: Pregunta del usuario
    
    Returns:
        Dict con:
            - success: bool
            - text: str (respuesta de Claude)
            - audio_base64: str (audio en base64)
            - error: str (si hay error)
    """
    # Analizar imagen
    text_response = analyze_image_with_claude(frame, question)
    
    if not text_response:
        return {
            "success": False,
            "error": "No se pudo analizar la imagen con Claude"
        }
    
    # Generar audio
    audio_bytes = generate_audio_with_elevenlabs(text_response)
    
    if not audio_bytes:
        return {
            "success": False,
            "text": text_response,
            "error": "No se pudo generar el audio con ElevenLabs"
        }
    
    # Convertir audio a base64
    audio_base64 = base64.b64encode(audio_bytes).decode("utf-8")
    
    return {
        "success": True,
        "text": text_response,
        "audio_base64": audio_base64,
        "audio_format": "mp3"
    }