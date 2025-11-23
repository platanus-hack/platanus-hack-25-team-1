"""
feedback.py - Módulo opcional de feedback de audio en el backend
Usa pyttsx3 para síntesis de voz (opcional, ya que el frontend usa Web Speech API)
"""

try:
    import pyttsx3
    TTS_AVAILABLE = True
except ImportError:
    TTS_AVAILABLE = False

import logging

logger = logging.getLogger(__name__)

class FeedbackManager:
    """
    Gestor de feedback de audio usando pyttsx3
    Nota: En el MVP, el frontend usa Web Speech API, pero esto puede ser útil
    para testing o como fallback
    """
    
    def __init__(self):
        self.engine = None
        self.is_initialized = False
        
        if TTS_AVAILABLE:
            try:
                self.engine = pyttsx3.init()
                self.is_initialized = True
                
                # Configurar propiedades de voz
                voices = self.engine.getProperty('voices')
                
                # Buscar voz en español si está disponible
                for voice in voices:
                    if 'spanish' in voice.name.lower() or 'es' in voice.id.lower():
                        self.engine.setProperty('voice', voice.id)
                        logger.info(f"Voz en español seleccionada: {voice.name}")
                        break
                
                # Configurar velocidad y volumen
                self.engine.setProperty('rate', 150)  # Velocidad de habla
                self.engine.setProperty('volume', 1.0)  # Volumen (0.0 a 1.0)
                
                logger.info("✅ FeedbackManager inicializado")
            except Exception as e:
                logger.warning(f"No se pudo inicializar pyttsx3: {str(e)}")
                self.is_initialized = False
        else:
            logger.info("pyttsx3 no disponible. El feedback de audio se manejará en el frontend.")
    
    def say(self, text: str):
        """
        Reproduce texto como audio
        
        Args:
            text: Texto a pronunciar
        """
        if not self.is_initialized or not self.engine:
            logger.debug(f"Feedback de audio no disponible. Texto: {text}")
            return
        
        try:
            self.engine.say(text)
            self.engine.runAndWait()
        except Exception as e:
            logger.error(f"Error al reproducir audio: {str(e)}")
    
    def stop(self):
        """Detiene cualquier audio en reproducción"""
        if self.engine:
            try:
                self.engine.stop()
            except:
                pass

# Instancia global (opcional, para uso en backend si se necesita)
feedback_manager = FeedbackManager()

