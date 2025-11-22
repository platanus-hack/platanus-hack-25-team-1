# BlindPower - Guía Docker

## Requisitos Previos

- Docker instalado ([Descargar Docker Desktop](https://www.docker.com/products/docker-desktop))
- Docker Compose instalado (viene con Docker Desktop)

## Estructura de Archivos Docker

```
blindpower/
├── docker-compose.yml          # Orquestación de servicios
├── .dockerignore              # Archivos a excluir
├── backend/
│   ├── Dockerfile             # Imagen del backend
│   └── .dockerignore
└── frontend/
    ├── Dockerfile             # Imagen del frontend
    ├── nginx.conf             # Configuración nginx
    └── .dockerignore
```

## Cómo Levantar el Proyecto

### Opción 1: Levantar todo con un comando (Recomendado)

```bash
# Desde la raíz del proyecto
docker-compose up
```

**Con rebuild** (si cambiaste dependencias):
```bash
docker-compose up --build
```

**En modo detached** (segundo plano):
```bash
docker-compose up -d
```

### Opción 2: Comandos paso a paso

```bash
# 1. Construir las imágenes
docker-compose build

# 2. Levantar los contenedores
docker-compose up

# 3. Ver logs
docker-compose logs -f

# 4. Ver logs de un servicio específico
docker-compose logs -f backend
docker-compose logs -f frontend
```

## Acceso a la Aplicación

Una vez levantados los contenedores:

- **Frontend**: http://localhost:8080
- **Backend API**: http://localhost:8000
- **Health Check**: http://localhost:8000/health
- **API Docs**: http://localhost:8000/docs

## Comandos Útiles

### Ver estado de contenedores
```bash
docker-compose ps
```

### Detener los servicios
```bash
docker-compose down
```

### Detener y eliminar volúmenes
```bash
docker-compose down -v
```

### Reiniciar un servicio específico
```bash
docker-compose restart backend
docker-compose restart frontend
```

### Ver logs en tiempo real
```bash
docker-compose logs -f
```

### Ejecutar comandos dentro del contenedor
```bash
# Backend
docker-compose exec backend bash
docker-compose exec backend python -c "import torch; print(torch.__version__)"

# Frontend
docker-compose exec frontend sh
```

### Reconstruir un servicio específico
```bash
docker-compose build backend
docker-compose build frontend
```

## Desarrollo

### Hot Reload

El `docker-compose.yml` está configurado con volúmenes para desarrollo:

- **Backend**: Los cambios en `./backend` se reflejan automáticamente
- **Frontend**: Necesitas reconstruir la imagen para ver cambios

Para desarrollo activo del frontend:
```bash
# Opción 1: Reconstruir y reiniciar
docker-compose up -d --build frontend

# Opción 2: Usar servidor local sin Docker
cd frontend
python -m http.server 8080
```

### Variables de Entorno

Puedes crear un archivo `.env` en la raíz:

```env
# Backend
CORS_ORIGINS=*
BACKEND_PORT=8000

# Frontend
FRONTEND_PORT=8080
```

Y modificar `docker-compose.yml` para usar:
```yaml
env_file:
  - .env
```

## Troubleshooting

### Puerto ya en uso
```bash
# Verificar qué está usando el puerto
lsof -i :8000
lsof -i :8080

# Cambiar puerto en docker-compose.yml
ports:
  - "8001:8000"  # Puerto host:puerto contenedor
```

### Problemas con dependencias de Python
```bash
# Reconstruir sin caché
docker-compose build --no-cache backend
```

### Ver logs de error
```bash
docker-compose logs backend | grep -i error
docker-compose logs frontend | grep -i error
```

### Liberar espacio en Docker
```bash
# Limpiar contenedores detenidos
docker container prune

# Limpiar imágenes sin usar
docker image prune

# Limpiar todo (¡cuidado!)
docker system prune -a
```

### Modelo YOLOv8 no encontrado
El modelo `yolov8n.pt` debe estar en `/backend/`. Si no está:

```bash
# Opción 1: Descargarlo localmente primero
cd backend
pip install ultralytics
python -c "from ultralytics import YOLO; YOLO('yolov8n.pt')"

# Opción 2: El backend lo descarga automáticamente al iniciar
```

## Producción

Para deploy en producción:

### 1. Crear archivo `.env.production`
```env
CORS_ORIGINS=https://tudominio.com
```

### 2. Modificar docker-compose para producción
```bash
# Usar archivo específico
docker-compose -f docker-compose.prod.yml up -d
```

### 3. Configurar reverse proxy (Nginx/Caddy)
```nginx
server {
    listen 80;
    server_name tudominio.com;

    location / {
        proxy_pass http://localhost:8080;
    }

    location /api/ {
        proxy_pass http://localhost:8000/;
    }
}
```

### 4. Habilitar HTTPS
```bash
# Con Certbot
certbot --nginx -d tudominio.com
```

## Recursos

- **Tamaño de imágenes**:
  - Backend: ~2-3 GB (PyTorch + OpenCV)
  - Frontend: ~50 MB (nginx:alpine)

- **Memoria recomendada**: Mínimo 4 GB RAM

- **CPU**: YOLOv8 nano funciona en CPU, pero GPU es recomendable para producción

## Arquitectura Docker

```
┌─────────────────────────────────────────┐
│         Docker Host (Tu Mac)            │
│                                         │
│  ┌────────────────────────────────┐    │
│  │   blindpower-network           │    │
│  │                                │    │
│  │  ┌──────────────────────────┐  │    │
│  │  │  Frontend Container      │  │    │
│  │  │  - nginx:alpine          │  │    │
│  │  │  - Port: 8080 → 80       │  │    │
│  │  └──────────────────────────┘  │    │
│  │             ↓ HTTP             │    │
│  │  ┌──────────────────────────┐  │    │
│  │  │  Backend Container       │  │    │
│  │  │  - Python 3.11           │  │    │
│  │  │  - FastAPI + YOLOv8      │  │    │
│  │  │  - Port: 8000 → 8000     │  │    │
│  │  └──────────────────────────┘  │    │
│  └────────────────────────────────┘    │
└─────────────────────────────────────────┘
```

## Resumen de Comandos Rápidos

```bash
# Iniciar todo
docker-compose up -d

# Ver logs
docker-compose logs -f

# Detener todo
docker-compose down

# Reiniciar
docker-compose restart

# Rebuild completo
docker-compose up -d --build

# Estado
docker-compose ps
```