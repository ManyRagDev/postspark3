import fs from 'node:fs/promises';
import path from 'node:path';
import {compile} from 'tailwindcss';
const directory='artifacts/acervo82/full/source-view';
await fs.mkdir(directory,{recursive:true});
let html=await fs.readFile('designs/acervo82/sources/showcase-original.html','utf8');
const classes=Array.from(html.matchAll(/class=["']([^"']+)["']/g)).flatMap(m=>m[1].split(/\s+/));
const css=await compile((await fs.readFile('node_modules/tailwindcss/theme.css','utf8'))+'\n'+(await fs.readFile('node_modules/tailwindcss/preflight.css','utf8'))+'\n@tailwind utilities;');
let style=css.build(classes);
const fonts=JSON.parse(await fs.readFile('designs/acervo82/authored/font-manifest.json','utf8'));
for(const f of fonts){const bytes=await fs.readFile(path.join('designs/acervo82/authored/fonts',f.file));style+=`\n@font-face{font-family:'${f.family}';font-style:normal;font-weight:${f.variable?'100 900':f.weight};src:url('data:${f.mimeType};base64,${bytes.toString('base64')}');}`;}
html=html.replace(/<script[\s\S]*?<\/script>/g,'').replace(/@import\s+url\([^)]*\)\s*;/g,'').replace('</head>',`<style>${style}\nsection{display:block!important}*{animation:none!important;transition:none!important}</style></head>`).replace(/src="assets\/([^"]+)"/g,'src="/assets/$1"');
await fs.writeFile(path.join(directory,'index.html'),html);await fs.cp('designs/acervo82/sources/assets',path.join(directory,'assets'),{recursive:true});
console.log(JSON.stringify({directory,fonts:fonts.length,externalCalls:0}));
