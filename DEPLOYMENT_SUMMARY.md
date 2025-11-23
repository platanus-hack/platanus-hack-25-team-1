# BlindPower - Deployment Summary

**Última actualización:** 2025-11-22

## ✅ URLs Actuales

### Frontend
- **HTTPS (CloudFront):** https://d3hb5x9ur5btik.cloudfront.net ⭐ **USA ESTA**
- **HTTP (S3):** http://blindpower-frontend-1763822834.s3-website-sa-east-1.amazonaws.com ⚠️ No usar (sin HTTPS, cámara no funciona)

### Backend
- **App Runner:** https://ryi9nvetjj.us-east-1.awsapprunner.com

---

## 🔧 GitHub Actions - Configuración

### Secrets Requeridos

Configura estos secrets en GitHub para que los workflows funcionen:

**Path:** Settings → Secrets and variables → Actions → New repository secret

| Secret Name | Value | Dónde obtenerlo |
|------------|-------|-----------------|
| `AWS_ACCESS_KEY_ID` | `<tu-access-key>` | AWS IAM → Users → Security credentials |
| `AWS_SECRET_ACCESS_KEY` | `<tu-secret-key>` | Se muestra al crear el Access Key |
| `BACKEND_URL` | `https://ryi9nvetjj.us-east-1.awsapprunner.com` | URL de App Runner |

### ✅ Workflows Actualizados

#### **deploy-frontend.yml**
- ✅ Región: sa-east-1
- ✅ Bucket: blindpower-frontend-1763822834
- ✅ CloudFront ID: E2ULKAFW4WIS12
- ✅ Deshabilita Block Public Access automáticamente
- ✅ Invalida caché de CloudFront automáticamente
- ✅ Actualiza URL del backend desde secret

#### **deploy-backend.yml**
- ✅ Región: us-east-1
- ✅ ECR: blindpower-backend
- ✅ App Runner: blindpower-backend
- ✅ Build y push a ECR automático
- ✅ Trigger deployment a App Runner

### Cómo usar GitHub Actions

**Automático:**
- Push a `main` con cambios en `frontend/**` → Deploy frontend
- Push a `main` con cambios en `backend/**` → Deploy backend

**Manual:**
1. Ve a GitHub → Actions
2. Selecciona el workflow (Deploy Frontend o Deploy Backend)
3. Click "Run workflow"
4. Selecciona branch "main"
5. Click "Run workflow"

---

## 🚀 Deployment Manual

### Frontend
```bash
bash infra/deploy-frontend-s3.sh https://ryi9nvetjj.us-east-1.awsapprunner.com blindpower-frontend-1763822834 sa-east-1

# Invalidar caché CloudFront
aws cloudfront create-invalidation --distribution-id E2ULKAFW4WIS12 --paths "/*"
```

### Backend
```bash
bash infra/deploy-backend-ecr.sh us-east-1 986323537682 latest

# Trigger update en App Runner
aws apprunner start-deployment --service-arn <SERVICE_ARN>
```

---

## 📋 Recursos AWS

### Frontend
- **S3 Bucket:** blindpower-frontend-1763822834
- **Región:** sa-east-1
- **CloudFront Distribution:** E2ULKAFW4WIS12
- **CloudFront Domain:** d3hb5x9ur5btik.cloudfront.net

### Backend
- **ECR Repository:** blindpower-backend
- **Región:** us-east-1
- **App Runner Service:** blindpower-backend
- **App Runner URL:** ryi9nvetjj.us-east-1.awsapprunner.com
- **AWS Account ID:** 986323537682

---

## 🧪 Testing

### Verificar Backend
```bash
curl https://ryi9nvetjj.us-east-1.awsapprunner.com/health
```

Respuesta esperada:
```json
{
  "status": "healthy",
  "detector_loaded": true,
  "model": "YOLOv8"
}
```

### Verificar Frontend
1. Abre: https://d3hb5x9ur5btik.cloudfront.net
2. Click "Iniciar Copiloto"
3. Permite acceso a la cámara
4. Debería detectar objetos en tiempo real

