import http from 'node:http';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createApp,hash} from '../server/app.mjs';

const require=createRequire(import.meta.url);
const engines=require(process.env.PLAYWRIGHT_PATH||'playwright');
const setupToken='qa-private-setup-token',password='QA owner password 12345',storageKey='avsargo.ownerSetup';
let passed=0;

async function fixture(){
 let app,state=null,origin;const requests=[];
 const server=http.createServer(async(req,res)=>{
  try{
   const parts=[];for await(const chunk of req)parts.push(chunk);
   const options={method:req.method,headers:req.headers};
   if(!['GET','HEAD'].includes(req.method))options.body=Buffer.concat(parts);
   requests.push({url:req.url,referer:req.headers.referer||'',setup: req.url==='/api/admin/setup'?JSON.parse(options.body.toString()).token:undefined});
   const response=await app.fetch(new Request(origin+req.url,options));
   res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
  }catch(e){res.writeHead(500);res.end(e.message);}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.address().port;
 app=await createApp({store:{read:async()=>state,write:async value=>{state=structuredClone(value);}},origin,setupHash:hash(setupToken),secureCookies:false});
 return {origin,requests,app,close:()=>new Promise(resolve=>server.close(resolve))};
}
async function setupReady(page,enabled=true){
 await page.waitForFunction(expected=>document.getElementById('auth-form').dataset.setup==='true'&&document.getElementById('sign-in').disabled===!expected,enabled);
 assert.ok(await page.locator('body').evaluate(el=>el.scrollWidth<=innerWidth+1));
}
async function createOwner(page){
 await page.locator('#username').fill('qa_owner');await page.locator('#password').fill(password);
 const response=page.waitForResponse(r=>r.url().endsWith('/api/admin/setup')&&r.request().method()==='POST');
 await page.locator('#sign-in').click();assert.equal((await response).status(),200);
 await page.locator('#dashboard').waitFor({state:'visible'});
 assert.equal(new URL(page.url()).hash,'');
}
async function signIn(page){
 await page.locator('#username').fill('qa_owner');await page.locator('#password').fill(password);await page.locator('#sign-in').click();await page.locator('#dashboard').waitFor({state:'visible'});
}
async function blockedStorage(context){
 await context.addInitScript(()=>Object.defineProperty(window,'sessionStorage',{configurable:true,get(){throw new DOMException('Storage blocked','SecurityError');}}));
}
async function check(browser,engine,name,fn){
 const f=await fixture(),context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 try{
  await fn({f,context,page});assert.deepEqual(errors,[]);
  assert.ok(f.requests.every(r=>!r.url.includes(setupToken)&&!r.referer.includes(setupToken)),'Setup code must stay out of HTTP URLs and referrers');
  passed++;console.log('PASS '+engine+': '+name);
 }finally{await context.close();await f.close();}
}

for(const engine of ['chromium','webkit']){
 const browser=await engines[engine].launch({headless:true});
 try{
  await check(browser,engine,'private link survives refresh; setup, sign-out and sign-in work',async({f,page})=>{
   await page.goto(f.origin+'/admin#setup='+setupToken);await setupReady(page);
   assert.equal(page.url(),f.origin+'/admin');assert.equal(await page.evaluate(key=>sessionStorage.getItem(key),storageKey),setupToken);
   await page.reload();await setupReady(page);await createOwner(page);
   assert.equal(await page.evaluate(key=>sessionStorage.getItem(key),storageKey),null);
   assert.equal(f.app.snapshot().admin.username,'qa_owner');assert.deepEqual(f.requests.filter(r=>r.setup).map(r=>r.setup),[setupToken]);
   await page.locator('#logout').click();await page.waitForFunction(()=>document.getElementById('auth-form').dataset.setup==='false');
   assert.equal(await page.locator('#sign-in').isEnabled(),true);await signIn(page);
  });
  await check(browser,engine,'ordinary admin link accepts a corrected private code and survives refresh',async({f,page})=>{
   await page.goto(f.origin+'/admin');await setupReady(page,false);assert.equal(await page.locator('#setup-code-field').isVisible(),true);
   await page.locator('#auth-form').evaluate(form=>form.dispatchEvent(new Event('submit',{cancelable:true,bubbles:true})));
   assert.equal(f.requests.filter(r=>r.setup!==undefined).length,0);
   await page.locator('#setup-code').fill('wrong-private-code');await page.locator('#username').fill('qa_owner');await page.locator('#password').fill(password);
   const rejected=page.waitForResponse(r=>r.url().endsWith('/api/admin/setup'));await page.locator('#sign-in').click();assert.equal((await rejected).status(),403);
   await page.waitForFunction(()=>!document.getElementById('sign-in').disabled&&document.getElementById('auth-error').textContent.length>0);
   assert.equal(await page.locator('#setup-code-field').isVisible(),true);await page.locator('#setup-code').fill(setupToken);
   await page.reload();await setupReady(page);await createOwner(page);
  });
  await check(browser,engine,'private link survives refresh when browser storage is blocked',async({f,context,page})=>{
   await blockedStorage(context);await page.goto(f.origin+'/admin#setup='+setupToken);await setupReady(page);
   assert.equal(new URL(page.url()).hash,'#setup='+setupToken);await page.reload();await setupReady(page);await createOwner(page);
  });
  await check(browser,engine,'manual setup code survives refresh when browser storage is blocked',async({f,context,page})=>{
   await blockedStorage(context);await page.goto(f.origin+'/admin');await setupReady(page,false);await page.locator('#setup-code').fill(setupToken);
   assert.equal(new URL(page.url()).hash,'#setup='+setupToken);await page.reload();await setupReady(page);await createOwner(page);
  });
  await check(browser,engine,'opening a private link in the already loaded tab enables setup',async({f,page})=>{
   await page.goto(f.origin+'/admin');await setupReady(page,false);await page.evaluate(code=>{window.__qaPageMarker='same-page';location.hash='setup='+code;},setupToken);
   await setupReady(page);assert.equal(await page.evaluate(()=>window.__qaPageMarker),'same-page');assert.equal(new URL(page.url()).hash,'');await createOwner(page);
  });
  await check(browser,engine,'an existing owner sees sign-in and pending setup codes are cleared',async({f,context,page})=>{
   const response=await f.app.fetch(new Request(f.origin+'/api/admin/setup',{method:'POST',headers:{origin:f.origin,'content-type':'application/json'},body:JSON.stringify({token:setupToken,username:'qa_owner',password})}));assert.equal(response.status,200);
   await context.addInitScript(({key,code})=>sessionStorage.setItem(key,code),{key:storageKey,code:setupToken});
   await page.goto(f.origin+'/admin#setup='+setupToken);await page.waitForFunction(()=>document.getElementById('auth-form').dataset.setup==='false');
   assert.equal(await page.locator('#sign-in').isEnabled(),true);assert.equal(await page.locator('#setup-code-field').isVisible(),false);
   assert.equal(await page.evaluate(key=>sessionStorage.getItem(key),storageKey),null);assert.equal(new URL(page.url()).hash,'');await signIn(page);
  });
 }finally{await browser.close();}
}
console.log(passed+' admin setup browser scenarios passed. Only local QA accounts were created.');
