import React from 'react';
import { createRoot } from 'react-dom/client';
import YimaruCRM from './YimaruCRM';

const root = createRoot(document.getElementById('root')!);
root.render(
  <React.StrictMode>
    <YimaruCRM />
  </React.StrictMode>
);
