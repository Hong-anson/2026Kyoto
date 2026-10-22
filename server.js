import http from 'node:http';
import {readFile} from 'node:fs/promises';
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'};
http.createServer(async(req,res)=>{try { const path=new URL(req.url,'http://localhost').pathname; const files={'/':'index.html','/app.js':'app.js','/style.css':'style.css'}; if(!files[path]){res.writeHead(404);res.end('Not found');return;} const file=files[path];res.setHeader('Content-Type',types[file.slice(file.lastIndexOf('.'))]);res.setHeader('X-Content-Type-Options','nosniff');res.end(await readFile(new URL('./public/'+file,import.meta.url)));}catch{res.writeHead(500);res.end('Server error');}}).listen(Number(process.env.PORT)||3000,'0.0.0.0',()=>console.log('Kyoto itinerary server ready'));
