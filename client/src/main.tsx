import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.tsx'

// Service Worker registrieren und neue Versionen sofort übernehmen. Zusammen mit
// registerType:'autoUpdate' + skipWaiting/clients.claim im SW ersetzt eine neue
// Version automatisch die alte und lädt die App neu (wichtig für PWAs auf iOS,
// die sonst dauerhaft die alte, gecachte Version anzeigen).
registerSW({ immediate: true })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
