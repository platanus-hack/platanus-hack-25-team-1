# BlindPower - Información de Deployment

**Fecha de deployment:** 2025-11-22

## URLs de la Aplicación

### Frontend
- **HTTP (S3):** http://blindpower-frontend-1763822834.s3-website-sa-east-1.amazonaws.com
- **HTTPS (CloudFront):** https://d3hb5x9ur5btik.cloudfront.net ⭐ **USA ESTA**

### Backend
- **App Runner:** https://ryi9nvetjj.us-east-1.awsapprunner.com

## CloudFront Distribution

- **Distribution ID:** E2ULKAFW4WIS12
- **Region:** Global (CloudFront)
- **Origin:** S3 Bucket en sa-east-1

### Comandos Útiles

Verificar estado del deployment:
```bash
aws cloudfront get-distribution --id E2ULKAFW4WIS12 --query 'Distribution.Status' --output text
```

Invalidar caché (después de actualizar archivos):
```bash
aws cloudfront create-invalidation --distribution-id E2ULKAFW4WIS12 --paths "/*"
```

Ver información completa de la distribución:
```bash
aws cloudfront get-distribution --id E2ULKAFW4WIS12
```

## S3 Bucket

- **Nombre:** blindpower-frontend-1763822834
- **Región:** sa-east-1
- **Configuración:** Static Website Hosting habilitado
- **Block Public Access:** Deshabilitado (necesario para website público)

## Arquitectura

```
Usuario
  ↓ HTTPS
CloudFront (CDN Global)
  ↓ HTTP
S3 Static Website (sa-east-1)
  ↓ HTTPS API calls
App Runner Backend (us-east-1)
  ↓
YOLOv8 + FastAPI
```

## Regiones

- **Frontend (S3):** sa-east-1 (Sudamérica - São Paulo)
- **Frontend (CloudFront):** Global - Edge Locations worldwide
- **Backend:** us-east-1 (Norte de Virginia)

**Nota:** La latencia entre frontend y backend es aceptable para un MVP. CloudFront cachea el contenido estático globalmente.

## Estado del Deployment

**CloudFront Status:** Verificar con:
```bash
aws cloudfront get-distribution --id E2ULKAFW4WIS12 --query 'Distribution.Status'
```

Cuando muestre `"Deployed"`, la aplicación estará lista.

**Tiempo estimado:** 10-15 minutos desde la creación

## Credenciales y Permisos

### Acceso a Cámara
La aplicación requiere:
- ✅ HTTPS (proporcionado por CloudFront)
- ✅ Permiso del navegador para acceder a la cámara
- ✅ Navegador compatible: Chrome, Firefox, Safari, Edge

### AWS Resources
- S3 Bucket Policy: Permite lectura pública de objetos
- CloudFront Origin Access: Usa HTTP origin desde S3 website endpoint
- App Runner: Acceso público con CORS configurado

## Próximos Pasos

### Para Producción

1. **Dominio Personalizado**
   - Registrar dominio (ej: blindpower.com)
   - Configurar DNS apuntando a CloudFront
   - Solicitar certificado SSL en AWS ACM (us-east-1)
   - Asociar certificado a CloudFront

2. **Optimizaciones**
   - Habilitar compresión Brotli en CloudFront
   - Configurar diferentes TTLs por tipo de archivo
   - Implementar versionado de archivos (cache busting)

3. **Monitoreo**
   - CloudWatch Alarms para errores en App Runner
   - CloudFront access logs para analytics
   - Budget alerts para controlar costos

4. **Seguridad**
   - Restringir CORS en backend (solo desde dominio específico)
   - Implementar rate limiting en backend
   - Configurar WAF en CloudFront si es necesario

## Costos Estimados

### CloudFront
- Primeros 1 TB/mes: Gratis (Free Tier primer año)
- Después: ~$0.085/GB
- Estimado para tráfico bajo: $1-5/mes

### S3
- Storage: ~$0.023/GB → $0.01/mes (archivos pequeños)
- Requests: $0.0004/1000 GET → $0.10/mes
- Total: ~$0.50/mes

### App Runner
- 2 vCPU, 4 GB RAM
- ~$12-15/mes con 1 instancia siempre activa

**Total Estimado:** $15-20/mes

## Troubleshooting

### Error: "La cámara solo funciona con HTTPS"
**Solución:** Usa la URL de CloudFront (https://d3hb5x9ur5btik.cloudfront.net)

### Error: "No se puede conectar al servidor"
**Verificar backend:**
```bash
curl https://ryi9nvetjj.us-east-1.awsapprunner.com/health
```

### Frontend no muestra cambios
**Invalidar caché de CloudFront:**
```bash
aws cloudfront create-invalidation --distribution-id E2ULKAFW4WIS12 --paths "/*"
```

### CloudFront devuelve 403/404
**Verificar que S3 bucket:**
- Tenga Block Public Access deshabilitado
- Tenga bucket policy configurada
- Tenga website hosting habilitado

## Scripts de Deployment

### Backend
```bash
bash infra/deploy-backend-ecr.sh us-east-1 <AWS_ACCOUNT_ID>
```

### Frontend
```bash
bash infra/deploy-frontend-s3.sh https://ryi9nvetjj.us-east-1.awsapprunner.com blindpower-frontend-1763822834 sa-east-1
```

### CloudFront Setup
```bash
bash infra/setup-cloudfront.sh blindpower-frontend-1763822834 sa-east-1
```

## Contacto y Soporte

- **Logs del Backend:** AWS Console → App Runner → blindpower-backend → Logs
- **Logs de CloudFront:** AWS Console → CloudFront → Monitoring
- **S3 Access Logs:** Configurar en bucket settings si es necesario

---

**Última actualización:** 2025-11-22
**Deployment por:** Claude Code
