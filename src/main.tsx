import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import loader from '@monaco-editor/loader'
import './index.css'
import App from './App.tsx'

// Use unpkg so Monaco assets (including fonts) resolve; jsdelivr often 404s for font files
loader.config({
  paths: {
    vs: 'https://unpkg.com/monaco-editor@0.55.1/min/vs',
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
