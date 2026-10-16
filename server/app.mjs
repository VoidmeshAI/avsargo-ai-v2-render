import {randomBytes,createHash,createHmac,timingSafeEqual,scryptSync} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {isIP} from 'node:net';
import {createProviderClient,generateReply,generateSearchReply,testSavedProvider} from './ai-provider.mjs';
import {documentsInput,documentPrompt,documentSchema,parseDocumentResult,mappingInput,mappingPrompt,mappingSchema,mappingSchemaFor,parseMappingResult,workflowContext} from './application-ai.mjs';

import {officialResearch,officialResearchPrompt} from './official-research.mjs';
import {knownApplication,publicCatalog,officialFormUrl,isLiveQuestion,publicQuery,verifySearchSources,searchPrompt} from './application-catalog.mjs';

const random=()=>randomBytes(32).toString('base64url');
export const hash=value=>createHash('sha256').update(value).digest('hex');
const equal=(a,b)=>{const x=Buffer.from(String(a)),y=Buffer.from(String(b));return x.length===y.length&&timingSafeEqual(x,y);};
export const passwordHash=password=>{const salt=randomBytes(16).toString('hex');return salt+':'+scryptSync(password,salt,64).toString('hex');};
const checkPassword=(password,value)=>{try{const [salt,digest]=value.split(':');return equal(scryptSync(password,salt,64).toString('hex'),digest);}catch{return false;}};
const basePrompt='You are AvsarGo, a professional Indian application assistant inside the customer workspace. Answer the latest request directly in natural Hinglish, English or Hindi matching the applicant. Keep ordinary replies to a few useful sentences; give detail when the task or applicant asks for it. A greeting needs only a short greeting and one helpful question. Do not give an introduction, feature catalogue, generic checklist or disclaimer in every reply. Do not redirect customers to a website or Android app: they are already using AvsarGo. Do not mention platform choices, browser companions, connection state, API keys, Settings/Admin or implementation details unless the applicant asks about them or a specific requested action is actually blocked. If an external autofill action is blocked because the website companion is disconnected, explain that one relevant limitation briefly at that step and offer the available next action; never claim the form is filled. Document import, all-page scanning, AI extraction and review are available in this workspace. Use actual workflow facts to describe completed actions; never invent a completed scan, fill, upload or submission. Ordinary chat receives workflow facts, not private document contents or applicant values; document analysis is a separate operation, so do not pretend to read an unseen document. Use the named official application route automatically; do not ask the applicant to type a URL. Ask only for the next necessary missing choice, state or applicant detail. Permissions are remembered; do not ask again when permission is already saved. Exact current vacancies, dates and fees need official live sources; never invent links, results, eligibility, deadlines or fees. Login, OTP, CAPTCHA, declarations, payment, eSign and final submission remain applicant actions. Never ask for their secrets. Do not copy irrelevant warnings or platform instructions from earlier assistant replies.';
// Exact small-talk turns need neither a provider request nor an AI allowance reservation.
export function localChatReply(messages){
  const value=messages.at(-1)?.text;
  if(typeof value!=='string')return '';
  const normalized=value.normalize('NFKC').toLowerCase().trim().replace(/[!.,?।！？，]+$/u,'').trim();
  const greeting=/^(?:(?:hi|hii|hey|hello|namaste|namaskar|नमस्ते|नमस्कार)(?:\s+(?:bro|bhai|avsargo))?|good\s+(?:morning|afternoon|evening))$/u.test(normalized);
  if(greeting){const followup=messages.slice(0,-1).some(m=>m.role==='user');return /[\u0900-\u097f]/.test(normalized)?(followup?'नमस्ते! आगे क्या मदद चाहिए?':'नमस्ते! किस फॉर्म या काम में मदद चाहिए?'):(followup?'Hi! Aage kya madad chahiye?':'Hi! Kis form ya kaam mein madad chahiye?');}
  if(/^(?:thanks|thank you|shukriya|dhanyavad|dhanyavaad|शुक्रिया|धन्यवाद)(?:\s+(?:bro|bhai))?$/u.test(normalized))return /[\u0900-\u097f]/.test(normalized)?'आपका स्वागत है!':'Aapka swagat hai!';
  return '';
}
export const defaults=()=>({revision:1,branding:{name:'AvsarGo AI',greeting:'Kis form mein madad chahiye?',tagline:'A little guidance. A lot less paperwork.',theme:'dark',accent:'#bcead5',supportEmail:'',supportUrl:'',announcement:''},ai:{enabled:false,provider:'gemini',model:'',prompt:'',freeDailyLimit:8,paidDailyLimit:80,globalDailyLimit:500,maxOutputTokens:1200},payment:{enabled:false,mode:'test',planName:'AvsarGo Plus',pricePaise:9900,durationDays:30},maintenance:{enabled:false,message:'We will be back shortly. Your saved documents are available offline.'},portals:{pan:'https://www.incometax.gov.in/iec/foportal/',dl:'https://parivahan.gov.in/parivahan/',ssc:'https://ssc.gov.in/',rrb:'https://www.rrcb.gov.in/rrbs.html',income:'',caste:'',domicile:'',passport:'https://www.passportindia.gov.in/',voter:''}});
const freshState=()=>({config:defaults(),secrets:{},admin:null,devices:{},orders:{},registrations:{},usage:{},audit:[]});
function fail(status,message){const error=new Error(message);error.status=status;throw error;}
const text=(value,min,max,label)=>{if(typeof value!=='string'||value.trim().length<min||value.trim().length>max)fail(400,'Invalid '+label);return value.trim();};
const integer=(value,min,max,label)=>{if(!Number.isInteger(value)||value<min||value>max)fail(400,'Invalid '+label);return value;};
function officialUrl(value){if(value==='')return '';if(!officialFormUrl(value))fail(400,'Portal must be an official HTTPS government or verified operator address');return new URL(value).href;}
function validateConfig(input){
  const c=structuredClone(input);if(!c||typeof c!=='object')fail(400,'Invalid settings');
  for(const key of ['branding','ai','payment','maintenance','portals'])if(!c[key]||typeof c[key]!=='object')fail(400,'Missing '+key);
  c.branding.name=text(c.branding.name,2,40,'app name');c.branding.greeting=text(c.branding.greeting,2,100,'greeting');c.branding.tagline=text(c.branding.tagline,0,180,'tagline');
  if(!['light','dark'].includes(c.branding.theme)||!/^#[0-9a-f]{6}$/i.test(c.branding.accent))fail(400,'Invalid appearance');
  for(const key of ['supportEmail','supportUrl','announcement'])c.branding[key]=text(c.branding[key],0,key==='announcement'?500:180,key);
  if(c.branding.supportEmail&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.branding.supportEmail))fail(400,'Invalid support email');
  if(c.branding.supportUrl){try{const u=new URL(c.branding.supportUrl);if(u.protocol!=='https:'||u.username||u.password)throw Error();}catch{fail(400,'Support link must use HTTPS');}}
  if(!['gemini','openai'].includes(c.ai.provider))fail(400,'Invalid AI provider');
  c.ai.model=''; // Selected by the server after a real generation test.
  c.ai.prompt=text(c.ai.prompt,0,6000,'assistant instructions');
  for(const k of ['freeDailyLimit','paidDailyLimit'])c.ai[k]=integer(c.ai[k],1,1000,k);
  c.ai.globalDailyLimit=integer(c.ai.globalDailyLimit,1,20000,'global daily limit');c.ai.maxOutputTokens=integer(c.ai.maxOutputTokens,128,8192,'output length');
  c.payment.planName=text(c.payment.planName,2,60,'plan name');c.payment.pricePaise=integer(c.payment.pricePaise,100,1000000,'price in paise');c.payment.durationDays=integer(c.payment.durationDays,1,365,'duration');
  if(!['test','live'].includes(c.payment.mode))fail(400,'Invalid payment mode');
  c.maintenance.message=text(c.maintenance.message,2,300,'maintenance message');
  for(const key of Object.keys(defaults().portals))c.portals[key]=officialUrl(c.portals[key]);
  for(const [object,key]of [[c.ai,'enabled'],[c.payment,'enabled'],[c.maintenance,'enabled']])if(typeof object[key]!=='boolean')fail(400,'Invalid switch');
  // Accept only the allowlisted shape, never user-supplied secrets or extra object properties.
  const shape=defaults();for(const group of Object.keys(shape)){if(group==='revision')continue;for(const k of Object.keys(shape[group]))shape[group][k]=c[group][k];}return shape;
}
const secretNames=['geminiKey','openaiKey','razorpayTestId','razorpayTestSecret','razorpayTestWebhook','razorpayLiveId','razorpayLiveSecret','razorpayLiveWebhook'];
const paymentKeys=(state,mode)=>({id:state.secrets[mode==='live'?'razorpayLiveId':'razorpayTestId']||'',secret:state.secrets[mode==='live'?'razorpayLiveSecret':'razorpayTestSecret']||'',webhook:state.secrets[mode==='live'?'razorpayLiveWebhook':'razorpayTestWebhook']||''});
const aiKey=state=>state.secrets[state.config.ai.provider==='gemini'?'geminiKey':'openaiKey']||'';
const aiVerified=state=>!!(aiKey(state)&&state.aiConnection?.status==='connected'&&state.aiConnection.provider===state.config.ai.provider&&state.aiConnection.model===state.config.ai.model&&state.aiConnection.keyHash===hash(aiKey(state)));
const aiReady=state=>!!(state.config.ai.enabled&&aiVerified(state));
function aiConnection(state){const c=state.aiConnection;return c?{status:c.status,model:c.model||'',checkedAt:c.checkedAt||'',latencyMs:c.latencyMs||0,code:c.code||'',message:c.message||''}:{status:'untested',model:'',message:aiKey(state)?'Key saved. Test connection to enable AI.':'Add a key, save, then test the connection.'};}
const paymentReady=state=>{const k=paymentKeys(state,state.config.payment.mode);return !!(state.config.payment.enabled&&k.id&&k.secret);};
function publicConfig(state){const c=state.config;return {revision:c.revision,branding:c.branding,maintenance:c.maintenance,portals:c.portals,ai:{ready:aiReady(state),documentAnalysisReady:aiReady(state),formAssistReady:aiReady(state),liveSearchReady:aiReady(state),freeDailyLimit:c.ai.freeDailyLimit,paidDailyLimit:c.ai.paidDailyLimit},directory:publicCatalog(),payment:{ready:paymentReady(state),mode:c.payment.mode,planName:c.payment.planName,pricePaise:c.payment.pricePaise,durationDays:c.payment.durationDays}};}

