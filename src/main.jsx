import React from 'react';
import { createRoot } from 'react-dom/client';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';
import './styles.css';
import TarjetasTool from './tarjetas/TarjetasTool.jsx';
import TalonariosTool from './talonarios/TalonariosTool.jsx';
import { SuiteLayout } from './shell/Shell.jsx';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

// Herramientas nativas de la suite; el resto se muestra embebido (ver src/shell/tools.js).
function renderTool(tool) {
  if (tool.id === 'talonarios') return <TalonariosTool tool={tool} />;
  if (tool.id === 'tarjetas') return <TarjetasTool tool={tool} />;
  return null;
}

createRoot(document.getElementById('root')).render(<SuiteLayout renderTool={renderTool} />);
