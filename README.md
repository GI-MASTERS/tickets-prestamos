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

Las reservas del día se agrupan por set en tres tableros horizontales. El panel se actualiza automáticamente cada 60 segundos y el timbre revisa localmente las próximas reservas cada 15 segundos.

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
