import { defineConfig } from 'vite'

export default defineConfig({
  envPrefix: ['VITE_', 'API_BASE_URL', 'ONESIGNAL_APP_ID'],
})
