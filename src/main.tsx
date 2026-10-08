import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

// O Safari do iOS ignora `user-scalable=no`; cancelar a pinça trava o zoom da página.
document.addEventListener('gesturestart', (e) => e.preventDefault());

// Sem StrictMode: ele monta duas vezes e reabriria a sala do PeerJS.
createRoot(document.getElementById('root')!).render(<App />);
