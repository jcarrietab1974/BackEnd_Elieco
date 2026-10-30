# BackEnd_Elieco
Aplicación web ligera
# Backend de contacto (ELIECO)

API Node.js + Express que recibe el formulario de contacto de la web y lo envía por correo con Nodemailer.
WhatsApp se resuelve con enlaces *Click to Chat* (no requiere endpoint ni credenciales).

## Estructura

```
server.js                 Punto de entrada: valida configuración, arranca el servidor
app.js                    Construye la app Express (helmet, CORS, rate limit, rutas, errores)
config/env.js             Carga y valida variables de entorno (informa nombres, nunca valores)
config/mailer.js          Transporte SMTP de Nodemailer + verificación
routes/contactRoutes.js   POST /api/contact
services/mailService.js   Plantilla HTML/texto y envío
middleware/errorHandler.js  404 y errores → siempre JSON
utils/validateContact.js  Validación y normalización
utils/html.js             Escapado HTML
utils/whatsapp.js         Enlaces wa.me
utils/respond.js          Formato de respuestas JSON
tests/                    Pruebas automatizadas (node --test), sin red ni correo real
```

## Requisitos
Node.js ≥ 18 (probado con 22) y npm.

## Puesta en marcha

```bash
cd backend
npm install
cp .env.example .env      # Windows (PowerShell): Copy-Item .env.example .env
# Edite .env con sus valores reales (ver "Variables de entorno")
npm run dev               # desarrollo (nodemon)   |   npm start  → producción
npm test                  # pruebas automatizadas
```

Si falta una variable obligatoria el servidor **no arranca** y lista cuáles faltan (sin mostrar valores).

## Variables de entorno

| Variable | Obligatoria | Descripción |
|---|---|---|
| `EMAIL_USER` | Sí | Cuenta que envía (remitente SMTP autorizado). |
| `EMAIL_PASS` | Sí | Gmail: **contraseña de aplicación** de 16 caracteres. |
| `EMAIL_TO` | Sí | Destinatario(s) del formulario; varios separados por coma. |
| `FRONTEND_ORIGIN` | En producción | Origen(es) autorizados por CORS, separados por coma, sin `/` final ni `*`. Dev: `http://localhost:5173`. |
| `NODE_ENV` | No | `development` (defecto) o `production`. |
| `PORT` | No | Defecto `5000`. |
| `TRUST_PROXY` | No | Nº de proxies de confianza (defecto `0`; normalmente `1` en Render/Railway/Nginx). |
| `EMAIL_FROM_NAME` | No | Nombre visible del remitente. |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` | No | Defecto Gmail `smtp.gmail.com` / `465` / `true`. |
| `RATE_LIMIT_MAX` / `RATE_LIMIT_WINDOW_MINUTES` | No | Defecto 5 solicitudes por IP cada 15 min. |
| `APP_TIMEZONE` | No | Defecto `America/Bogota`. |
| `WHATSAPP_DEFAULT_COUNTRY_CODE` | No | Defecto `57`. Solo para el botón "Responder por WhatsApp" del correo. |

### Contraseña de aplicación de Gmail
1. Active la verificación en 2 pasos en la cuenta emisora.
2. Google Account → Seguridad → Contraseñas de aplicaciones → cree una para "Correo".
3. Péguela en `EMAIL_PASS` (los espacios se ignoran).

### Seguridad de `.env`
- `.env` está en `.gitignore`; `.env.example` (sin secretos) sí se versiona.
- Comprobar que no se versionó nunca:
  ```bash
  git check-ignore -v .env          # debe mostrar la regla de .gitignore
  git ls-files .env                 # debe salir vacío
  git log --all --full-history -- .env   # debe salir vacío
  ```
  Si alguna vez estuvo en Git o se compartió, **revoque la contraseña de aplicación y cree otra**.

## Contrato de la API

**Desarrollo:** `http://localhost:5000` · **Producción:** *(por definir al desplegar)*

### `POST /api/contact`
Cabecera: `Content-Type: application/json`

| Campo | Tipo | Obligatorio | Reglas |
|---|---|---|---|
| `nombre` | string | Sí | 2–100 caracteres, sin saltos de línea. |
| `email` | string | Sí | Formato válido, máx. 254. |
| `telefono` | string | **No** | 7–15 dígitos; admite `+`, espacios, `-`, `()`. |
| `mensaje` | string | Sí | 5–2000 caracteres; se conservan tildes y saltos de línea. |
| `website` | string | No | **Campo trampa**: input oculto que debe ir vacío. |

