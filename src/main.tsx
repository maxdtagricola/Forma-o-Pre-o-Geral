import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { aplicarTema, getTema } from './theme'
import './index.css'

// aplica o tema salvo antes do primeiro render, pra não piscar o tema errado
aplicarTema(getTema())

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
