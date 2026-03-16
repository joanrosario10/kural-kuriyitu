import './monacoWorkers'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import loader from '@monaco-editor/loader'
import * as monaco from 'monaco-editor'
import './index.css'
import App from './App.tsx'

// Bundle Monaco with the app so production does not depend on cross-origin CDN assets.
loader.config({ monaco })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
