import React from 'react';
import { createRoot } from 'react-dom/client';
import 'leaflet/dist/leaflet.css';
import './styles.css';
import App from './App.jsx';

// The static landing block in index.html exists for crawlers / pre-JS paint;
// the live app replaces it.
document.getElementById('static-landing')?.remove();

createRoot(document.getElementById('root')).render(<App />);
