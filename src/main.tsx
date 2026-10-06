import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/bangers'
import '@fontsource-variable/rubik'
import App from './App'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