```json
{ "nombre": "Usuario de prueba", "email": "usuario@example.com", "telefono": "3001234567", "mensaje": "Deseo obtener más información sobre sus productos." }
```

### Respuestas
Éxito: `{ "success": true, "code": "CONTACT_SENT", "message": "..." }`
Error: `{ "success": false, "code": "...", "message": "...", "errors": [{ "field": "email", "message": "..." }] }`

| HTTP | `code` | Cuándo |
|---|---|---|
| 200 | `CONTACT_SENT` | Correo enviado (confirmado por el SMTP). |
| 400 | `MISSING_FIELDS` | Falta nombre, email o mensaje. |
| 400 | `VALIDATION_ERROR` | Formato, longitud o tipo inválido. |
| 400 | `INVALID_JSON` | JSON mal formado. |
| 413 | `PAYLOAD_TOO_LARGE` | Cuerpo > 10 kb. |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | Content-Type no es JSON. |
| 429 | `TOO_MANY_REQUESTS` | Límite de solicitudes por IP excedido (cabecera `RateLimit-*`). |
| 503 | `MAIL_SERVICE_ERROR` | Falla el proveedor de correo: **reintentar más tarde**. |
| 500 | `INTERNAL_ERROR` | Error inesperado. |

También: `GET /api/health` → `{ "success": true, "status": "ok" }`.

### Comportamiento esperado del frontend
1. Validar los campos antes de enviar (mismas reglas que arriba).
2. Mostrar indicador de carga y **deshabilitar el botón** mientras se envía (evita duplicados).
3. Mostrar éxito **solo** con HTTP 200 + `success: true`.
4. Con 400, pintar `errors[].message` junto a cada `errors[].field`. Con 429/503/500, mostrar `message` y permitir reintentar.
5. No vaciar el formulario si falla.
6. Incluir un `<input name="website" tabindex="-1" autocomplete="off">` oculto con CSS (no `type="hidden"`) y enviarlo vacío.

## WhatsApp (Click to Chat)

No necesita endpoint en Express: es un enlace que abre la conversación en la app móvil o en WhatsApp Web/Desktop.

- Formato: `https://wa.me/<NUMERO>?text=<MENSAJE_CODIFICADO>`
- `<NUMERO>`: código de país + número, **solo dígitos** (ej. colombiano: `57` + 10 dígitos). Sin `+`, espacios ni guiones.
- El mensaje se codifica con `encodeURIComponent`. No incluya datos personales del visitante en el enlace.
- El número de la empresa **debe confirmarse**; el frontend lo tomará de su propia configuración (p. ej. `VITE_WHATSAPP_NUMBER`). Es un dato público, no un secreto.
- Ejemplo (frontend): ``const url = `https://wa.me/${NUMERO}?text=${encodeURIComponent('Hola, quiero más información')}`;`` y un `<a href={url} target="_blank" rel="noopener noreferrer">`.
- Adicionalmente, si el visitante deja su teléfono, el correo a la empresa incluye un botón **"Responder por WhatsApp"** con ese número (solo si puede convertirse sin adivinar: `+57…`, `0057…` o celular colombiano de 10 dígitos que empiece por 3).

## Pruebas manuales (curl)

```bash
curl -i -X POST http://localhost:5000/api/contact -H "Content-Type: application/json" \
  -d '{"nombre":"Usuario de prueba","email":"usuario@example.com","telefono":"3001234567","mensaje":"Prueba de contacto desde curl."}'
```
Una prueba exitosa **envía un correo real** a `EMAIL_TO`. Para pruebas sin enviar nada use `npm test`.

## Despliegue
- `NODE_ENV=production`, `FRONTEND_ORIGIN=https://su-dominio-real`, `TRUST_PROXY=1` si hay proxy.
- Configure las variables en el panel del hosting (no suba `.env`). Use HTTPS.
- Tras desplegar, haga una prueba real y compruebe que el correo llega a `EMAIL_TO` y que *Responder* escribe al visitante.
- Ejecute `npm audit --omit=dev` periódicamente.
