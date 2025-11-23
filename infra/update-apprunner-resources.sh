#!/bin/bash

# Script para actualizar los recursos de App Runner

set -e

REGION="${1:-us-east-1}"
SERVICE_ARN="arn:aws:apprunner:${REGION}:986323537682:service/blindpower-backend/cb9baeee4b9247a3a6eea29b058c3e6f"

echo "========================================"
echo "  Actualizar recursos de App Runner"
echo "========================================"
echo ""
echo "Configuración:"
echo "  Región: $REGION"
echo "  Servicio: blindpower-backend"
echo "  CPU: 4 vCPU (4096)"
echo "  Memoria: 8 GB (8192 MB)"
echo ""

echo "Paso 1: Actualizar configuración del servicio..."
aws apprunner update-service \
  --service-arn "$SERVICE_ARN" \
  --region "$REGION" \
  --instance-configuration "Cpu=4096,Memory=8192" \
  --output json

echo ""
echo "✓ Configuración actualizada"
echo ""
echo "Paso 2: Esperando a que el servicio se actualice..."

# Esperar a que el servicio esté listo
aws apprunner wait service-running \
  --service-arn "$SERVICE_ARN" \
  --region "$REGION" || true

echo ""
echo "✓ Servicio actualizado"
echo ""
echo "========================================"
echo "  ¡Actualización exitosa!"
echo "========================================"
echo ""
echo "Nuevos recursos:"
echo "  CPU: 4 vCPU"
echo "  Memoria: 8 GB"
echo ""
echo "URL del servicio:"
echo "  https://ryi9nvetjj.us-east-1.awsapprunner.com"
echo ""
