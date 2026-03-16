import './monacoWorkers'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import loader from '@monaco-editor/loader'
import * as monaco from 'monaco-editor'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from '@/components/ui/sonner'
import { ThemeProvider } from '@/components/theme-provider'
import './index.css'
import App from './App.tsx'

// Bundle Monaco with the app so production does not depend on cross-origin CDN assets.
loader.config({ monaco })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <TooltipProvider>
        <App />
        <Toaster />
      </TooltipProvider>
    </ThemeProvider>
  </StrictMode>,
)
