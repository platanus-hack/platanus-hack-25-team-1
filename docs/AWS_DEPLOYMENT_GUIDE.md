# Guía de Deployment a AWS - BlindPower

Esta guía te llevará paso a paso para deployar BlindPower en AWS usando **App Runner** (backend) y **S3** (frontend).

## 📋 Requisitos Previos

### 1. Cuenta AWS
- Crea una cuenta en [aws.amazon.com](https://aws.amazon.com)
- El primer año tiene **Free Tier** (capa gratuita)

### 2. Instalar AWS CLI
```bash
# macOS
brew install awscli

# O con pip
pip install awscli
```

Verificar instalación:
```bash
aws --version
```

### 3. Configurar Credenciales AWS

#### Opción A: Usando AWS CLI (Recomendado)
```bash
aws configure
```

Te pedirá:
- **AWS Access Key ID**: Lo obtienes en AWS Console → IAM → Users → Security credentials
- **AWS Secret Access Key**: Se muestra solo al crear el Access Key
- **Default region**: `us-east-1` (o tu preferida)
- **Default output format**: `json`

#### Opción B: Variables de entorno
```bash
export AWS_ACCESS_KEY_ID="tu-access-key"
export AWS_SECRET_ACCESS_KEY="tu-secret-key"
export AWS_DEFAULT_REGION="us-east-1"
```

### 4. Verificar Docker
```bash
docker --version
docker-compose --version
```

### 5. Obtener tu AWS Account ID
```bash
aws sts get-caller-identity --query Account --output text
```

Guarda este número, lo necesitarás.

---

## 🚀 Deployment en 3 Pasos

### Paso 1: Deploy del Backend a App Runner

#### 1.1 Construir y subir imagen a ECR

Ejecuta el script automatizado:

```bash
./deploy-backend-ecr.sh us-east-1 TU_ACCOUNT_ID latest
```

**Ejemplo:**
```bash
./deploy-backend-ecr.sh us-east-1 123456789012 latest
```

Este script:
- ✅ Crea un repositorio ECR (si no existe)
- ✅ Autentica Docker con ECR
- ✅ Construye la imagen del backend
- ✅ Sube la imagen a ECR

Al finalizar, te dará la URI de la imagen:
```
123456789012.dkr.ecr.us-east-1.amazonaws.com/blindpower-backend:latest
```

#### 1.2 Crear servicio App Runner

**Opción A: Desde la Consola AWS (Más fácil para principiantes)**

1. Ve a [AWS Console → App Runner](https://console.aws.amazon.com/apprunner)
2. Click en "Create service"
3. **Source:**
   - Source type: `Container registry`
   - Provider: `Amazon ECR`
   - Container image URI: Pega la URI que obtuviste arriba
   - Deployment trigger: `Automatic`
4. **Deployment settings:**
   - ECR access role: `Create new service role`
5. **Service settings:**
   - Service name: `blindpower-backend`
   - Virtual CPU: `2 vCPU`
   - Memory: `4 GB`
   - Port: `8000`
6. **Environment variables:**
   - Agregar variable:
     - Key: `CORS_ORIGINS`
     - Value: `*`
   - Agregar variable:
     - Key: `PYTHONUNBUFFERED`
     - Value: `1`
7. **Health check:**
   - Protocol: `HTTP`
   - Path: `/health`
   - Interval: `10` seconds
   - Timeout: `5` seconds
   - Healthy threshold: `1`
   - Unhealthy threshold: `5`
8. **Auto scaling:**
   - Min instances: `1`
   - Max instances: `5`
9. Click "Create & deploy"

**Tiempo de deployment:** 5-10 minutos

Una vez completado, verás la URL del servicio:
```
https://abc123xyz.us-east-1.awsapprunner.com
```

**⚠️ GUARDA ESTA URL - La necesitarás para el frontend**

**Opción B: Desde la línea de comandos**

1. Edita `apprunner-config.json` y reemplaza `YOUR_ACCOUNT_ID` con tu Account ID

2. Crea el servicio:
```bash
aws apprunner create-service --cli-input-json file://apprunner-config.json
```

3. Obtener la URL del servicio:
```bash
aws apprunner list-services --query "ServiceSummaryList[?ServiceName=='blindpower-backend'].ServiceUrl" --output text
```

#### 1.3 Verificar que funciona

```bash
# Reemplaza con tu URL de App Runner
curl https://abc123xyz.us-east-1.awsapprunner.com/health
```

Deberías ver:
```json
{
  "status": "healthy",
  "detector_loaded": true,
  "model": "YOLOv8"
}
```

---

### Paso 2: Deploy del Frontend a S3

#### 2.1 Ejecutar script de deployment

```bash
./deploy-frontend-s3.sh https://abc123xyz.us-east-1.awsapprunner.com
```

Reemplaza la URL con la de tu servicio App Runner del Paso 1.

Opcionalmente, puedes especificar un nombre de bucket:
```bash
./deploy-frontend-s3.sh https://abc123xyz.us-east-1.awsapprunner.com mi-bucket-frontend
```

Este script:
- ✅ Crea un bucket S3
- ✅ Configura hosting web estático
- ✅ Actualiza `app.js` con la URL de tu backend
- ✅ Sube todos los archivos del frontend
- ✅ Configura permisos públicos

#### 2.2 Obtener URL del sitio web

Al finalizar el script, verás:
```
URL del sitio web:
  http://blindpower-frontend.s3-website-us-east-1.amazonaws.com
```

**¡Abre esa URL en tu navegador y prueba la app!**

---

### Paso 3: (Opcional) Configurar HTTPS con CloudFront

Por defecto, S3 solo da HTTP. Para HTTPS:

#### 3.1 Crear distribución CloudFront

```bash
# Reemplaza con tu bucket
BUCKET_NAME="blindpower-frontend"
AWS_REGION="us-east-1"

aws cloudfront create-distribution \
  --origin-domain-name $BUCKET_NAME.s3-website-$AWS_REGION.amazonaws.com \
  --default-root-object index.html
```

O desde la consola:
1. Ve a [CloudFront Console](https://console.aws.amazon.com/cloudfront)
2. Create distribution
3. Origin domain: Tu bucket S3 (seleccionar de la lista)
4. Origin path: (dejar vacío)
5. Viewer protocol policy: `Redirect HTTP to HTTPS`
6. Default root object: `index.html`
7. Create distribution

**Tiempo de deployment:** 10-15 minutos

#### 3.2 Obtener URL de CloudFront

```bash
aws cloudfront list-distributions --query "DistributionList.Items[0].DomainName" --output text
```

Tu app ahora está en:
```
https://d1234abcd5678.cloudfront.net
```

---

## 🔄 CI/CD Automático con GitHub Actions

### Configurar Secrets en GitHub

1. Ve a tu repo en GitHub
2. Settings → Secrets and variables → Actions
3. Click "New repository secret"

Crea estos secrets:

| Secret Name | Value | Dónde obtenerlo |
|------------|-------|-----------------|
| `AWS_ACCESS_KEY_ID` | Tu Access Key | IAM → Users → Security credentials |
| `AWS_SECRET_ACCESS_KEY` | Tu Secret Key | Se muestra al crear el Access Key |
| `BACKEND_URL` | URL de App Runner | Console App Runner o `aws apprunner list-services` |
| `CLOUDFRONT_DISTRIBUTION_ID` | ID de CloudFront | Console CloudFront (opcional) |

### Editar workflows

1. Abre [.github/workflows/deploy-frontend.yml](.github/workflows/deploy-frontend.yml)
2. Cambia `S3_BUCKET` a tu nombre de bucket:
   ```yaml
   env:
     S3_BUCKET: tu-bucket-frontend  # Cambia esto
   ```

### Probar el CI/CD

1. Haz un cambio en `backend/app.py` o `frontend/app.js`
2. Commit y push:
   ```bash
   git add .
   git commit -m "Test CI/CD"
   git push
   ```
3. Ve a GitHub → Actions
4. Verás los workflows ejecutándose
5. ¡Deployment automático! 🎉

---

## 📊 Monitoreo y Logs

### Ver logs del backend

**Opción 1: AWS Console**
1. Ve a App Runner → Services → blindpower-backend
2. Click en "Logs" tab
3. Verás logs en tiempo real

**Opción 2: AWS CLI**
```bash
# Listar log streams
aws logs tail /aws/apprunner/blindpower-backend --follow
```

### Ver métricas

1. App Runner Console → Metrics tab
2. Verás:
   - Requests por segundo
   - Latencia (response time)
   - HTTP status codes
   - CPU/Memory usage
   - Active instances

### Configurar alarmas

```bash
# Alarma si hay muchos errores 5xx
aws cloudwatch put-metric-alarm \
  --alarm-name blindpower-high-errors \
  --alarm-description "Alerta si hay más de 10 errores 5xx en 5 minutos" \
  --metric-name 5XXResponse \
  --namespace AWS/AppRunner \
  --statistic Sum \
  --period 300 \
  --threshold 10 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 1
```

---

## 💰 Costos Estimados

### App Runner (Backend)
- **2 vCPU, 4 GB RAM**
- Precio: $0.017/hora
- **Con 1 instancia siempre activa:** ~$12/mes
- **Con auto-scaling a 0 en horas inactivas:** ~$5-10/mes

### S3 (Frontend)
- Storage: $0.023/GB → ~$0.01/mes (archivos muy pequeños)
- Requests: $0.0004/1000 GET → ~$0.10/mes (tráfico bajo)
- **Total S3:** ~$0.50/mes

### CloudFront (Opcional)
- 1 TB de transferencia: $85/mes
- Para tráfico bajo (1-10 GB): ~$1-3/mes

### Total Estimado
- **Sin CloudFront:** $12-15/mes
- **Con CloudFront:** $15-20/mes
- **Con auto-scaling inteligente:** $8-12/mes

### Free Tier (Primer año)
- App Runner: Incluido en algunos programas de créditos
- S3: Primeros 5 GB gratis
- CloudFront: 1 TB de transferencia gratis (primer año)

---

## 🔧 Troubleshooting

### Error: "Service App Runner no existe"

Si el workflow de GitHub falla con este error:
1. Asegúrate de haber creado el servicio App Runner primero (Paso 1.2)
2. Verifica el nombre del servicio en `apprunner-config.json`

### Error: "Failed to load model"

- El modelo se descarga automáticamente al iniciar
- Puede tomar 30-60 segundos en el primer arranque
- Verifica logs: `aws logs tail /aws/apprunner/blindpower-backend --follow`

### Error: "CORS policy"

Si el frontend no puede llamar al backend:
1. Verifica que `CORS_ORIGINS=*` esté en las variables de entorno
2. O configura específicamente: `CORS_ORIGINS=https://tu-dominio.com`

### Frontend muestra "Connection refused"

- Verifica que la URL del backend en `app.js` sea correcta
- Abre DevTools (F12) → Console para ver el error exacto
- Verifica que el backend esté corriendo: `curl https://tu-backend.com/health`

### Costos inesperados

1. Ve a AWS Console → Billing Dashboard
2. Revisa "Cost Explorer"
3. Filtra por servicio para ver qué está generando costos
4. Configura alertas de billing:
   ```bash
   aws budgets create-budget --budget file://budget.json
   ```

### App Runner tarda mucho en deployar

- Es normal: 5-10 minutos
- Construye la imagen (PyTorch es grande)
- Descarga el modelo YOLOv8
- Health checks deben pasar

---

## 🎯 Optimizaciones

### 1. Reducir tiempo de cold start

Opción: Pre-descargar modelo en la imagen Docker

Edita `backend/Dockerfile`:
```dockerfile
# Agregar después de COPY . .
RUN python -c "from ultralytics import YOLO; YOLO('yolov8n.pt')"
```

Rebuild y push:
```bash
./deploy-backend-ecr.sh us-east-1 TU_ACCOUNT_ID latest
```

### 2. Reducir costos

**Auto-scaling a cero en horas inactivas:**

Edita en App Runner Console:
- Auto scaling → Min instances: `0` (si está disponible en tu región)

**Usar instancias más pequeñas (si tu workload lo permite):**
- 1 vCPU, 2 GB → $0.0085/hora (~$6/mes)

### 3. Mejorar performance

**Habilitar caché en CloudFront:**
```bash
# Editar behavior para cachear assets
aws cloudfront update-distribution --id TU_DISTRIBUTION_ID ...
```

**Comprimir respuestas (ya configurado en nginx):**
- Verifica que gzip esté activo en `frontend/nginx.conf`

---

## 🌐 Dominio Personalizado

### Con App Runner

1. Ve a App Runner Console → Custom domains
2. Click "Link domain"
3. Ingresa tu dominio (ej: `api.midominio.com`)
4. Copia los registros DNS que te da AWS
5. Agrégalos en tu proveedor de dominios (GoDaddy, Namecheap, etc.)
6. App Runner genera certificado SSL automáticamente

### Con CloudFront

1. Solicita certificado en ACM (AWS Certificate Manager)
   - **IMPORTANTE:** Debe ser en región `us-east-1` para CloudFront
   ```bash
   aws acm request-certificate \
     --domain-name midominio.com \
     --validation-method DNS \
     --region us-east-1
   ```
2. Valida el dominio (agregar registro DNS)
3. Configura el certificado en CloudFront
4. Crea registro CNAME en tu DNS:
   ```
   midominio.com → d1234abcd.cloudfront.net
   ```

---

## 🔒 Seguridad

### 1. Restringir CORS

En producción, cambia `CORS_ORIGINS`:

App Runner Console → Configuration → Environment variables:
```
CORS_ORIGINS=https://midominio.com
```

### 2. Habilitar WAF (Web Application Firewall)

Protege contra ataques comunes:
```bash
aws wafv2 create-web-acl \
  --name blindpower-waf \
  --scope CLOUDFRONT \
  --default-action Allow={} \
  --rules file://waf-rules.json
```

### 3. Limitar rate de requests

Edita `backend/app.py` para agregar rate limiting:
```python
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

@app.post("/predict")
@limiter.limit("10/minute")
async def predict(...):
    ...
```

---

## 📚 Recursos Útiles

- [AWS App Runner Docs](https://docs.aws.amazon.com/apprunner/)
- [AWS S3 Static Website Hosting](https://docs.aws.amazon.com/AmazonS3/latest/userguide/WebsiteHosting.html)
- [CloudFront Docs](https://docs.aws.amazon.com/cloudfront/)
- [GitHub Actions AWS Deploy](https://github.com/aws-actions)
- [AWS Free Tier](https://aws.amazon.com/free/)
- [AWS Pricing Calculator](https://calculator.aws/)

---

## 🆘 Soporte

Si tienes problemas:

1. **Revisa los logs:**
   ```bash
   aws logs tail /aws/apprunner/blindpower-backend --follow
   ```

2. **Verifica el health check:**
   ```bash
   curl https://tu-backend.com/health
   ```

3. **Revisa la configuración:**
   ```bash
   aws apprunner describe-service --service-arn arn:aws:apprunner:...
   ```

4. **Foros de AWS:**
   - [AWS re:Post](https://repost.aws/)
   - [Stack Overflow - aws-app-runner](https://stackoverflow.com/questions/tagged/aws-app-runner)

---

## ✅ Checklist de Deployment

- [ ] AWS CLI instalado y configurado
- [ ] Docker funcionando
- [ ] Backend subido a ECR
- [ ] Servicio App Runner creado y corriendo
- [ ] Health check del backend exitoso (`/health`)
- [ ] Frontend subido a S3
- [ ] Website S3 accesible desde navegador
- [ ] URL del backend actualizada en frontend
- [ ] (Opcional) CloudFront configurado para HTTPS
- [ ] (Opcional) Dominio personalizado configurado
- [ ] GitHub Secrets configurados
- [ ] CI/CD workflows funcionando
- [ ] Alarmas de monitoreo configuradas
- [ ] Budget alerts configuradas

---

¡Listo! Tu aplicación BlindPower está corriendo en AWS 🚀

**URLs de tu aplicación:**
- Backend API: `https://[tu-id].us-east-1.awsapprunner.com`
- Frontend: `http://[tu-bucket].s3-website-us-east-1.amazonaws.com`
- Frontend HTTPS: `https://[tu-id].cloudfront.net` (si configuraste CloudFront)
