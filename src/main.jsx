import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.jsx';
import { applyThemePreference, getStoredThemePreference } from './hooks.js';
import './styles.css';

applyThemePreference(getStoredThemePreference());

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
