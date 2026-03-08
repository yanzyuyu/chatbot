import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Suppress ResizeObserver loop error
const resizeObserverLoopErrRe = /^[a-zA-Z0-9\s]*ResizeObserver loop completed with undelivered notifications/;
window.addEventListener('error', (e) => {
  if (resizeObserverLoopErrRe.test(e.message)) {
    e.stopImmediatePropagation();
  }
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
