import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
// The tactical HUD, shared by combat and exploration. Loaded here rather than from a screen so it always sits between
// styles.css and components/exploration/exploration.css, which overrides parts of it.
import './components/combat/combat.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
