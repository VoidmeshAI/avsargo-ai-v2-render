import {randomBytes,timingSafeEqual} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {official,cleanProfile,fileMatches} from './guards.mjs';
import {inspectView,capturePlan,jpegSize,documentPointer} from './view.mjs';
import {portalRoute} from './network.mjs';
import {openPortal} from './navigation.mjs';
const agentSource=readFileSync(new URL('./form-agent.js',import.meta.url),'utf8');
const evaluateAgent=new Function('data','return ('+agentSource+')(data.mode,data.payload);');
const fail=(status,message)=>{throw Object.assign(Error(message),{status});};
export class BrowserSessions{
 constructor(chromium,{max=2,idleMs=180000,lifetimeMs=1800000,clock=Date.now}={}){Object.assign(this,{chromium,max,idleMs,lifetimeMs,clock});this.sessions=new Map();this.starting=new Set();this.pending=0;this.cleanup=setInterval(()=>this.expire(),30000);this.cleanup.unref();}
 async expire(){const now=this.clock();for(const s of this.sessions.values())if(now-s.touched>this.idleMs||now-s.created>this.lifetimeMs)await this.destroy(s);}
 async destroy(s){this.sessions.delete(s.id);s.profile=null;s.documents=[];s.cachedImage=null;s.scanCache=null;s.captureHistory?.clear();await s.browser.close().catch(()=>{});}
 get(owner,id){const s=this.sessions.get(id);if(!s||s.owner!==owner)fail(404,'Application session ended. Reopen your form.');if(this.clock()-s.touched>this.idleMs||this.clock()-s.created>this.lifetimeMs){this.destroy(s);fail(410,'Application session expired. Reopen your form.');}s.touched=this.clock();return s;}
 async run(owner,id,fn){const s=this.get(owner,id);const operation=s.queue.then(()=>fn(s));s.queue=operation.catch(()=>{});return operation;}
 async start(owner,input,{fixture}={}){
  if(!/^[a-f0-9]{64}$/.test(owner))fail(400,'Invalid workspace');
  if(!fixture&&!official(input.url))fail(400,'Choose a verified official application.');
  if(this.starting.has(owner))fail(409,'Your application is already opening.');
  const existing=[...this.sessions.values()].find(s=>s.owner===owner);if(existing)await this.destroy(existing);
  await this.expire();if(this.sessions.size+this.pending>=this.max)fail(503,'Application browsers are busy. Please try again shortly.');
  this.pending++;this.starting.add(owner);let browser,s;
  try{
   browser=await this.chromium.launch({headless:true,chromiumSandbox:true,args:['--disable-dev-shm-usage','--disable-background-networking','--disable-extensions','--disable-component-update']});
   const width=Math.max(360,Math.min(1440,Number(input.width)||1040)),height=Math.max(500,Math.min(1000,Number(input.height)||760));
   const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1,acceptDownloads:false,serviceWorkers:'block',locale:'en-IN'});
   context.setDefaultTimeout(7000);context.setDefaultNavigationTimeout(45000);
   await context.route('**/*',portalRoute({fixture,report:event=>console.error(JSON.stringify(event))}));
   if(context.routeWebSocket)await context.routeWebSocket('**/*',socket=>socket.close());
   const page=await context.newPage();
   s={id:randomBytes(24).toString('base64url'),owner,browser,context,page,width,height,created:this.clock(),touched:this.clock(),queue:Promise.resolve(),profile:cleanProfile(input.profile,input.meta),documents:Array.isArray(input.documents)?input.documents.slice(0,15):[],enabled:input.consent===true,lastFilled:'',filledCount:0,attachedCount:0,mapped:new Set(),documentView:input.viewMode==='document',imageRevision:0,visualDirty:true,forceScan:true};
   const watch=p=>{p.on('dialog',dialog=>dialog.dismiss().catch(()=>{}));p.on('domcontentloaded',()=>{if(!p.isClosed()&&(fixture||official(p.url())))s.page=p;});p.on('close',()=>{if(s.page===p){const pages=context.pages().filter(item=>!item.isClosed()&&(fixture||official(item.url())));if(pages.length)s.page=pages.at(-1);}});};context.on('page',watch);watch(page);
   await openPortal(page,fixture?'https://avsargo-selfcheck.invalid/':input.url);
   this.sessions.set(s.id,s);return await this.frame(owner,s.id);
  }catch(e){console.error(JSON.stringify({event:'browser_start_error',kind:e.name,message:String(e.message||'').replace(/https?:\/\/\S+/g,'[url]').split('\n')[0].slice(0,250)}));if(s)this.sessions.delete(s.id);await browser?.close().catch(()=>{});if(e.status)throw e;fail(503,'The application browser could not start. Please try again.');}finally{this.pending--;this.starting.delete(owner);}
 }
 active(s){if(!s.page.isClosed())return s.page;const pages=s.context.pages().filter(p=>!p.isClosed()&&official(p.url()));if(!pages.length)fail(410,'The portal closed this window. Reopen your form.');s.page=pages.at(-1);return s.page;}
 async scan(s){return this.active(s).evaluate(evaluateAgent,{mode:'scan'});}
 async tick(s){
  const scan=await this.scan(s);if(s.enabled&&s.profile&&scan.signature!==s.lastFilled&&!scan.flags.login&&!scan.flags.payment){const r=await s.page.evaluate(evaluateAgent,{mode:'fill',payload:{signature:scan.signature,fields:s.profile.fields,meta:s.profile.meta}});s.lastFilled=scan.signature;s.filledCount+=r.filled?.length||0;if(r.filled?.length){s.visualDirty=true;return this.scan(s);}}
  return scan;
 }
 async frame(owner,id,input={}){return this.run(owner,id,s=>this.snapshot(s,input));}
 async snapshot(s,input={}){
  const page=this.active(s),now=this.clock();let view=await page.evaluate(inspectView);
  const key=page.url()+'|'+view.key,changed=s.viewKey!==key||s.scanRevision!==view.revision;
  if(!s.scanCache||changed||s.forceScan||now-(s.scannedAt||0)>=2000){s.scanCache=await this.tick(s);view=await page.evaluate(inspectView);s.scanRevision=view.revision;s.scannedAt=now;s.forceScan=false;}
  const scan=s.scanCache,plan=capturePlan(view,s,s.documentView),ttl=plan.mode==='document'?8000:scan.flags.captcha?1500:5000,visualRevision=view.visualRevision??view.revision,formKey=scan.signature+'|'+JSON.stringify(scan.flags);
  if(!s.cachedImage||s.visualDirty||s.viewKey!==key||s.imageVisualRevision!==visualRevision||s.imageFormKey!==formKey||s.capture?.mode!==plan.mode||s.capture?.width!==plan.width||s.capture?.height!==plan.height||plan.mode==='viewport'&&(s.imageScrollX!==view.scrollX||s.imageScrollY!==view.scrollY)||now-(s.capturedAt||0)>=ttl){
   // Default caret hiding mutates every input's style and invalidates the DOM cache.
   let image=await page.screenshot({type:'jpeg',quality:65,timeout:10000,fullPage:plan.mode==='document',caret:'initial'}),size=jpegSize(image,plan);
   if(plan.mode==='document'&&(size.height>12000||size.width>1440||size.width*size.height>6000000)){plan.mode='viewport';image=await page.screenshot({type:'jpeg',quality:65,timeout:10000,caret:'initial'});size=jpegSize(image,s);}
   const encoded='data:image/jpeg;base64,'+image.toString('base64'),identical=s.cachedImage===encoded&&s.viewKey===key&&s.imageFormKey===formKey&&s.capture?.mode===plan.mode;
   s.cachedImage=encoded;if(!identical)s.imageRevision=(s.imageRevision||0)+1;s.capture={mode:plan.mode,width:size.width,height:size.height,revision:s.imageRevision};s.capturedAt=now;s.imageVisualRevision=visualRevision;s.imageFormKey=formKey;s.imageScrollX=view.scrollX;s.imageScrollY=view.scrollY;s.visualDirty=false;
   s.captureHistory||=new Map();s.captureHistory.set(s.imageRevision,{capture:s.capture,key,visualRevision});while(s.captureHistory.size>4)s.captureHistory.delete(s.captureHistory.keys().next().value);
  }
  s.viewKey=key;
  const url=new URL(page.url());const safeUrl=url.origin+url.pathname;
  const unchanged=input.since===s.imageRevision;
  return {ok:true,sessionId:s.id,...(unchanged?{}:{image:s.cachedImage}),unchanged,frameRevision:s.imageRevision,capture:s.capture,width:s.width,height:s.height,scrollX:view.scrollX,scrollY:view.scrollY,url:safeUrl,title:view.title||'Official application',filledCount:s.filledCount,attachedCount:s.attachedCount,enabled:s.enabled,flags:scan.flags,focus:view.focus,signature:scan.signature,candidates:scan.candidates,uploads:scan.uploads,expiresIn:Math.max(0,Math.floor((this.lifetimeMs-(this.clock()-s.created))/1000))};
 }
 async action(owner,id,input){
  return this.run(owner,id,async s=>{const page=this.active(s);switch(input.action){
   case 'click':{let x=Number(input.x),y=Number(input.y);if(input.coordinateSpace==='document'){
    const displayed=s.captureHistory?.get(input.frameRevision),point=documentPointer(input,displayed?.capture,displayed?.capture.revision),current=await page.evaluate(inspectView);
    if(displayed.key!==page.url()+'|'+current.key||displayed.visualRevision!==(current.visualRevision??current.revision)){s.visualDirty=true;fail(409,'This form view changed. Tap again on the refreshed page.');}
    const offset=await page.evaluate(({x,y,width,height})=>{window.scrollTo({left:Math.max(0,x-width/2),top:Math.max(0,y-height/2),behavior:'instant'});return {x:window.scrollX,y:window.scrollY};},{...point,width:s.width,height:s.height});x=point.x-offset.x;y=point.y-offset.y;
   }if(!Number.isFinite(x)||!Number.isFinite(y)||x<0||y<0||x>s.width||y>s.height)fail(400,'Invalid pointer');await page.mouse.click(x,y);break;}
   case 'scroll':{const dy=Math.max(-1500,Math.min(1500,Number(input.dy)||0)),dx=Math.max(-1500,Math.min(1500,Number(input.dx)||0));const scrolled=await page.evaluate(({dx,dy})=>{const root=document.scrollingElement;if(!root||root.scrollHeight<=window.innerHeight+2)return false;window.scrollBy({left:dx,top:dy,behavior:'instant'});return true;},{dx,dy});if(!scrolled){await page.mouse.wheel(dx,dy);await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));}break;}
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
  }s.forceScan=true;s.visualDirty=true;return this.snapshot(s);});
 }
 async upload(owner,id,input){return this.run(owner,id,async s=>{
  if(!s.enabled)fail(403,'Autofill is paused.');const scan=await this.scan(s);if(scan.signature!==input.signature)fail(409,'The form step changed.');const upload=scan.uploads.find(u=>u.fieldId===input.fieldId),file=s.documents.find(d=>d.id===input.documentId);if(!upload||!file||input.manual!==true&&!fileMatches(file,upload,s.documents,scan.uploads))fail(400,'Choose one matching saved document.');
  if(input.manual===true&&upload.accept&&!upload.accept.split(',').some(a=>{a=a.trim().toLowerCase();return a===file.mime||a==='image/*'&&file.mime.startsWith('image/')||a.startsWith('.')&&file.name.toLowerCase().endsWith(a);}))fail(400,'Choose a document type accepted by this upload field.');
  if(typeof input.data!=='string'||input.data.length>11200000||!/^[-A-Za-z0-9+/]+={0,2}$/.test(input.data))fail(413,'Document exceeds the upload limit.');const bytes=Buffer.from(input.data,'base64');if(bytes.length>8*1024*1024||!bytes.length)fail(413,'Document exceeds the upload limit.');
  const magic=file.mime==='application/pdf'?bytes.subarray(0,5).toString()==='%PDF-':file.mime==='image/jpeg'?bytes[0]===255&&bytes[1]===216:file.mime==='image/png'&&bytes[0]===137&&bytes[1]===80;if(!magic)fail(400,'Saved document content is invalid.');
  const check=await s.page.evaluate(evaluateAgent,{mode:'uploadFocus',payload:{signature:scan.signature,fieldId:input.fieldId}});if(!check.ok||!check.focusedFile)fail(409,'Upload field is not available on this step.');await s.page.locator('input[type=file]:focus').setInputFiles({name:file.name,mimeType:file.mime,buffer:bytes});s.attachedCount++;s.forceScan=true;s.visualDirty=true;return this.snapshot(s);
 });}
 async close(owner,id){const s=this.get(owner,id);await s.queue;await this.destroy(s);return {ok:true};}
 async shutdown(){clearInterval(this.cleanup);await Promise.all([...this.sessions.values()].map(s=>this.destroy(s)));}
}
export function authorised(header,token){const value=Buffer.from(String(header||'').replace(/^Bearer /,'')),expected=Buffer.from(token);return expected.length>=40&&value.length===expected.length&&timingSafeEqual(value,expected);}