---

## 🔍 Troubleshooting

### "La cámara solo funciona con HTTPS"
**Causa:** Estás usando la URL de S3 (HTTP)
**Solución:** Usa https://d3hb5x9ur5btik.cloudfront.net

### Frontend no muestra cambios
```bash
# Invalidar caché de CloudFront
aws cloudfront create-invalidation --distribution-id E2ULKAFW4WIS12 --paths "/*"

# Esperar 1-2 minutos
# Refrescar navegador con Cmd+Shift+R (Mac) o Ctrl+Shift+R (Windows)
```

### GitHub Actions falla con "AccessDenied"
**Causa:** Secrets no configurados o incorrectos
**Solución:**
1. Verifica en Settings → Secrets → Actions
2. Asegúrate de tener `AWS_ACCESS_KEY_ID` y `AWS_SECRET_ACCESS_KEY`
3. Verifica que el usuario IAM tenga permisos para S3, ECR, App Runner, CloudFront

### Backend no responde
```bash
# Ver logs en App Runner
aws logs tail /aws/apprunner/blindpower-backend --follow

# O desde AWS Console
# App Runner → Services → blindpower-backend → Logs
```

---

## 💰 Costos Actuales (Estimado)

| Servicio | Configuración | Costo Mensual |
|----------|--------------|---------------|
| App Runner | 2 vCPU, 4 GB RAM | ~$12-15 |
| S3 | ~30 KB storage | ~$0.50 |
| CloudFront | Tráfico bajo | ~$1-3 (Free Tier: 1TB gratis primer año) |
| ECR | Storage de imágenes | ~$0.10 |
| **Total** | | **~$15-20/mes** |

---

## 📚 Archivos de Infraestructura

### Scripts de Deployment
- `infra/deploy-backend-ecr.sh` - Deploy backend a ECR
- `infra/deploy-frontend-s3.sh` - Deploy frontend a S3
- `infra/setup-cloudfront.sh` - Setup CloudFront HTTPS

### CI/CD
- `.github/workflows/deploy-backend.yml` - Workflow backend
- `.github/workflows/deploy-frontend.yml` - Workflow frontend

### Configuración
- `docker-compose.yml` - Desarrollo local
- `backend/Dockerfile` - Container backend
- `frontend/Dockerfile` - Container frontend (no usado en S3)
- `frontend/nginx.conf` - Config nginx (solo local)
- `apprunner-config.json` - Template App Runner

---

## 🎯 Próximos Pasos Recomendados

### Configurar GitHub Secrets
```
1. Settings → Secrets and variables → Actions
2. Agregar AWS_ACCESS_KEY_ID
3. Agregar AWS_SECRET_ACCESS_KEY
4. Agregar BACKEND_URL
```

### Test GitHub Actions
```
1. Hacer un cambio en frontend/index.html
2. Commit y push a main
3. Ver GitHub → Actions
4. Verificar que deploy funcione
```

### Dominio Personalizado (Opcional)
```
1. Registrar dominio (ej: blindpower.com)
2. Crear certificado SSL en ACM (us-east-1)
3. Configurar CloudFront con certificado
4. Actualizar DNS con CNAME
```

---

## 📞 Comandos Útiles

```bash
# Ver estado de CloudFront
aws cloudfront get-distribution --id E2ULKAFW4WIS12 --query 'Distribution.Status'

# Ver logs de App Runner
aws logs tail /aws/apprunner/blindpower-backend --follow

# Listar servicios App Runner
aws apprunner list-services --region us-east-1

# Ver contenido del bucket S3
aws s3 ls s3://blindpower-frontend-1763822834/ --region sa-east-1

# Trigger deployment manual del backend
aws apprunner start-deployment --service-arn <ARN>
```

---

**¿Preguntas o problemas?**
Consulta AWS_DEPLOYMENT_GUIDE.md o DOCKER_SETUP.md para más detalles.
