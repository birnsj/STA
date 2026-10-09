import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
// The tactical HUD, shared by combat and exploration. Loaded here rather than from a screen so it always sits between
// styles.css and components/exploration/exploration.css, which overrides parts of it.
import './components/combat/combat.css'
import App from './App.jsx'

// Right click belongs to the game (camera drag, commands), so the browser's context menu never opens, anywhere.
window.addEventListener('contextmenu', (event) => event.preventDefault())

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
