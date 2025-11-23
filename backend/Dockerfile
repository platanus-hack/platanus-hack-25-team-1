# Dockerfile - Backend BlindPower

FROM python:3.11-slim

# Set working directory
WORKDIR /app

# System deps para OpenCV, etc.
RUN apt-get update && apt-get install -y \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgomp1 \
    libgl1 \
    libglvnd0 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copiar requirements primero (para cache)
COPY requirements.txt .

# Instalar dependencias Python (ya con torch CPU-only)
RUN pip install --no-cache-dir -r requirements.txt

# Copiar código de la app
COPY . .

# Exponer puerto
EXPOSE 8000

# Health check (usa requests, que ahora está en requirements)
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD python -c "import requests; requests.get('http://localhost:8000/health')" || exit 1

# Comando para levantar FastAPI
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
