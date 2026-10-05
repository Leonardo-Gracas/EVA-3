import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

// Sem StrictMode: ele monta duas vezes e reabriria a sala do PeerJS.
createRoot(document.getElementById('root')!).render(<App />);
