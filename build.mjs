import * as esbuild from 'esbuild';
import fs from 'fs';
fs.mkdirSync('www', { recursive: true });
await esbuild.build({ entryPoints: ['src/main.js'], bundle: true, format: 'esm', target: ['chrome90'], outfile: 'www/app.js', minify: true, logLevel: 'warning' });
for (const f of ['index.html', 'app.css']) fs.copyFileSync('src/' + f, 'www/' + f);
fs.copyFileSync('node_modules/pdfjs-dist/build/pdf.worker.min.mjs', 'www/pdf.worker.min.js');
console.log('built', fs.statSync('www/app.js').size);
