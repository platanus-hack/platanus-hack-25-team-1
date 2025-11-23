#!/bin/bash

# Script para actualizar recursos y hacer deploy del backend en App Runner

set -e

REGION="${1:-us-east-1}"
SERVICE_ARN="arn:aws:apprunner:${REGION}:986323537682:service/blindpower-backend/cb9baeee4b9247a3a6eea29b058c3e6f"
IMAGE_URI="986323537682.dkr.ecr.${REGION}.amazonaws.com/blindpower-backend:latest"

echo "========================================"
echo "  BlindPower - Update & Deploy Backend"
echo "========================================"
echo ""
echo "Configuración:"
echo "  Región: $REGION"
echo "  Servicio: blindpower-backend"
echo "  Nueva CPU: 4 vCPU (4096)"
echo "  Nueva Memoria: 8 GB (8192 MB)"
echo "  Imagen: $IMAGE_URI"
echo ""

echo "Paso 1: Verificando estado del servicio..."
STATUS=$(aws apprunner describe-service \
  --service-arn "$SERVICE_ARN" \
  --region "$REGION" \
  --query "Service.Status" \
  --output text)

echo "Estado actual: $STATUS"

if [ "$STATUS" == "OPERATION_IN_PROGRESS" ]; then
  echo ""
  echo "⏳ El servicio está procesando una operación..."
  echo "   Esperando a que termine (esto puede tomar varios minutos)..."
  echo ""
  
  # Esperar hasta que el servicio esté RUNNING
  MAX_WAIT=600  # 10 minutos máximo
  ELAPSED=0
  INTERVAL=15
  
  while [ "$STATUS" == "OPERATION_IN_PROGRESS" ] && [ $ELAPSED -lt $MAX_WAIT ]; do
    sleep $INTERVAL
    ELAPSED=$((ELAPSED + INTERVAL))
    STATUS=$(aws apprunner describe-service \
      --service-arn "$SERVICE_ARN" \
      --region "$REGION" \
      --query "Service.Status" \
      --output text)
    echo "   [$ELAPSED s] Estado: $STATUS"
  done
  
  if [ "$STATUS" == "OPERATION_IN_PROGRESS" ]; then
    echo ""
    echo "❌ El servicio aún está en progreso después de $ELAPSED segundos"
    echo "   Puedes ejecutar este script más tarde cuando esté listo."
    exit 1
  fi
fi

echo ""
echo "✓ Servicio listo: $STATUS"
echo ""

echo "Paso 2: Actualizando configuración (CPU, Memoria e Imagen)..."
aws apprunner update-service \
  --service-arn "$SERVICE_ARN" \
  --region "$REGION" \
  --instance-configuration "Cpu=4096,Memory=8192" \
  --source-configuration "ImageRepository={ImageIdentifier=$IMAGE_URI,ImageConfiguration={Port=8000,RuntimeEnvironmentVariables={CORS_ORIGINS=*,PYTHONUNBUFFERED=1}},ImageRepositoryType=ECR},AutoDeploymentsEnabled=true,AuthenticationConfiguration={AccessRoleArn=arn:aws:iam::986323537682:role/service-role/AppRunnerECRAccessRole}" \
  --output json > /dev/null

echo "✓ Actualización iniciada"
echo ""
echo "Paso 3: Esperando a que el despliegue termine..."
echo "   (Esto puede tomar 5-10 minutos mientras construye y despliega)"
echo ""

# Monitorear el progreso
ELAPSED=0
INTERVAL=20
MAX_WAIT=900  # 15 minutos máximo

while true; do
  sleep $INTERVAL
  ELAPSED=$((ELAPSED + INTERVAL))
  
  STATUS=$(aws apprunner describe-service \
    --service-arn "$SERVICE_ARN" \
    --region "$REGION" \
    --query "Service.Status" \
    --output text)
  
  OPERATION=$(aws apprunner list-operations \
    --service-arn "$SERVICE_ARN" \
    --region "$REGION" \
    --max-results 1 \
    --query "OperationSummaryList[0].[Type,Status]" \
    --output text 2>/dev/null || echo "UNKNOWN UNKNOWN")
  
  OP_TYPE=$(echo "$OPERATION" | awk '{print $1}')
  OP_STATUS=$(echo "$OPERATION" | awk '{print $2}')
  
  echo "   [$ELAPSED s] Servicio: $STATUS | Operación: $OP_TYPE ($OP_STATUS)"
  
  if [ "$STATUS" == "RUNNING" ] && [ "$OP_STATUS" == "SUCCEEDED" ]; then
    echo ""
    echo "✓ Despliegue completado exitosamente"
    break
  fi
  
  if [ "$OP_STATUS" == "FAILED" ] || [ "$STATUS" == "CREATE_FAILED" ] || [ "$STATUS" == "UPDATE_FAILED" ]; then
    echo ""
    echo "❌ El despliegue falló. Revisa los logs en la consola de AWS."
    exit 1
  fi
  
  if [ $ELAPSED -ge $MAX_WAIT ]; then
    echo ""
    echo "⏱️  Tiempo máximo de espera alcanzado ($MAX_WAIT s)"
    echo "   El despliegue continúa en segundo plano."
    echo "   Verifica el estado en: https://console.aws.amazon.com/apprunner"
    break
  fi
done

echo ""
echo "========================================"
echo "  ¡Actualización y Deploy Exitosos!"
echo "========================================"
echo ""
echo "Nuevos recursos:"
echo "  CPU: 4 vCPU (4096)"
echo "  Memoria: 8 GB (8192 MB)"
echo ""
echo "Imagen desplegada:"
echo "  $IMAGE_URI"
echo ""
echo "URL del servicio:"
echo "  https://ryi9nvetjj.us-east-1.awsapprunner.com"
echo ""
echo "Endpoints:"
echo "  Health: https://ryi9nvetjj.us-east-1.awsapprunner.com/health"
echo "  Predict: https://ryi9nvetjj.us-east-1.awsapprunner.com/predict"
echo ""
