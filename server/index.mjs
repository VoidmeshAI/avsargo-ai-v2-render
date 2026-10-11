import http from 'node:http';
import {createApp} from './app.mjs';
import {postgresStore,sqliteStore} from './store.mjs';
import {mkdirSync} from 'node:fs';
const key=Buffer.from(process.env.CONFIG_ENCRYPTION_KEY||'','base64');
if(key.length!==32||!process.env.PUBLIC_ORIGIN||!process.env.ADMIN_SETUP_HASH)throw new Error('Secure backend environment is incomplete');
const origin=new URL(process.env.PUBLIC_ORIGIN).origin;
if(!origin.startsWith('https://'))throw new Error('PUBLIC_ORIGIN must be HTTPS');
const directory=process.env.DATA_DIR||'/data';
if(!process.env.DATABASE_URL)mkdirSync(directory,{recursive:true,mode:0o700});
const store=process.env.DATABASE_URL?await postgresStore(process.env.DATABASE_URL,key):sqliteStore(directory+'/avsargo-control.db',key);
const app=await createApp({store,origin,setupHash:process.env.ADMIN_SETUP_HASH,setupExpires:Number(process.env.ADMIN_SETUP_EXPIRES_AT),ipSalt:process.env.CONFIG_ENCRYPTION_KEY});
const server=http.createServer(async(req,res)=>{
  try{
    const pathname=new URL(req.url,origin).pathname;
    let size=0,parts=[];for await(const chunk of req){size+=chunk.length;if(size>65536){res.writeHead(413);res.end('Request too large');return;}parts.push(chunk);}
    const headers=new Headers();for(const [k,v]of Object.entries(req.headers))if(v!==undefined)headers.set(k,Array.isArray(v)?v.join(','):v);
    const options={method:req.method,headers};if(!['GET','HEAD'].includes(req.method))options.body=Buffer.concat(parts);
    const response=await app.fetch(new Request(origin+pathname,options));
    res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
  }catch{res.writeHead(500,{'content-type':'application/json'});res.end('{"error":"Service temporarily unavailable"}');}
});
server.requestTimeout=45000;server.headersTimeout=15000;
server.listen(Number(process.env.PORT||3000),'0.0.0.0',()=>console.log('AvsarGo control service ready'));
for(const event of ['SIGINT','SIGTERM'])process.on(event,()=>server.close(async()=>{await app.close();await store.close();process.exit(0);}));
