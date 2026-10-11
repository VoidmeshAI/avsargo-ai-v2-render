import http from 'node:http';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir} from 'node:fs/promises';
import {createApp,hash} from '../server/app.mjs';
const require=createRequire(import.meta.url),engines=require(process.env.PLAYWRIGHT_PATH||'playwright');
const token='qa-ai-setup-code',key='qa_private_ai_key',password='QA owner password 12345';let passed=0;
const output=new URL('../visual-checks/',import.meta.url);await mkdir(output,{recursive:true});
async function fixture(reject=false){
 let app,state=null,origin;const calls=[];
 const server=http.createServer(async(req,res)=>{try{const chunks=[];for await(const part of req)chunks.push(part);const options={method:req.method,headers:req.headers};if(!['GET','HEAD'].includes(req.method))options.body=Buffer.concat(chunks);const response=await app.fetch(new Request(origin+req.url,options));res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));}catch{res.writeHead(500);res.end('{}');}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.address().port;
 app=await createApp({store:{read:async()=>state,write:async value=>state=structuredClone(value)},origin,setupHash:hash(token),secureCookies:false,fetchImpl:async(url,options)=>{
  calls.push({url,payload:options.body?JSON.parse(options.body):null});
  if(reject)return new Response(JSON.stringify({error:{message:'private provider details '+key}}),{status:429});
  if(url.includes('/v1beta/models?'))return Response.json({models:[{name:'models/gemini-3.8-flash',supportedGenerationMethods:['generateContent']},{name:'models/gemini-3.5-flash-lite',supportedGenerationMethods:['generateContent']}]});
  if(url.includes('/v1/models'))return Response.json({data:[{id:'gpt-image-1'},{id:'gpt-4.1-mini'}]});
  await new Promise(resolve=>setTimeout(resolve,100));
  return Response.json(url.includes('/chat/completions')?{choices:[{message:{content:'OK'}}]}:{candidates:[{content:{parts:[{text:'OK'}]}}]});
 }});
 return {app,origin,calls,close:()=>new Promise(resolve=>server.close(resolve))};
}
async function owner(page,f){await page.goto(f.origin+'/admin#setup='+token);await page.locator('#username').fill('qa_owner');await page.locator('#password').fill(password);await page.waitForFunction(()=>!document.getElementById('sign-in').disabled);await page.locator('#sign-in').click();await page.locator('#dashboard').waitFor({state:'visible'});await page.locator('[data-tab="ai"]').click();await page.waitForFunction(()=>document.getElementById('save-state').textContent==='All changes saved');}
async function save(page){const response=page.waitForResponse(r=>r.url().endsWith('/api/admin/config')&&r.request().method()==='PUT');await page.locator('#save').click();assert.equal((await response).status(),200);await page.waitForFunction(()=>document.getElementById('save-state').textContent==='All changes saved'&&!document.getElementById('save').disabled);}
async function connect(page){const response=page.waitForResponse(r=>r.url().endsWith('/api/admin/ai/test'));await page.locator('#test-ai').click();assert.equal((await response).status(),200);await page.waitForFunction(()=>document.getElementById('connection-status').textContent==='Connected'&&!document.getElementById('test-ai').disabled);}
async function check(browser,engine,name,fn,reject=false){const f=await fixture(reject),context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));try{await owner(page,f);await fn(page,f);assert.deepEqual(errors,[]);assert.ok(await page.locator('body').evaluate(el=>el.scrollWidth<=innerWidth+1));passed++;console.log('PASS '+engine+': '+name);}finally{await context.close();await f.close();}}
for(const engine of ['chromium','webkit']){
 const browser=await engines[engine].launch({headless:true});try{
  await check(browser,engine,'key → save → real Test connection, automatic model and refresh',async(page,f)=>{
   assert.equal(await page.locator('#ai-model').count(),0);assert.equal(await page.locator('#models').count(),0);assert.equal(await page.locator('[id^="remove-"][type="checkbox"]').count(),0);assert.equal(await page.locator('#test-ai').isEnabled(),false);
   await page.locator('#key-geminiKey').fill(key);assert.equal(await page.locator('#test-ai').isEnabled(),false);await save(page);assert.equal(await page.locator('#test-ai').isEnabled(),true);assert.equal(await page.locator('#connection-status').textContent(),'Not tested yet');assert.equal(f.calls.length,0);
   await connect(page);assert.equal(await page.locator('#auto-model').textContent(),'gemini-3.5-flash-lite');assert.equal(f.calls.length,2);assert.equal(f.app.snapshot().config.ai.enabled,true);assert.equal(await page.locator('#key-geminiKey').inputValue(),'');
   await page.screenshot({path:new URL('admin-ai-connected-'+engine+'-phone.png',output).pathname});
   await page.reload();await page.locator('#dashboard').waitFor({state:'visible'});await page.locator('[data-tab="ai"]').click();await page.waitForFunction(()=>document.getElementById('connection-status').textContent==='Connected');
   if(engine==='chromium'){await page.setViewportSize({width:1440,height:980});await page.screenshot({path:new URL('admin-ai-connected-desktop.png',output).pathname});}
  });
  await check(browser,engine,'Remove key uses confirmation, cancel and undo; saving disables the connection',async(page,f)=>{
   await page.locator('#key-geminiKey').fill(key);await save(page);await connect(page);
   await page.locator('#remove-geminiKey').click();await page.locator('#key-dialog').waitFor({state:'visible'});await page.locator('#cancel-remove').click();assert.equal(f.app.snapshot().secrets.geminiKey,key);assert.equal(await page.locator('#state-geminiKey').textContent(),'Saved · value hidden');
   await page.locator('#remove-geminiKey').click();await page.locator('#confirm-remove').click();assert.equal(await page.locator('#key-geminiKey').isDisabled(),true);assert.equal(await page.locator('#test-ai').isEnabled(),false);assert.equal(await page.locator('#remove-geminiKey').textContent(),'Undo removal');
   await page.locator('#remove-geminiKey').click();assert.equal(await page.locator('#key-geminiKey').isDisabled(),false);await save(page);assert.equal(f.app.snapshot().secrets.geminiKey,key);
   await page.locator('#remove-geminiKey').click();await page.locator('#confirm-remove').click();await save(page);assert.equal(f.app.snapshot().secrets.geminiKey,undefined);assert.equal(f.app.snapshot().config.ai.enabled,false);assert.equal(await page.locator('#remove-geminiKey').isVisible(),false);assert.equal(await page.locator('#test-ai').isEnabled(),false);
  });
  await check(browser,engine,'provider changes show only its key and require save before testing',async(page,f)=>{
   await page.locator('#key-geminiKey').fill(key);await save(page);await connect(page);
   await page.locator('#ai-provider').selectOption('openai');assert.equal(await page.locator('#wrap-geminiKey').isVisible(),false);assert.equal(await page.locator('#wrap-openaiKey').isVisible(),true);assert.equal(await page.locator('#test-ai').isEnabled(),false);
   await page.locator('#key-openaiKey').fill('qa_openai_key');await save(page);assert.equal(await page.locator('#connection-status').textContent(),'Not tested yet');await connect(page);assert.equal(await page.locator('#auto-model').textContent(),'gpt-4.1-mini');assert.equal(f.app.snapshot().secrets.geminiKey,key);
  });
  await check(browser,engine,'a provider error remains failed and gives a visible actionable reason',async(page,f)=>{
   await page.locator('#key-geminiKey').fill(key);await save(page);const response=page.waitForResponse(r=>r.url().endsWith('/api/admin/ai/test'));await page.locator('#test-ai').click();assert.equal((await response).status(),503);await page.waitForFunction(()=>document.getElementById('connection-status').textContent==='Test failed'&&!document.getElementById('test-ai').disabled);
   assert.match(await page.locator('#test-result').textContent(),/quota or credits/);assert.ok(!(await page.locator('#test-result').textContent()).includes(key));assert.equal(f.app.snapshot().config.ai.enabled,false);await page.screenshot({path:new URL('admin-ai-failed-'+engine+'-phone.png',output).pathname});
  },true);
 }finally{await browser.close();}
}
console.log(passed+' AI admin browser scenarios passed with local QA keys and simulated providers.');
