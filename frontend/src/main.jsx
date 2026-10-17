import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/geist'
import '@fontsource-variable/geist-mono'
import '@fontsource-variable/oswald'
import 'leaflet/dist/leaflet.css'
import './index.css'
import App from './App.jsx'
import { session } from './lib/api.js'

// Презентація відкриває демо з ?fresh — щоразу з екрана входу, а не з місця, де його закрили
if (new URLSearchParams(window.location.search).has('fresh')) {
  session.clear()
  window.history.replaceState(null, '', window.location.pathname)
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
