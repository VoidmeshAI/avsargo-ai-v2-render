import {randomBytes,timingSafeEqual} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {official,publicResource,cleanProfile,fileMatches} from './guards.mjs';
const agentSource=readFileSync(new URL('./form-agent.js',import.meta.url),'utf8');
const evaluateAgent=new Function('data','return ('+agentSource+')(data.mode,data.payload);');
const fail=(status,message)=>{throw Object.assign(Error(message),{status});};
export class BrowserSessions{
 constructor(chromium,{max=2,idleMs=180000,lifetimeMs=1800000,clock=Date.now}={}){Object.assign(this,{chromium,max,idleMs,lifetimeMs,clock});this.sessions=new Map();this.pending=0;this.cleanup=setInterval(()=>this.expire(),30000);this.cleanup.unref();}
 async expire(){const now=this.clock();for(const s of this.sessions.values())if(now-s.touched>this.idleMs||now-s.created>this.lifetimeMs)await this.destroy(s);}
 async destroy(s){this.sessions.delete(s.id);s.profile=null;s.documents=[];await s.browser.close().catch(()=>{});}
 get(owner,id){const s=this.sessions.get(id);if(!s||s.owner!==owner)fail(404,'Application session ended. Reopen your form.');if(this.clock()-s.touched>this.idleMs||this.clock()-s.created>this.lifetimeMs){this.destroy(s);fail(410,'Application session expired. Reopen your form.');}s.touched=this.clock();return s;}
 async run(owner,id,fn){const s=this.get(owner,id);const operation=s.queue.then(()=>fn(s));s.queue=operation.catch(()=>{});return operation;}
 async start(owner,input,{fixture}={}){
  if(!/^[a-f0-9]{64}$/.test(owner))fail(400,'Invalid workspace');
  if(!fixture&&!official(input.url))fail(400,'Choose a verified official application.');
  const existing=[...this.sessions.values()].find(s=>s.owner===owner);if(existing)await this.destroy(existing);
  await this.expire();if(this.sessions.size+this.pending>=this.max)fail(503,'Application browsers are busy. Please try again shortly.');
  this.pending++;let browser,s;
  try{
   browser=await this.chromium.launch({headless:true,chromiumSandbox:true,args:['--disable-dev-shm-usage','--disable-background-networking','--disable-extensions','--disable-component-update']});
   const width=Math.max(360,Math.min(1440,Number(input.width)||1040)),height=Math.max(500,Math.min(1000,Number(input.height)||760));
   const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1,acceptDownloads:false,serviceWorkers:'block',locale:'en-IN'});
   context.setDefaultTimeout(7000);context.setDefaultNavigationTimeout(45000);
   await context.route('**/*',async route=>{const request=route.request(),url=request.url();if(fixture&&url==='https://avsargo-selfcheck.invalid/'){await route.fulfill({contentType:'text/html',body:fixture});return;}if(!await publicResource(url)||request.isNavigationRequest()&&!request.frame().parentFrame()&&!official(url)){await route.abort('blockedbyclient');return;}await route.continue();});
   if(context.routeWebSocket)await context.routeWebSocket('**/*',socket=>socket.close());
   const page=await context.newPage();
   s={id:randomBytes(24).toString('base64url'),owner,browser,context,page,width,height,created:this.clock(),touched:this.clock(),queue:Promise.resolve(),profile:cleanProfile(input.profile,input.meta),documents:Array.isArray(input.documents)?input.documents.slice(0,15):[],enabled:input.consent===true,lastFilled:'',filledCount:0,attachedCount:0,mapped:new Set()};
   context.on('page',p=>{p.on('dialog',dialog=>dialog.dismiss().catch(()=>{}));if(p!==s.page)s.page=p;});page.on('dialog',dialog=>dialog.dismiss().catch(()=>{}));
   await page.goto(fixture?'https://avsargo-selfcheck.invalid/':input.url,{waitUntil:'domcontentloaded'}).catch(e=>{if(page.url()==='about:blank')throw e;});
   this.sessions.set(s.id,s);return await this.frame(owner,s.id);
  }catch(e){if(!browser)console.error('Browser engine launch failed:',e.message.slice(0,1500));if(s)this.sessions.delete(s.id);await browser?.close().catch(()=>{});if(e.status)throw e;fail(503,'The application browser could not start. Please try again.');}finally{this.pending--;}
 }
 async scan(s){if(s.page.isClosed())fail(410,'This application window has closed. Reopen your form.');return s.page.evaluate(evaluateAgent,{mode:'scan'});}
 async tick(s){
  const scan=await this.scan(s);if(s.enabled&&s.profile&&scan.signature!==s.lastFilled&&!scan.flags.login&&!scan.flags.payment){const r=await s.page.evaluate(evaluateAgent,{mode:'fill',payload:{signature:scan.signature,fields:s.profile.fields,meta:s.profile.meta}});s.lastFilled=scan.signature;s.filledCount+=r.filled?.length||0;}
  return this.scan(s);
 }
 async frame(owner,id){return this.run(owner,id,async s=>{
  const scan=await this.tick(s),focus=await s.page.evaluate(()=>{const e=document.activeElement;if(!e)return {};const editable=['INPUT','TEXTAREA'].includes(e.tagName)&&e.type!=='file'&&!e.disabled;const secure=e.type==='password'||/otp|one.?time|captcha|cvv|security.?code|pin/i.test([e.name,e.id,e.autocomplete].join(' '));const options=e.tagName==='SELECT'?[...e.options].filter(o=>!o.disabled).slice(0,100).map(o=>({label:o.textContent.slice(0,100),value:o.value})):[];return {editable,secure,options};});
  const image=await s.page.screenshot({type:'jpeg',quality:65,timeout:10000});
  const url=new URL(s.page.url());const safeUrl=url.origin+url.pathname;
  return {ok:true,sessionId:id,image:'data:image/jpeg;base64,'+image.toString('base64'),width:s.width,height:s.height,url:safeUrl,title:(await s.page.title()).slice(0,150),filledCount:s.filledCount,attachedCount:s.attachedCount,enabled:s.enabled,flags:scan.flags,focus,signature:scan.signature,candidates:scan.candidates,uploads:scan.uploads,expiresIn:Math.max(0,Math.floor((this.lifetimeMs-(this.clock()-s.created))/1000))};
 });}
 async action(owner,id,input){
  await this.run(owner,id,async s=>{const page=s.page;switch(input.action){
   case 'click':{const x=Number(input.x),y=Number(input.y);if(!Number.isFinite(x)||!Number.isFinite(y)||x<0||y<0||x>s.width||y>s.height)fail(400,'Invalid pointer');await page.mouse.click(x,y);break;}
   case 'scroll':{const dy=Math.max(-1500,Math.min(1500,Number(input.dy)||0));await page.mouse.wheel(0,dy);break;}
   case 'text':{if(typeof input.text!=='string'||input.text.length>2000)fail(400,'Keep this entry shorter.');await page.keyboard.insertText(input.text);break;}
   case 'key':{if(!['Enter','Tab','Backspace','Escape','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','ControlOrMeta+A'].includes(input.key))fail(400,'Unsupported key');await page.keyboard.press(input.key);break;}
   case 'select':{if(typeof input.value!=='string'||input.value.length>300)fail(400,'Invalid option');await page.locator('select:focus').selectOption(input.value);break;}
   case 'back':await page.goBack({waitUntil:'domcontentloaded'}).catch(()=>{});break;
   case 'reload':await page.reload({waitUntil:'domcontentloaded'});break;
   case 'pause':s.enabled=false;break;
   case 'resume':s.enabled=true;s.lastFilled='';break;
   case 'update':s.profile=cleanProfile(input.profile,input.meta);s.documents=Array.isArray(input.documents)?input.documents.slice(0,15):[];s.enabled=input.consent===true;s.lastFilled='';break;
   case 'map':{const scan=await this.scan(s);if(scan.signature!==input.signature)break;const mappings={};for(const m of Array.isArray(input.mappings)?input.mappings.slice(0,100):[]){if(scan.candidates.some(f=>f.fieldId===m.fieldId)&&Object.hasOwn(s.profile.fields,m.key))mappings[m.fieldId]=m.key;}const r=await page.evaluate(evaluateAgent,{mode:'fill',payload:{signature:scan.signature,fields:s.profile.fields,meta:s.profile.meta,mappings}});s.filledCount+=r.filled?.length||0;break;}
   case 'custom':{const scan=await this.scan(s);if(scan.signature!==input.signature)fail(409,'This form step changed. Review the current fields.');const custom={};for(const [key,value]of Object.entries(input.values||{})){if(scan.candidates.some(f=>f.fieldId===key)&&typeof value==='string'&&value.length<=700)custom[key]=value;}const r=await page.evaluate(evaluateAgent,{mode:'fill',payload:{signature:scan.signature,fields:{},custom}});s.filledCount+=r.filled?.length||0;break;}
   default:fail(400,'Unsupported browser action');
  }});return this.frame(owner,id);
 }
 async upload(owner,id,input){await this.run(owner,id,async s=>{
  if(!s.enabled)fail(403,'Autofill is paused.');const scan=await this.scan(s);if(scan.signature!==input.signature)fail(409,'The form step changed.');const upload=scan.uploads.find(u=>u.fieldId===input.fieldId),file=s.documents.find(d=>d.id===input.documentId);if(!upload||!file||!fileMatches(file,upload,s.documents,scan.uploads))fail(400,'Choose one matching saved document.');
  if(typeof input.data!=='string'||input.data.length>11200000||!/^[-A-Za-z0-9+/]+={0,2}$/.test(input.data))fail(413,'Document exceeds the upload limit.');const bytes=Buffer.from(input.data,'base64');if(bytes.length>8*1024*1024||!bytes.length)fail(413,'Document exceeds the upload limit.');
  const magic=file.mime==='application/pdf'?bytes.subarray(0,5).toString()==='%PDF-':file.mime==='image/jpeg'?bytes[0]===255&&bytes[1]===216:file.mime==='image/png'&&bytes[0]===137&&bytes[1]===80;if(!magic)fail(400,'Saved document content is invalid.');
  const check=await s.page.evaluate(evaluateAgent,{mode:'uploadFocus',payload:{signature:scan.signature,fieldId:input.fieldId}});if(!check.ok||!check.focusedFile)fail(409,'Upload field is not available on this step.');await s.page.locator('input[type=file]:focus').setInputFiles({name:file.name,mimeType:file.mime,buffer:bytes});s.attachedCount++;
 });return this.frame(owner,id);}
 async close(owner,id){const s=this.get(owner,id);await s.queue;await this.destroy(s);return {ok:true};}
 async shutdown(){clearInterval(this.cleanup);await Promise.all([...this.sessions.values()].map(s=>this.destroy(s)));}
}
export function authorised(header,token){const value=Buffer.from(String(header||'').replace(/^Bearer /,'')),expected=Buffer.from(token);return expected.length>=40&&value.length===expected.length&&timingSafeEqual(value,expected);}
