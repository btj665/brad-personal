import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { AuthProvider } from './auth/AuthProvider'
import { App } from './ui/Shell'
import './ui/styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>,
)
