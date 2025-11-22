#!/bin/bash

# Script para deployar el backend de BlindPower a AWS ECR (Elastic Container Registry)
# Uso: ./deploy-backend-ecr.sh [AWS_REGION] [AWS_ACCOUNT_ID]

set -e  # Exit on error

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Variables
AWS_REGION="${1:-us-east-1}"
AWS_ACCOUNT_ID="${2}"
REPOSITORY_NAME="blindpower-backend"
IMAGE_TAG="${3:-latest}"

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  BlindPower - Deploy Backend a ECR${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# Validar que se proporcionó el Account ID
if [ -z "$AWS_ACCOUNT_ID" ]; then
    echo -e "${RED}Error: Debes proporcionar tu AWS Account ID${NC}"
    echo ""
    echo "Uso: ./deploy-backend-ecr.sh [REGION] [ACCOUNT_ID] [TAG]"
    echo ""
    echo "Ejemplo:"
    echo "  ./deploy-backend-ecr.sh us-east-1 123456789012 latest"
    echo ""
    echo -e "${YELLOW}Para obtener tu Account ID:${NC}"
    echo "  aws sts get-caller-identity --query Account --output text"
    exit 1
fi

# Verificar que AWS CLI está instalado
if ! command -v aws &> /dev/null; then
    echo -e "${RED}Error: AWS CLI no está instalado${NC}"
    echo "Instala con: brew install awscli (Mac) o pip install awscli"
    exit 1
fi

# Verificar que Docker está corriendo
if ! docker info &> /dev/null; then
    echo -e "${RED}Error: Docker no está corriendo${NC}"
    echo "Inicia Docker Desktop y vuelve a intentar"
    exit 1
fi

echo -e "${YELLOW}Configuración:${NC}"
echo "  Región: $AWS_REGION"
echo "  Account ID: $AWS_ACCOUNT_ID"
echo "  Repositorio: $REPOSITORY_NAME"
echo "  Tag: $IMAGE_TAG"
echo ""

# ECR URI
ECR_URI="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
FULL_IMAGE_NAME="${ECR_URI}/${REPOSITORY_NAME}:${IMAGE_TAG}"

echo -e "${YELLOW}Paso 1: Crear repositorio ECR (si no existe)${NC}"
aws ecr describe-repositories --repository-names $REPOSITORY_NAME --region $AWS_REGION 2>/dev/null || \
aws ecr create-repository \
    --repository-name $REPOSITORY_NAME \
    --region $AWS_REGION \
    --image-scanning-configuration scanOnPush=true \
    --encryption-configuration encryptionType=AES256

echo -e "${GREEN}✓ Repositorio ECR listo${NC}"
echo ""

echo -e "${YELLOW}Paso 2: Autenticar Docker con ECR${NC}"
aws ecr get-login-password --region $AWS_REGION | \
    docker login --username AWS --password-stdin $ECR_URI

echo -e "${GREEN}✓ Autenticación exitosa${NC}"
echo ""

echo -e "${YELLOW}Paso 3: Construir imagen Docker${NC}"
cd backend
docker build -t $REPOSITORY_NAME:$IMAGE_TAG .
cd ..

echo -e "${GREEN}✓ Imagen construida${NC}"
echo ""

echo -e "${YELLOW}Paso 4: Etiquetar imagen para ECR${NC}"
docker tag $REPOSITORY_NAME:$IMAGE_TAG $FULL_IMAGE_NAME

echo -e "${GREEN}✓ Imagen etiquetada${NC}"
echo ""

echo -e "${YELLOW}Paso 5: Push a ECR${NC}"
docker push $FULL_IMAGE_NAME

echo -e "${GREEN}✓ Imagen subida a ECR${NC}"
echo ""

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  ¡Deployment exitoso!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "${YELLOW}URI de la imagen:${NC}"
echo "  $FULL_IMAGE_NAME"
echo ""
echo -e "${YELLOW}Siguientes pasos:${NC}"
echo "  1. Ve a la consola de AWS App Runner"
echo "  2. Crea un nuevo servicio"
echo "  3. Selecciona 'Container registry' como fuente"
echo "  4. Usa esta URI: $FULL_IMAGE_NAME"
echo "  5. Configura: 2 vCPU, 4 GB RAM, puerto 8000"
echo ""
echo -e "${YELLOW}O usa el siguiente comando para crear el servicio:${NC}"
echo "  aws apprunner create-service --cli-input-json file://apprunner-config.json"
echo ""