export async function createApp({store,setupHash,setupExpires=Date.now()+86400000,origin='http://localhost:3000',customerOrigins=[],fetchImpl=fetch,clock=Date.now,secureCookies=true,ipSalt=random(),report=()=>{}}){
  let state=(await store.read())||freshState(),queue=Promise.resolve();
  const sessions=new Map(),rates=new Map(),busy=new Set();
  const aiClient=createProviderClient({fetchImpl,report});let testingAI=false;
  async function mutate(fn){const task=queue.then(async()=>{if(store.transaction){const result=await store.transaction(fn);state=result.state;return result.result;}const next=structuredClone(state);const result=await fn(next);await store.write(next);state=next;return result;});queue=task.catch(()=>{});return task;}
  if(!await store.read())await store.write(state);
  function audit(s,action){s.audit.unshift({at:new Date(clock()).toISOString(),action});s.audit=s.audit.slice(0,100);}
  const date=()=>new Date(clock()).toISOString().slice(0,10);
  function limit(key,count,period=60000){const now=clock();let r=rates.get(key);if(!r||now-r.at>=period){r={at:now,count:0};rates.set(key,r);}if(++r.count>count)fail(429,'Too many requests. Please try later.');if(rates.size>10000)for(const[k,v]of rates)if(now-v.at>86400000)rates.delete(k);}
  // Railway's public edge supplies the real client in X-Real-IP. A missing
  // X-Forwarded-For previously put unrelated installations in one quota bucket.
  const ip=req=>{const real=req.headers.get('x-real-ip')?.trim()||'',forwarded=req.headers.get('x-forwarded-for')?.split(',').at(-1)?.trim()||'';return hash(ipSalt+'|'+(isIP(real)?real:isIP(forwarded)?forwarded:'local'));};
  const json=(data,status=200,extra={})=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json;charset=utf-8','cache-control':'no-store',...extra}});
  async function body(req){const raw=await req.text();if(Buffer.byteLength(raw)>5000000)fail(413,'Request is too large');try{return JSON.parse(raw);}catch{fail(400,'Invalid JSON');}}
  function sameOrigin(req){if(req.headers.get('origin')!==origin)fail(403,'Request origin rejected');}
  function session(req,write=false){const token=req.headers.get('cookie')?.match(/(?:^|;\s*)av_admin=([^;]+)/)?.[1];const s=token&&sessions.get(hash(token));if(!s||s.expire<clock()){if(token)sessions.delete(hash(token));fail(401,'Sign in to continue');}if(write){sameOrigin(req);if(!equal(req.headers.get('x-csrf-token')||'',s.csrf))fail(403,'Request verification failed');}return s;}
  const cookie=(value,age)=>'av_admin='+value+'; Path=/; HttpOnly; SameSite=Strict; Max-Age='+age+(secureCookies?'; Secure':'');
  function signIn(){const token=random(),csrf=random();sessions.set(hash(token),{csrf,expire:clock()+8*3600000});return json({ok:true,csrf},200,{'set-cookie':cookie(token,28800)});}
  function device(req){const token=req.headers.get('authorization')?.match(/^Bearer ([a-zA-Z0-9_-]{40,100})$/)?.[1];const id=token?hash(token):'';if(!state.devices[id])fail(401,'Device session expired');return {id,value:state.devices[id]};}
  const paid=d=>d.plusUntil>clock();
  function deviceStatus(id){const d=state.devices[id],used=d.day===date()?d.used:0;return {plusUntil:d.plusUntil||0,paid:paid(d),used,dailyLimit:paid(d)?state.config.ai.paidDailyLimit:state.config.ai.freeDailyLimit};}
  async function provider(url,options){let res;try{res=await fetchImpl(url,{...options,redirect:'error',signal:AbortSignal.timeout(35000)});}catch{fail(502,'Provider connection failed. Try again.');}if(!res.ok){if(res.status===401||res.status===403)fail(502,'Provider rejected the configured key. Contact support.');if(res.status===429)fail(503,'Provider limit reached. Try again later.');fail(502,'Provider request failed (HTTP '+res.status+')');}try{return await res.json();}catch{fail(502,'Provider returned an unreadable response');}}
  const researchCache=new Map();
  let searchUnavailableUntil=0;
  async function research(query){
    const safe=publicQuery(query),cacheKey=hash(safe.toLowerCase()),cached=researchCache.get(cacheKey);if(cached&&clock()-cached.at<600000)return cached.result;const c=state.config.ai;let result,sources=[],mode='web-search';
    if(clock()>=searchUnavailableUntil)try{result=await generateSearchReply(aiClient,{...c,key:aiKey(state),query:'Today: '+new Date(clock()).toISOString().slice(0,10)+'\n'+safe,prompt:searchPrompt,maxOutputTokens:Math.min(3000,state.aiConnection?.outputTokenLimit||8192)});sources=await verifySearchSources(result,fetchImpl);}catch(e){if(!['PROVIDER_QUOTA','PROVIDER_UNAVAILABLE','MODEL_UNAVAILABLE','PROVIDER_REQUEST','PROVIDER_TIMEOUT'].includes(e.code))throw e;searchUnavailableUntil=clock()+15*60000;report({event:'live_search_fallback',code:e.code});}
    if(!sources.length){mode='official-pages';const reference=await officialResearch(safe,fetchImpl);sources=reference.sources;result={text:sources.length?await generateReply(aiClient,{...c,key:aiKey(state),prompt:officialResearchPrompt,messages:[{role:'user',text:JSON.stringify({today:new Date(clock()).toISOString().slice(0,10),query:safe,pages:reference.pages})}],maxOutputTokens:Math.min(2400,state.aiConnection?.outputTokenLimit||8192)}):'Official pages could not be reached right now. I could not verify current applications. Try again shortly.',suggestions:''};}
    const reply={text:result.text,sources,suggestions:result.suggestions||'',searchedAt:new Date(clock()).toISOString(),live:true,researchMode:mode};if(sources.length){researchCache.set(cacheKey,{at:clock(),result:reply});if(researchCache.size>200)researchCache.delete(researchCache.keys().next().value);}return reply;
  }
  async function chat(messages,context){
    const latest=messages.at(-1).text,prior=messages.filter(m=>m.role==='user').at(-2)?.text||'';
    if(isLiveQuestion(latest)||/^[?？\s]+$/.test(latest)&&isLiveQuestion(prior))return research(isLiveQuestion(latest)?latest:prior);
    const c=state.config.ai,text=await generateReply(aiClient,{...c,key:aiKey(state),messages,prompt:basePrompt+'\nAdditional owner instructions: '+c.prompt+(context?'\nActual app workflow facts (no applicant values): '+JSON.stringify(context):''),maxOutputTokens:Math.min(c.maxOutputTokens,state.aiConnection?.outputTokenLimit||8192)});return {text};
  }
  async function withAllowance(d,fn){
    if(state.config.maintenance.enabled)fail(503,state.config.maintenance.message);if(!aiReady(state))fail(503,'Assistant is temporarily unavailable. Your documents are saved; try again shortly.');
    limit('application-ai:'+ip(d.req),15);if(busy.has(d.id))fail(409,'Please wait for the current operation');busy.add(d.id);const day=date();let reserved=false;
    try{await mutate(s=>{const user=s.devices[d.id];if(user.day!==day){user.day=day;user.used=0;}const max=paid(user)?s.config.ai.paidDailyLimit:s.config.ai.freeDailyLimit;if(user.used>=max)fail(429,'Today’s AI allowance is used. You can continue with reviewed details or try tomorrow.');if((s.usage[day]||0)>=s.config.ai.globalDailyLimit)fail(429,'Assistant allowance is temporarily reached. Try again later.');user.used++;s.usage[day]=(s.usage[day]||0)+1;});reserved=true;return {...await fn(),status:deviceStatus(d.id)};
    }catch(e){if(reserved)await mutate(s=>{if(s.devices[d.id]?.day===day)s.devices[d.id].used=Math.max(0,s.devices[d.id].used-1);s.usage[day]=Math.max(0,(s.usage[day]||0)-1);});if(e.code&&/PROVIDER_|MODEL_|EMPTY_AI/.test(e.code))e.message=e.code==='PROVIDER_QUOTA'?'Assistant capacity is temporarily reached. Your documents are saved. Try again later.':'Assistant connection could not finish. Your documents are saved. Please retry.';throw e;}finally{busy.delete(d.id);}
  }
  async function applicationAi(d,operation,input,prompt,schema,parse){
    return withAllowance(d,async()=>{
      const c=state.config.ai;
      if(operation==='documents'){
        const groups=[];for(let i=0;i<input.documents.length;i+=2)groups.push(input.documents.slice(i,i+2));const results=[],errors=[];let lastError;
        for(let i=0;i<groups.length;i+=2){const done=await Promise.allSettled(groups.slice(i,i+2).map(async documents=>{const attachments=documents.flatMap(doc=>doc.images.map(image=>({...image,documentId:doc.id}))),data={documents:documents.map(doc=>({id:doc.id,text:doc.text,imagePages:doc.images.map(image=>image.page)}))};const raw=await generateReply(aiClient,{...c,key:aiKey(state),prompt,schema,attachments,messages:[{role:'user',text:JSON.stringify(data)}],maxOutputTokens:Math.min(8192,state.aiConnection?.outputTokenLimit||8192)});return parse(raw,{documents});}));for(let j=0;j<done.length;j++){if(done[j].status==='fulfilled')results.push(done[j].value);else{lastError=done[j].reason;errors.push(...groups[i+j].map(doc=>({documentId:doc.id,message:'Analysis could not complete for this file. Retry this document.'})));}}}
        if(!results.length)throw lastError;return {candidates:results.flatMap(r=>r.candidates).slice(0,500),meta:Object.assign({},...results.map(r=>r.meta)),documentTypes:results.flatMap(r=>r.documentTypes),coverage:results.flatMap(r=>r.coverage),errors,documentCount:input.documents.length,requiresReview:true};
      }
      const raw=await generateReply(aiClient,{...c,key:aiKey(state),prompt,schema,messages:[{role:'user',text:JSON.stringify(input)}],maxOutputTokens:Math.min(3072,state.aiConnection?.outputTokenLimit||8192)});return parse(raw,input);
    });
  }
  async function testAI(revision,source='owner'){
    if(testingAI)fail(409,'A connection test is already running. Please wait.');
    if(revision!==state.config.revision)fail(409,'Settings changed. Refresh before testing.');
    const c=structuredClone(state.config.ai),key=aiKey(state);if(!key)fail(400,'Add the selected provider API key and save changes first.');
    const keyHash=hash(key),matches=s=>s.config.revision===revision&&s.config.ai.provider===c.provider&&hash(aiKey(s))===keyHash;
    testingAI=true;
    try{
      await mutate(s=>{if(!matches(s))fail(409,'Settings changed. Refresh before testing.');s.aiConnection={status:'testing',provider:c.provider,keyHash,message:'Testing a real AI reply…'};});
      const result=await testSavedProvider(aiClient,{provider:c.provider,key,prompt:basePrompt+'\nAdditional app instructions: '+c.prompt},clock);
      await mutate(s=>{if(!matches(s))fail(409,'Settings changed during the test. Save and test the current key again.');s.config.ai.model=result.model;s.config.ai.enabled=true;s.config.revision++;s.aiConnection={status:'connected',provider:c.provider,keyHash,...result,checkedAt:new Date(clock()).toISOString(),message:'Connected. A real AI reply was received.'};audit(s,'AI connection verified · '+c.provider);});
      report({event:'ai_connection_test',source,provider:c.provider,status:'connected',model:result.model,latencyMs:result.latencyMs});return {ok:true,connection:aiConnection(state),revision:state.config.revision};
    }catch(e){
      await mutate(s=>{if(matches(s)){s.aiConnection={status:'failed',provider:c.provider,keyHash,checkedAt:new Date(clock()).toISOString(),code:e.code||'TEST_FAILED',message:e.status?e.message:'AI connection test failed. Please try again.'};audit(s,'AI connection test failed · '+(e.code||'TEST_FAILED'));}});
      report({event:'ai_connection_test',source,provider:c.provider,status:'failed',code:e.code||'TEST_FAILED'});throw e;
    }finally{testingAI=false;}
  }
  async function migrateAI(){
    // One bounded test for existing enabled installations after this repair.
    // Attempt state is persisted before contacting the provider; restarts do not
    // repeat paid tests. Existing owner credentials and provider keys are kept.
    if(store.transaction)state=await store.read();
    if(state.aiConnection!==undefined||!state.config.ai.enabled||!aiKey(state))return {skipped:true};
    return testAI(state.config.revision,'migration');
  }
  function settle(s,orderId,paymentId){const order=s.orders[orderId];if(!order||order.status==='paid')return;order.status='paid';order.paymentId=paymentId;order.paidAt=clock();const d=s.devices[order.device];if(d)d.plusUntil=Math.max(d.plusUntil||0,clock())+order.days*86400000;audit(s,'Payment captured · '+order.mode);}
  async function staticFile(name,type){const content=await readFile(new URL('./public/'+name,import.meta.url));return new Response(content,{headers:{'content-type':type,'cache-control':'no-store'}});}
  async function handle(req){if(store.transaction)state=await store.read();const url=new URL(req.url),path=url.pathname,method=req.method;
    limit('requests:'+ip(req),180);
    if(path==='/health'&&method==='GET')return json({ok:true,version:15});
    if(path==='/api/app/config'&&method==='GET')return json(publicConfig(state));
    if(path==='/admin'||path==='/admin/')return staticFile('admin.html','text/html;charset=utf-8');
    if(path==='/admin.js')return staticFile('admin.js','application/javascript;charset=utf-8');
    if(path==='/admin.css')return staticFile('admin.css','text/css;charset=utf-8');
    if(path==='/checkout.js')return staticFile('checkout.js','application/javascript;charset=utf-8');
    if(path==='/api/admin/session'&&method==='GET'){try{const s=session(req);return json({authenticated:true,csrf:s.csrf,username:state.admin.username});}catch{return json({authenticated:false,setupRequired:!state.admin});}}
    if(path==='/api/admin/setup'&&method==='POST'){
      sameOrigin(req);limit('setup:'+ip(req),6,900000);if(state.admin)fail(409,'Owner account already exists');const data=await body(req);
      if(clock()>setupExpires||!setupHash||!equal(hash(data.token||''),setupHash))fail(403,'Setup link invalid or expired');
      const username=text(data.username,3,60,'username'),password=text(data.password,12,200,'password');
      await mutate(s=>{if(s.admin)fail(409,'Owner account already exists');s.admin={username,password:passwordHash(password)};audit(s,'Owner account created');});return signIn();
    }
    if(path==='/api/admin/login'&&method==='POST'){
      sameOrigin(req);limit('login:'+ip(req),6,900000);const data=await body(req);if(!state.admin||!equal(data.username||'',state.admin.username)||!checkPassword(String(data.password||'').slice(0,200),state.admin.password))fail(401,'Username or password is incorrect');return signIn();
    }
    if(path==='/api/admin/logout'&&method==='POST'){session(req,true);const token=req.headers.get('cookie').match(/av_admin=([^;]+)/)[1];sessions.delete(hash(token));return json({ok:true},200,{'set-cookie':cookie('',0)});}
    if(path==='/api/admin/password'&&method==='POST'){session(req,true);const data=await body(req);if(!checkPassword(String(data.current||'').slice(0,200),state.admin.password))fail(403,'Current password is incorrect');const next=text(data.password,12,200,'new password');await mutate(s=>{s.admin.password=passwordHash(next);audit(s,'Owner password changed');});sessions.clear();return json({ok:true},200,{'set-cookie':cookie('',0)});}
    if(path==='/api/admin/config'&&method==='GET'){session(req);return json({config:state.config,keys:Object.fromEntries(secretNames.map(n=>[n,!!state.secrets[n]])),aiReady:aiReady(state),aiConnection:aiConnection(state),paymentReady:paymentReady(state)});}
    if(path==='/api/admin/config'&&method==='PUT'){
      session(req,true);const data=await body(req),config=validateConfig(data.config);
      await mutate(s=>{if(data.revision!==s.config.revision)fail(409,'Settings changed in another window. Reload before saving.');
        const beforeKey=aiKey(s),beforeProvider=s.config.ai.provider,selectedName=config.ai.provider==='gemini'?'geminiKey':'openaiKey';
        for(const n of secretNames){if(data.keys&&Object.hasOwn(data.keys,n)){const val=text(data.keys[n],0,500,n);if(val){if(/\s/.test(val))fail(400,'Keys cannot contain whitespace');s.secrets[n]=val;}}if(data.removeKeys?.includes(n))delete s.secrets[n];}
        for(const mode of ['test','live']){const k=paymentKeys(s,mode);if(k.id&&!k.id.startsWith(mode==='test'?'rzp_test_':'rzp_live_'))fail(400,'Razorpay '+mode+' key ID does not match its mode');}
        if(data.removeKeys?.includes(selectedName))config.ai.enabled=false;
        if(config.ai.enabled&&!s.secrets[selectedName])fail(400,'Add the selected provider key before enabling AI');
        const changed=beforeProvider!==config.ai.provider||beforeKey!==(s.secrets[selectedName]||'');
        if(changed||s.aiConnection?.status==='testing'){s.aiConnection=null;config.ai.model='';}
        else config.ai.model=s.config.ai.model;
        const p=paymentKeys(s,config.payment.mode);if(config.payment.enabled&&(!p.id||!p.secret))fail(400,'Add the payment key ID and secret before enabling payments');
        config.revision=s.config.revision+1;s.config=config;audit(s,'App settings updated');
      });return json({ok:true,revision:state.config.revision});
    }
    if(path==='/api/admin/ai/test'&&method==='POST'){session(req,true);limit('ai-test',3,60000);const data=await body(req);return json(await testAI(data.revision));}
    if(path==='/api/admin/models'&&method==='POST'){session(req,true);fail(410,'Use Test connection. The model is selected automatically.');}
    if(path==='/api/admin/payment-check'&&method==='POST'){session(req,true);const k=paymentKeys(state,state.config.payment.mode);if(!k.id||!k.secret)fail(400,'Save payment keys first');await provider('https://api.razorpay.com/v1/orders?count=1',{headers:{authorization:'Basic '+Buffer.from(k.id+':'+k.secret).toString('base64')}});return json({ok:true,message:'Payment key connection verified. No payment was created.'});}
    if(path==='/api/admin/overview'&&method==='GET'){session(req);const orders=Object.values(state.orders);return json({devices:Object.keys(state.devices).length,paidDevices:Object.values(state.devices).filter(paid).length,chatsToday:state.usage[date()]||0,testPayments:orders.filter(o=>o.status==='paid'&&o.mode==='test').length,liveRevenuePaise:orders.filter(o=>o.status==='paid'&&o.mode==='live').reduce((a,o)=>a+o.amount,0),audit:state.audit});}
    if(path==='/api/device/register'&&method==='POST'){
      limit('register:'+ip(req),8,86400000);if(Object.keys(state.devices).length>=25000)fail(503,'Registration is temporarily unavailable');
      const token=random(),id=hash(token),address=ip(req),day=date();
      await mutate(s=>{const count=s.registrations[address];if(count?.day===day&&count.count>=8)fail(429,'Device registration limit reached for today');s.registrations[address]={day,count:count?.day===day?count.count+1:1};s.devices[id]={created:clock(),day,used:0,plusUntil:0};for(const k of Object.keys(s.registrations))if(s.registrations[k].day!==day)delete s.registrations[k];});return json({token,status:deviceStatus(id)});
    }
    if(path==='/api/device/status'&&method==='GET'){const d=device(req);return json(deviceStatus(d.id));}
    if(path==='/api/applications/resolve'&&method==='POST'){
      const d=device(req),data=await body(req),query=publicQuery(data.query);limit('resolve:'+ip(req),30);const known=knownApplication(query,typeof data.state==='string'?data.state.slice(0,80):'',state.config);if(known)return json(known);
      if(data.consent!==true||!aiReady(state))return json({status:'choose_application',applications:publicCatalog().applications,message:'Which application or exam do you mean?'});
      return json(await withAllowance({...d,req},async()=>{const found=await research('Find the exact official application form for: '+query+(data.state?' in '+String(data.state).slice(0,80):'')),choices=found.sources.filter(s=>!new URL(s.url).pathname.toLowerCase().endsWith('.pdf')).map((source,index)=>({id:'discovered_'+index,name:source.title,url:source.url,verifiedBy:'live-official-source',verifiedOn:found.searchedAt}));if(choices.length===1)return {status:'resolved',application:choices[0]};return {status:'choose_application',applications:choices.length?choices:publicCatalog().applications,message:choices.length?'Choose the exact application':'Official application could not be verified. Choose the service.',sources:found.sources,suggestions:found.suggestions};}));
    }
    if(path==='/api/documents/analyse'&&method==='POST'){
      const d=device(req),input=documentsInput(await body(req));return json(await applicationAi({...d,req},'documents',input,documentPrompt,documentSchema,parseDocumentResult));
    }
    if(path==='/api/forms/map'&&method==='POST'){
      const d=device(req),input=mappingInput(await body(req));return json(await applicationAi({...d,req},'form',input,mappingPrompt,mappingSchemaFor(input),parseMappingResult));
    }
    if(path==='/api/chat'&&method==='POST'){
      const d=device(req);if(state.config.maintenance.enabled)fail(503,state.config.maintenance.message);if(!aiReady(state))fail(503,'Assistant is temporarily unavailable. Try again shortly.');limit('chat:'+ip(req),20);if(busy.has(d.id))fail(409,'Please wait for the current reply');
      const data=await body(req);if(data.consent!==true)fail(400,'Cloud chat consent is required');if(!Array.isArray(data.messages)||!data.messages.length||data.messages.length>16)fail(400,'Invalid conversation');
      const messages=data.messages.map(m=>{if(!['user','assistant'].includes(m.role))fail(400,'Invalid role');return {role:m.role,text:text(m.text,1,5000,'message')};});if(messages.at(-1).role!=='user')fail(400,'Last message must be from the user');
      const local=localChatReply(messages);if(local)return json({text:local,local:true,status:deviceStatus(d.id)});
      busy.add(d.id);const day=date();let reserved=false;
      try{await mutate(s=>{const user=s.devices[d.id];if(user.day!==day){user.day=day;user.used=0;}const max=paid(user)?s.config.ai.paidDailyLimit:s.config.ai.freeDailyLimit;if(user.used>=max)fail(429,'Today’s AI allowance is used. You can continue with reviewed details or try tomorrow.');if((s.usage[day]||0)>=s.config.ai.globalDailyLimit)fail(429,'App chat limit reached for today.');user.used++;s.usage[day]=(s.usage[day]||0)+1;for(const k of Object.keys(s.usage))if(k<new Date(clock()-30*86400000).toISOString().slice(0,10))delete s.usage[k];});reserved=true;const reply=await chat(messages,workflowContext(data.workflow));return json({...reply,status:deviceStatus(d.id)});
      }catch(error){if(reserved)await mutate(s=>{if(s.devices[d.id]?.day===day)s.devices[d.id].used=Math.max(0,s.devices[d.id].used-1);s.usage[day]=Math.max(0,(s.usage[day]||0)-1);});if(error.code&&/PROVIDER_|MODEL_|EMPTY_AI/.test(error.code))error.message=error.code==='PROVIDER_QUOTA'?'Assistant capacity is temporarily reached. Try again later.':'Assistant connection could not finish. Please retry.';throw error;}finally{busy.delete(d.id);}
    }
    if(path==='/api/payments/order'&&method==='POST'){
      const d=device(req);if(state.config.maintenance.enabled)fail(503,state.config.maintenance.message);if(!paymentReady(state))fail(503,'Payments are not enabled yet');limit('orders:'+d.id,4,900000);if(busy.has(d.id))fail(409,'Another request is in progress');busy.add(d.id);
      try{const existing=Object.entries(state.orders).find(([,o])=>o.device===d.id&&o.status==='created'&&o.created>clock()-900000);if(existing)return json({checkoutUrl:origin+'/checkout/'+existing[1].checkoutToken});
        const p=structuredClone(state.config.payment),keys=paymentKeys(state,p.mode);
        const result=await provider('https://api.razorpay.com/v1/orders',{method:'POST',headers:{'content-type':'application/json',authorization:'Basic '+Buffer.from(keys.id+':'+keys.secret).toString('base64')},body:JSON.stringify({amount:p.pricePaise,currency:'INR',receipt:'av_'+randomBytes(12).toString('hex'),notes:{app:'AvsarGo AI',mode:p.mode}})});
        if(!/^order_[a-zA-Z0-9]+$/.test(result.id||'')||result.amount!==p.pricePaise||result.currency!=='INR')fail(502,'Provider order did not match the plan');const checkoutToken=random();await mutate(s=>{s.orders[result.id]={device:d.id,status:'created',created:clock(),checkoutToken,amount:p.pricePaise,currency:'INR',mode:p.mode,days:p.durationDays,name:p.planName,keyId:keys.id,keySecret:keys.secret};});return json({checkoutUrl:origin+'/checkout/'+checkoutToken});
      }finally{busy.delete(d.id);}
    }
    const checkout=path.match(/^\/checkout\/([a-zA-Z0-9_-]{40,100})$/);
    if(checkout&&method==='GET')return staticFile('checkout.html','text/html;charset=utf-8');
    const checkoutApi=path.match(/^\/api\/checkout\/([a-zA-Z0-9_-]{40,100})(\/verify)?$/);
    if(checkoutApi){const entry=Object.entries(state.orders).find(([,o])=>equal(o.checkoutToken,checkoutApi[1]));if(!entry)fail(404,'Checkout not found');const[id,order]=entry;if(order.created<clock()-900000&&order.status!=='paid')fail(410,'Checkout expired. Open a new one from the app.');
      if(method==='GET'&&!checkoutApi[2])return json({orderId:id,keyId:order.keyId,amount:order.amount,currency:'INR',name:order.name,mode:order.mode,status:order.status});
      if(method==='POST'&&checkoutApi[2]){sameOrigin(req);const data=await body(req);if(data.razorpay_order_id!==id||!/^pay_[a-zA-Z0-9]+$/.test(data.razorpay_payment_id||''))fail(400,'Payment does not match this order');const signature=createHmac('sha256',order.keySecret).update(id+'|'+data.razorpay_payment_id).digest('hex');if(!equal(signature,data.razorpay_signature||''))fail(400,'Payment signature is invalid');
        const payment=await provider('https://api.razorpay.com/v1/payments/'+data.razorpay_payment_id,{headers:{authorization:'Basic '+Buffer.from(order.keyId+':'+order.keySecret).toString('base64')}});
        if(payment.order_id!==id||payment.amount!==order.amount||payment.currency!=='INR'||payment.status!=='captured')fail(409,'Payment is awaiting capture or does not match. Support can check it.');await mutate(s=>settle(s,id,data.razorpay_payment_id));return json({ok:true,status:'paid'});
      }
    }
    const webhook=path.match(/^\/api\/payments\/webhook\/(test|live)$/);
    if(webhook&&method==='POST'){
      const secret=paymentKeys(state,webhook[1]).webhook;if(!secret)fail(503,'Webhook secret is not configured');const raw=await req.text();if(Buffer.byteLength(raw)>5000000)fail(413,'Webhook too large');const sig=createHmac('sha256',secret).update(raw).digest('hex');if(!equal(sig,req.headers.get('x-razorpay-signature')||''))fail(400,'Invalid webhook signature');let data;try{data=JSON.parse(raw);}catch{fail(400,'Invalid webhook');}
      if(['payment.captured','order.paid'].includes(data.event)){const p=data.payload?.payment?.entity,o=state.orders[p?.order_id];if(o&&o.mode===webhook[1]&&p.status==='captured'&&p.amount===o.amount&&p.currency==='INR'&&/^pay_[a-zA-Z0-9]+$/.test(p.id||''))await mutate(s=>settle(s,p.order_id,p.id));}return json({ok:true});
    }
    fail(404,'Not found');
  }
  const webOrigins=new Set(customerOrigins.map(value=>{const u=new URL(value);if(u.origin!==value||u.protocol!=='https:')throw Error('CUSTOMER_WEB_ORIGIN must contain exact HTTPS origins');return value;}));
  const webRoutes=new Map([['/api/app/config','GET'],['/api/device/register','POST'],['/api/device/status','GET'],['/api/chat','POST'],['/api/documents/analyse','POST'],['/api/forms/map','POST'],['/api/applications/resolve','POST'],['/api/payments/order','POST']]);
  return {async fetch(req){let response;const requestOrigin=req.headers.get('origin'),path=new URL(req.url).pathname,expected=webRoutes.get(path),isWeb=webOrigins.has(requestOrigin)&&!!expected;
    try{
      if(req.method==='OPTIONS'){
        const requested=req.headers.get('access-control-request-method'),headers=(req.headers.get('access-control-request-headers')||'').toLowerCase().split(',').map(h=>h.trim()).filter(Boolean);
        if(!isWeb||requested!==expected||headers.some(h=>!['authorization','content-type'].includes(h)))fail(403,'Website access is not allowed');
        response=new Response(null,{status:204,headers:{'access-control-allow-methods':expected,'access-control-allow-headers':'authorization,content-type','access-control-max-age':'600'}});
      }else{
        if(expected&&requestOrigin&&requestOrigin!==origin&&(!isWeb||req.method!==expected))fail(403,'Website access is not allowed');
        response=await handle(req);
      }
    }catch(e){response=json({error:e.status?e.message:'Service temporarily unavailable',...(e.code?{code:e.code}:{})},e.status||500);}
    response.headers.set('vary','Origin');
    if(isWeb){response.headers.set('access-control-allow-origin',requestOrigin);}

    const checkout=new URL(req.url).pathname.startsWith('/checkout');
    response.headers.set('content-security-policy',"default-src 'self'; script-src 'self'"+(checkout?" https://checkout.razorpay.com":"")+"; style-src 'self'"+(checkout?" 'unsafe-inline'":"")+"; img-src 'self' data:; connect-src 'self'"+(checkout?" https://*.razorpay.com":"")+"; frame-src "+(checkout?'https://*.razorpay.com':"'none'")+"; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
    response.headers.set('x-content-type-options','nosniff');response.headers.set('referrer-policy','no-referrer');response.headers.set('permissions-policy','camera=(),microphone=(),geolocation=()');if(secureCookies)response.headers.set('strict-transport-security','max-age=31536000');return response;},migrateAI,snapshot:()=>structuredClone(state),close:()=>queue};
}

