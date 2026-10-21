# tickets-prestamos

Panel Kanban para consultar equipos y reservas desde AppSheet.

## Configuración local

1. Copiá `.env.example` como `.env`.
2. Completá `APPSHEET_APP_ID` y `APPSHEET_ACCESS_KEY` con una clave nueva.
3. Ejecutá `npm run dev`.

El frontend consulta `/api/boards`. En local, `server.js` usa la clave para leer las tablas de AppSheet y nunca la expone al navegador.

La integración usa únicamente la acción `Find` sobre estas tablas:

- `Reservas`
- `Sets`
- `Usuarios`

Las reservas del día se agrupan por set en tres tableros horizontales. El panel consulta una versión liviana cada 30 segundos y solo vuelve a descargar las reservas cuando el webhook registra cambios. El timbre revisa localmente las próximas reservas cada 15 segundos.

## Despliegue en Cloudflare Pages

1. Subí este repositorio a GitHub o GitLab.
2. En Cloudflare, abrí `Workers & Pages` y elegí `Create application > Pages > Connect to Git`.
3. Seleccioná el repositorio.
4. Configurá el build:
   - Framework preset: `Vite`
   - Build command: `npm run build`
   - Build output directory: `dist`
5. En `Settings > Environment variables`, agregá estas variables para `Production` y `Preview`:
   - `APPSHEET_APP_ID`
   - `APPSHEET_ACCESS_KEY`
   - `WEBHOOK_SECRET`
   - `ONESIGNAL_APP_ID`
   - `ONESIGNAL_REST_API_KEY`
6. Guardá y ejecutá un nuevo deploy.

Cloudflare detecta automáticamente `functions/api/boards.js` y `functions/api/appsheet-webhook.js`. No uses el prefijo `VITE_` en estas variables, porque las claves deben permanecer del lado del servidor.

### Cache KV

En `Settings > Bindings`, creá un binding de Workers KV con:

```text
Type: KV namespace
Variable name: RESERVAS_CACHE
```

La función guarda la agenda durante 120 segundos. Si el webhook llega antes, reemplaza la cache inmediatamente. Sin este binding la aplicación sigue funcionando, pero vuelve a consultar AppSheet en cada actualización.

### Webhook de AppSheet

Creá una automatización de cambio de datos sobre `Reservas` y agregá una tarea webhook:

```text
POST https://TU_PROYECTO.pages.dev/api/appsheet-webhook
```

Agregá el header:

```text
X-Webhook-Secret: el_mismo_valor_de_WEBHOOK_SECRET
```

El cuerpo puede ser el evento estándar de AppSheet. La función no depende de sus campos: recibe el evento, vuelve a leer el snapshot y actualiza KV.

El archivo `server.js` se usa solo para desarrollo local. En Cloudflare Pages la consulta se ejecuta mediante Pages Functions.

## Android sin Play Store

La carpeta `android/` contiene una aplicación Capacitor instalable directamente como APK. Las notificaciones usan OneSignal y reproducen `android/app/src/main/res/raw/boarding_chime.mp3` como sonido personalizado.

### Configurar OneSignal

1. Creá una cuenta en OneSignal y una aplicación Android con el identificador `com.gimasters.ticketsprestamos`.
2. Completá en OneSignal la configuración de Firebase Cloud Messaging que solicita su asistente.
3. Copiá el OneSignal App ID en `.env` como `ONESIGNAL_APP_ID`.
4. Configurá en `.env` la URL pública de Cloudflare como `API_BASE_URL`.
5. Agregá `ONESIGNAL_APP_ID` y `ONESIGNAL_REST_API_KEY` como secretos de Cloudflare Pages.
6. Configurá la automatización de AppSheet para invocar el webhook solo al agregar una reserva. Cada llamada enviará una notificación a los teléfonos suscritos.

Para los avisos programados, agregá dos bots de AppSheet que invoquen el mismo webhook. Diez minutos antes:

```json
{
  "type": "start-reminder",
  "start": "<<[HoraInicio]>>",
  "room": "<<[SalonEntrega]>>"
}
```

Al finalizar:

```json
{
  "type": "reservation-ended",
  "end": "<<[HoraFin]>>",
  "room": "<<[SalonEntrega]>>"
}
```

Los tres webhooks deben incluir `X-Webhook-Secret`. Android reproduce `boarding_chime.mp3` incluso con la aplicación cerrada, sujeto a que el usuario no haya silenciado el canal de notificaciones desde los ajustes del teléfono.

### Generar un APK de prueba

```bash
npm run build
npm run android:sync
npm run android:apk
```

Si preferís ejecutar Gradle directamente desde la raíz del repositorio, usá `./android/gradlew -p android assembleDebug`. La opción `-p android` es necesaria porque `settings.gradle` está dentro de esa carpeta.

El APK queda en `android/app/build/outputs/apk/debug/app-debug.apk`. Se instala habilitando temporalmente la instalación desde orígenes desconocidos. Para distribución estable conviene generar y conservar una clave de firma release; sin la misma clave no se pueden instalar actualizaciones encima de versiones anteriores.

Al abrir la app Android por primera vez, usá `Avisos al teléfono` y aceptá el permiso. Después de eso la app puede estar cerrada: OneSignal entrega las notificaciones mediante FCM y Android reproduce el sonido configurado.

En iPhone la misma integración puede reutilizarse, pero iOS exige firma y aprovisionamiento mediante Apple Developer, TestFlight o una herramienta de sideloading. No existe un ZIP instalable sin firma equivalente al APK de Android.
