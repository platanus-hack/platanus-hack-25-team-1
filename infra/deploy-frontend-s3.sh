#!/bin/bash

# Script para deployar el frontend de BlindPower a S3 + CloudFront
# Uso: ./deploy-frontend-s3.sh [BACKEND_URL] [BUCKET_NAME]

set -e  # Exit on error

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Variables
BACKEND_URL="${1}"
BUCKET_NAME="${2:-blindpower-frontend-$(date +%s)}"
AWS_REGION="${3:-us-east-1}"

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  BlindPower - Deploy Frontend a S3${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# Validar que se proporcionó la URL del backend
if [ -z "$BACKEND_URL" ]; then
    echo -e "${RED}Error: Debes proporcionar la URL del backend${NC}"
    echo ""
    echo "Uso: ./deploy-frontend-s3.sh [BACKEND_URL] [BUCKET_NAME] [REGION]"
    echo ""
    echo "Ejemplo:"
    echo "  ./deploy-frontend-s3.sh https://abc123.us-east-1.awsapprunner.com blindpower-frontend us-east-1"
    echo ""
    echo -e "${YELLOW}La URL del backend la obtienes después de crear el servicio App Runner${NC}"
    exit 1
fi

# Verificar que AWS CLI está instalado
if ! command -v aws &> /dev/null; then
    echo -e "${RED}Error: AWS CLI no está instalado${NC}"
    echo "Instala con: brew install awscli (Mac) o pip install awscli"
    exit 1
fi

echo -e "${YELLOW}Configuración:${NC}"
echo "  Backend URL: $BACKEND_URL"
echo "  Bucket: $BUCKET_NAME"
echo "  Región: $AWS_REGION"
echo ""

# Crear directorio temporal para build
BUILD_DIR="frontend-build"
rm -rf $BUILD_DIR
mkdir -p $BUILD_DIR

echo -e "${YELLOW}Paso 1: Preparar archivos del frontend${NC}"
cp -r frontend/* $BUILD_DIR/

# Actualizar app.js con la URL del backend
echo -e "${YELLOW}Paso 2: Configurar URL del backend${NC}"
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    sed -i '' "s|http://localhost:8000|$BACKEND_URL|g" $BUILD_DIR/app.js
else
    # Linux
    sed -i "s|http://localhost:8000|$BACKEND_URL|g" $BUILD_DIR/app.js
fi

echo -e "${GREEN}✓ URL del backend actualizada${NC}"
echo ""

echo -e "${YELLOW}Paso 3: Crear bucket S3${NC}"
aws s3 mb s3://$BUCKET_NAME --region $AWS_REGION 2>/dev/null || echo "Bucket ya existe"

echo -e "${GREEN}✓ Bucket S3 listo${NC}"
echo ""

echo -e "${YELLOW}Paso 4: Deshabilitar Block Public Access${NC}"
aws s3api put-public-access-block \
    --bucket $BUCKET_NAME \
    --region $AWS_REGION \
    --public-access-block-configuration "BlockPublicAcls=false,IgnorePublicAcls=false,BlockPublicPolicy=false,RestrictPublicBuckets=false"

echo -e "${GREEN}✓ Block Public Access deshabilitado${NC}"
echo ""

echo -e "${YELLOW}Paso 5: Configurar bucket para hosting web${NC}"
aws s3 website s3://$BUCKET_NAME --index-document index.html --error-document index.html --region $AWS_REGION

echo -e "${GREEN}✓ Hosting web configurado${NC}"
echo ""

echo -e "${YELLOW}Paso 6: Configurar política pública del bucket${NC}"
cat > /tmp/bucket-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadGetObject",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::$BUCKET_NAME/*"
    }
  ]
}
EOF

aws s3api put-bucket-policy --bucket $BUCKET_NAME --policy file:///tmp/bucket-policy.json --region $AWS_REGION

echo -e "${GREEN}✓ Política pública configurada${NC}"
echo ""

echo -e "${YELLOW}Paso 7: Subir archivos a S3${NC}"
aws s3 sync $BUILD_DIR/ s3://$BUCKET_NAME/ \
    --region $AWS_REGION \
    --delete \
    --cache-control "public, max-age=3600" \
    --metadata-directive REPLACE

echo -e "${GREEN}✓ Archivos subidos${NC}"
echo ""

# Limpiar
rm -rf $BUILD_DIR
rm /tmp/bucket-policy.json

# Obtener URL del website
WEBSITE_URL="http://$BUCKET_NAME.s3-website-$AWS_REGION.amazonaws.com"

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  ¡Deployment exitoso!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "${YELLOW}URL del sitio web:${NC}"
echo "  $WEBSITE_URL"
echo ""
echo -e "${YELLOW}Siguientes pasos (OPCIONAL):${NC}"
echo "  1. Crear distribución CloudFront para HTTPS"
echo "  2. Configurar dominio personalizado"
echo "  3. Obtener certificado SSL gratis con ACM"
echo ""
echo -e "${YELLOW}Para crear CloudFront (HTTPS):${NC}"
echo "  aws cloudfront create-distribution --origin-domain-name $BUCKET_NAME.s3-website-$AWS_REGION.amazonaws.com"
echo ""
echo -e "${YELLOW}Prueba tu aplicación:${NC}"
echo "  open $WEBSITE_URL"
echo ""
