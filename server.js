import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {createFoliageService} from './lib/foliage-service.js';
const service = createFoliageService();
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'};
const files = {'/':'index.html','/index.html':'index.html','/app.js':'app.js','/style.css':'style.css','/spots.js':'spots.js','/foliage-feed.js':'foliage-feed.js'};
http.createServer(async(req,res)=>{
  try {
    if (!['GET','HEAD'].includes(req.method)) {res.writeHead(405,{'Allow':'GET, HEAD'});res.end();return;}
    const path = new URL(req.url,'http://localhost').pathname;
    res.setHeader('X-Content-Type-Options','nosniff');
    if (path === '/data/foliage.json') {
      res.setHeader('Content-Type','application/json; charset=utf-8');
      res.setHeader('Cache-Control','no-store');
      const feed = await service.get();res.end(req.method==='HEAD'?undefined:JSON.stringify(feed));return;
    }
    const file = files[path];
    if(!file){res.writeHead(404);res.end('Not found');return;}
    const body = await readFile(new URL('./public/'+file,import.meta.url));
    res.setHeader('Content-Type',types[file.slice(file.lastIndexOf('.'))]);
    res.end(req.method==='HEAD'?undefined:body);
  } catch {res.writeHead(500);res.end('Server error');}
}).listen(Number(process.env.PORT)||3000,'0.0.0.0',()=>console.log('Kyoto itinerary server ready'));
