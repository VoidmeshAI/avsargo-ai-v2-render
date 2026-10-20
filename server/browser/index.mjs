import http from 'node:http';
import {chromium,firefox} from 'playwright';
import {BrowserSessions,authorised} from './engine.mjs';
import {selfTest} from './self-test.mjs';
export async function startBrowserService(token){
if(token.length<40)throw Error('Browser service token is required');
let compatibleEngine=chromium;
const browserEnvironment={PATH:process.env.PATH,HOME:'/home/pwuser',LANG:'en_US.UTF-8'};
const browserLauncher={async launch(options){if(compatibleEngine===firefox)return firefox.launch({headless:true,env:browserEnvironment});try{return await chromium.launch({...options,env:browserEnvironment});}catch(error){console.error('Chromium launch unavailable:',error.message.split('\n').filter(line=>/sandbox|Permission|denied|FATAL|namespace/i.test(line)).map(line=>line.slice(0,250)).slice(-4).join(' '));compatibleEngine=firefox;return firefox.launch({headless:true,env:browserEnvironment});}}};
const engine=new BrowserSessions(browserLauncher,{max:1});
let ready=false,result,failed=false;
const server=http.createServer(async(req,res)=>{
 const answer=(status,data)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(data));};
 if(!authorised(req.headers.authorization,token)){answer(401,{error:'Service authentication required'});return;}
 if(req.url==='/health'){answer(200,{ready,state:failed?'unavailable':result?'ready':'starting',selfTest:result?{passed:result.passed,performance:result.performance}:null});return;}
 if(!ready){answer(503,{error:'Application browser is starting.'});return;}
 try{
  if(req.method!=='POST')throw Object.assign(Error('Method not allowed'),{status:405});
  let bytes=0,parts=[];for await(const chunk of req){bytes+=chunk.length;if(bytes>12000000)throw Object.assign(Error('Request too large'),{status:413});parts.push(chunk);}
  let data;try{data=JSON.parse(Buffer.concat(parts).toString());}catch{throw Object.assign(Error('Invalid request'),{status:400});}
  if(!/^[a-f0-9]{64}$/.test(data.owner||''))throw Object.assign(Error('Invalid workspace'),{status:400});
  let output;switch(req.url){case '/v1/start':output=await engine.start(data.owner,data);break;case '/v1/frame':output=await engine.frame(data.owner,data.sessionId,data);break;case '/v1/action':output=await engine.action(data.owner,data.sessionId,data);break;case '/v1/upload':output=await engine.upload(data.owner,data.sessionId,data);break;case '/v1/close':output=await engine.close(data.owner,data.sessionId);break;default:throw Object.assign(Error('Not found'),{status:404});}answer(200,output);
 }catch(e){if(!e.status)console.error(JSON.stringify({event:'browser_operation_error',operation:req.url,kind:e.name,message:String(e.message||'').replace(/https?:\/\/\S+/g,'[url]').split('\n')[0].slice(0,250)}));answer(e.status||503,{error:e.status?e.message:'The form is still loading or unavailable. Please try again.'});}
});
server.requestTimeout=90000;server.headersTimeout=15000;
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(3001,'127.0.0.1',resolve);});
// Browser readiness is independent from chat/admin health.
selfTest(engine).then(r=>{result=r;ready=true;console.log(JSON.stringify({event:'browser_self_test',passed:r.passed,performance:r.performance}));}).catch(async e=>{console.error('Browser self-test failed:',e.message);result=null;failed=true;await engine.shutdown();});
return {close:()=>new Promise(resolve=>server.close(async()=>{await engine.shutdown();resolve();}))};
}

