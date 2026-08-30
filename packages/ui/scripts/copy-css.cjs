// Copies the design-token stylesheet into dist so `@kavriqo/ui/tokens.css`
// resolves for consumers.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const src = path.join(__dirname, '..', 'src', 'tokens.css');
const outDir = path.join(__dirname, '..', 'dist');
fs.mkdirSync(outDir, { recursive: true });
fs.copyFileSync(src, path.join(outDir, 'tokens.css'));
console.log('tokens.css copied to dist');
