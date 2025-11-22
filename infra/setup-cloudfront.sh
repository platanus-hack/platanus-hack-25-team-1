#!/bin/bash

# Script para crear distribución CloudFront para el frontend de BlindPower
# Uso: ./setup-cloudfront.sh [BUCKET_NAME] [AWS_REGION]

set -e  # Exit on error

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Variables
BUCKET_NAME="${1}"
AWS_REGION="${2:-sa-east-1}"

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  BlindPower - Setup CloudFront HTTPS${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# Validar que se proporcionó el nombre del bucket
if [ -z "$BUCKET_NAME" ]; then
    echo -e "${RED}Error: Debes proporcionar el nombre del bucket S3${NC}"
    echo ""
    echo "Uso: ./setup-cloudfront.sh [BUCKET_NAME] [REGION]"
    echo ""
    echo "Ejemplo:"
    echo "  ./setup-cloudfront.sh blindpower-frontend-1763822834 sa-east-1"
    echo ""
    exit 1
fi

# Verificar que AWS CLI está instalado
if ! command -v aws &> /dev/null; then
    echo -e "${RED}Error: AWS CLI no está instalado${NC}"
    echo "Instala con: brew install awscli (Mac) o pip install awscli"
    exit 1
fi

echo -e "${YELLOW}Configuración:${NC}"
echo "  Bucket: $BUCKET_NAME"
echo "  Región: $AWS_REGION"
echo "  Origin: $BUCKET_NAME.s3-website-$AWS_REGION.amazonaws.com"
echo ""

# Crear archivo de configuración de CloudFront
CLOUDFRONT_CONFIG="/tmp/cloudfront-config-$BUCKET_NAME.json"

echo -e "${YELLOW}Paso 1: Crear configuración de CloudFront${NC}"
cat > $CLOUDFRONT_CONFIG <<EOF
{
  "CallerReference": "blindpower-$(date +%s)",
  "Comment": "BlindPower Frontend Distribution - HTTPS para acceso a cámara",
  "Enabled": true,
  "DefaultRootObject": "index.html",
  "Origins": {
    "Quantity": 1,
    "Items": [
      {
        "Id": "S3-$BUCKET_NAME",
        "DomainName": "$BUCKET_NAME.s3-website-$AWS_REGION.amazonaws.com",
        "CustomOriginConfig": {
          "HTTPPort": 80,
          "HTTPSPort": 443,
          "OriginProtocolPolicy": "http-only"
        }
      }
    ]
  },
  "DefaultCacheBehavior": {
    "TargetOriginId": "S3-$BUCKET_NAME",
    "ViewerProtocolPolicy": "redirect-to-https",
    "AllowedMethods": {
      "Quantity": 2,
      "Items": ["GET", "HEAD"],
      "CachedMethods": {
        "Quantity": 2,
        "Items": ["GET", "HEAD"]
      }
    },
    "ForwardedValues": {
      "QueryString": false,
      "Cookies": {
        "Forward": "none"
      }
    },
    "MinTTL": 0,
    "DefaultTTL": 3600,
    "MaxTTL": 86400,
    "Compress": true,
    "TrustedSigners": {
      "Enabled": false,
      "Quantity": 0
    }
  },
  "CustomErrorResponses": {
    "Quantity": 1,
    "Items": [
      {
        "ErrorCode": 404,
        "ResponsePagePath": "/index.html",
        "ResponseCode": "200",
        "ErrorCachingMinTTL": 300
      }
    ]
  },
  "PriceClass": "PriceClass_100"
}
EOF

echo -e "${GREEN}✓ Configuración creada${NC}"
echo ""

echo -e "${YELLOW}Paso 2: Crear distribución CloudFront${NC}"
echo -e "${YELLOW}(Esto puede tomar 10-15 minutos)${NC}"
echo ""

DISTRIBUTION_OUTPUT=$(aws cloudfront create-distribution --distribution-config file://$CLOUDFRONT_CONFIG --region us-east-1 2>&1)

if [ $? -eq 0 ]; then
    # Extraer ID y Domain Name
    DISTRIBUTION_ID=$(echo "$DISTRIBUTION_OUTPUT" | grep -o '"Id": "[^"]*"' | head -1 | cut -d'"' -f4)
    DOMAIN_NAME=$(echo "$DISTRIBUTION_OUTPUT" | grep -o '"DomainName": "[^"]*"' | head -1 | cut -d'"' -f4)

    echo -e "${GREEN}✓ Distribución CloudFront creada${NC}"
    echo ""

    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}  ¡CloudFront configurado!${NC}"
    echo -e "${GREEN}========================================${NC}"
    echo ""
    echo -e "${YELLOW}Distribution ID:${NC}"
    echo "  $DISTRIBUTION_ID"
    echo ""
    echo -e "${YELLOW}URL HTTPS de tu aplicación:${NC}"
    echo "  https://$DOMAIN_NAME"
    echo ""
    echo -e "${YELLOW}Estado del deployment:${NC}"
    echo "  aws cloudfront get-distribution --id $DISTRIBUTION_ID --query 'Distribution.Status' --output text"
    echo ""
    echo -e "${YELLOW}⏰ IMPORTANTE:${NC}"
    echo "  El deployment de CloudFront tarda 10-15 minutos."
    echo "  Puedes verificar el progreso con:"
    echo "  aws cloudfront get-distribution --id $DISTRIBUTION_ID"
    echo ""
    echo -e "${YELLOW}Cuando el estado sea 'Deployed', prueba tu aplicación:${NC}"
    echo "  open https://$DOMAIN_NAME"
    echo ""

    # Guardar información
    echo "$DISTRIBUTION_ID" > /tmp/cloudfront-distribution-id.txt
    echo "$DOMAIN_NAME" > /tmp/cloudfront-domain.txt

    echo -e "${GREEN}✓ IDs guardados en /tmp/cloudfront-*.txt${NC}"
    echo ""

else
    echo -e "${RED}Error al crear distribución CloudFront:${NC}"
    echo "$DISTRIBUTION_OUTPUT"
    exit 1
fi

# Limpiar
rm $CLOUDFRONT_CONFIG

echo -e "${YELLOW}Monitorear deployment:${NC}"
echo "  watch -n 5 'aws cloudfront get-distribution --id $DISTRIBUTION_ID --query Distribution.Status --output text'"
echo ""
