import {randomBytes,createHash,createHmac,timingSafeEqual,scryptSync} from 'node:crypto';
import {readFile} from 'node:fs/promises';

const random=()=>randomBytes(32).toString('base64url');
export const hash=value=>createHash('sha256').update(value).digest('hex');
const equal=(a,b)=>{const x=Buffer.from(String(a)),y=Buffer.from(String(b));return x.length===y.length&&timingSafeEqual(x,y);};
export const passwordHash=password=>{const salt=randomBytes(16).toString('hex');return salt+':'+scryptSync(password,salt,64).toString('hex');};
const checkPassword=(password,value)=>{try{const [salt,digest]=value.split(':');return equal(scryptSync(password,salt,64).toString('hex'),digest);}catch{return false;}};
const basePrompt='You are AvsarGo, an independent Indian application assistant. Respond naturally in the user language: Hindi, Hinglish or English. Ask for the exact form and state, then the document checklist and review, then official application URL. Never claim to have read uploaded documents or filled a portal: those actions run locally on the phone. Never request passwords, OTPs, CAPTCHA answers, payment card data or full document identifiers in chat. Login, CAPTCHA, OTP, payments, declarations, signatures and final submission are always performed by the user. Do not invent eligibility, fees, deadlines or current official links. Ask the user to verify the official notice. Prefer concise readable paragraphs.';
export const defaults=()=>({revision:1,branding:{name:'AvsarGo AI',greeting:'Kis form mein madad chahiye?',tagline:'A little guidance. A lot less paperwork.',theme:'dark',accent:'#bcead5',supportEmail:'',supportUrl:'',announcement:''},ai:{enabled:false,provider:'gemini',model:'',prompt:'',freeDailyLimit:8,paidDailyLimit:80,globalDailyLimit:500,maxOutputTokens:1200},payment:{enabled:false,mode:'test',planName:'AvsarGo Plus',pricePaise:9900,durationDays:30},maintenance:{enabled:false,message:'We will be back shortly. Your saved documents are available offline.'},portals:{pan:'https://www.incometax.gov.in/iec/foportal/',dl:'https://parivahan.gov.in/parivahan/',ssc:'https://ssc.gov.in/',rrb:'https://www.rrcb.gov.in/rrbs.html',income:'',caste:'',domicile:'',passport:'https://www.passportindia.gov.in/',voter:''}});
const freshState=()=>({config:defaults(),secrets:{},admin:null,devices:{},orders:{},registrations:{},usage:{},audit:[]});
function fail(status,message){const error=new Error(message);error.status=status;throw error;}
const text=(value,min,max,label)=>{if(typeof value!=='string'||value.trim().length<min||value.trim().length>max)fail(400,'Invalid '+label);return value.trim();};
const integer=(value,min,max,label)=>{if(!Number.isInteger(value)||value<min||value>max)fail(400,'Invalid '+label);return value;};
function officialUrl(value){if(value==='')return '';try{const url=new URL(value);if(url.protocol!=='https:'||url.username||url.password||url.port&&!['443',''].includes(url.port)||!/(?:\.gov\.in|\.nic\.in)$/i.test(url.hostname))throw Error();return url.href;}catch{fail(400,'Portal must be an official HTTPS .gov.in or .nic.in address');}}
function validateConfig(input){
  const c=structuredClone(input);if(!c||typeof c!=='object')fail(400,'Invalid settings');
  for(const key of ['branding','ai','payment','maintenance','portals'])if(!c[key]||typeof c[key]!=='object')fail(400,'Missing '+key);
  c.branding.name=text(c.branding.name,2,40,'app name');c.branding.greeting=text(c.branding.greeting,2,100,'greeting');c.branding.tagline=text(c.branding.tagline,0,180,'tagline');
  if(!['light','dark'].includes(c.branding.theme)||!/^#[0-9a-f]{6}$/i.test(c.branding.accent))fail(400,'Invalid appearance');
  for(const key of ['supportEmail','supportUrl','announcement'])c.branding[key]=text(c.branding[key],0,key==='announcement'?500:180,key);
  if(c.branding.supportEmail&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.branding.supportEmail))fail(400,'Invalid support email');
  if(c.branding.supportUrl){try{const u=new URL(c.branding.supportUrl);if(u.protocol!=='https:'||u.username||u.password)throw Error();}catch{fail(400,'Support link must use HTTPS');}}
  if(!['gemini','openai'].includes(c.ai.provider)||!/^[a-zA-Z0-9._-]{0,100}$/.test(c.ai.model))fail(400,'Invalid AI provider or model');
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
const aiReady=state=>!!(state.config.ai.enabled&&state.config.ai.model&&state.secrets[state.config.ai.provider==='gemini'?'geminiKey':'openaiKey']);
const paymentReady=state=>{const k=paymentKeys(state,state.config.payment.mode);return !!(state.config.payment.enabled&&k.id&&k.secret);};
function publicConfig(state){const c=state.config;return {revision:c.revision,branding:c.branding,maintenance:c.maintenance,portals:c.portals,ai:{ready:aiReady(state),freeDailyLimit:c.ai.freeDailyLimit,paidDailyLimit:c.ai.paidDailyLimit},payment:{ready:paymentReady(state),mode:c.payment.mode,planName:c.payment.planName,pricePaise:c.payment.pricePaise,durationDays:c.payment.durationDays}};}

export async function createApp({store,setupHash,setupExpires=Date.now()+86400000,origin='http://localhost:3000',fetchImpl=fetch,clock=Date.now,secureCookies=true,ipSalt=random()}){
  let state=(await store.read())||freshState(),queue=Promise.resolve();
  const sessions=new Map(),rates=new Map(),busy=new Set();
  async function mutate(fn){const task=queue.then(async()=>{if(store.transaction){const result=await store.transaction(fn);state=result.state;return result.result;}const next=structuredClone(state);const result=await fn(next);await store.write(next);state=next;return result;});queue=task.catch(()=>{});return task;}
  if(!await store.read())await store.write(state);
  function audit(s,action){s.audit.unshift({at:new Date(clock()).toISOString(),action});s.audit=s.audit.slice(0,100);}
  const date=()=>new Date(clock()).toISOString().slice(0,10);
  function limit(key,count,period=60000){const now=clock();let r=rates.get(key);if(!r||now-r.at>=period){r={at:now,count:0};rates.set(key,r);}if(++r.count>count)fail(429,'Too many requests. Please try later.');if(rates.size>10000)for(const[k,v]of rates)if(now-v.at>86400000)rates.delete(k);}
  const ip=req=>hash(ipSalt+'|'+(req.headers.get('x-forwarded-for')?.split(',').at(-1)?.trim()||'local'));
  const json=(data,status=200,extra={})=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json;charset=utf-8','cache-control':'no-store',...extra}});
  async function body(req){const raw=await req.text();if(Buffer.byteLength(raw)>262144)fail(413,'Request is too large');try{return JSON.parse(raw);}catch{fail(400,'Invalid JSON');}}
  function sameOrigin(req){if(req.headers.get('origin')!==origin)fail(403,'Request origin rejected');}
  function session(req,write=false){const token=req.headers.get('cookie')?.match(/(?:^|;\s*)av_admin=([^;]+)/)?.[1];const s=token&&sessions.get(hash(token));if(!s||s.expire<clock()){if(token)sessions.delete(hash(token));fail(401,'Sign in to continue');}if(write){sameOrigin(req);if(!equal(req.headers.get('x-csrf-token')||'',s.csrf))fail(403,'Request verification failed');}return s;}
  const cookie=(value,age)=>'av_admin='+value+'; Path=/; HttpOnly; SameSite=Strict; Max-Age='+age+(secureCookies?'; Secure':'');
  function signIn(){const token=random(),csrf=random();sessions.set(hash(token),{csrf,expire:clock()+8*3600000});return json({ok:true,csrf},200,{'set-cookie':cookie(token,28800)});}
  function device(req){const token=req.headers.get('authorization')?.match(/^Bearer ([a-zA-Z0-9_-]{40,100})$/)?.[1];const id=token?hash(token):'';if(!state.devices[id])fail(401,'Device session expired');return {id,value:state.devices[id]};}
  const paid=d=>d.plusUntil>clock();
  function deviceStatus(id){const d=state.devices[id],used=d.day===date()?d.used:0;return {plusUntil:d.plusUntil||0,paid:paid(d),used,dailyLimit:paid(d)?state.config.ai.paidDailyLimit:state.config.ai.freeDailyLimit};}
  async function provider(url,options){let res;try{res=await fetchImpl(url,{...options,redirect:'error',signal:AbortSignal.timeout(35000)});}catch{fail(502,'Provider connection failed. Try again.');}if(!res.ok){if(res.status===401||res.status===403)fail(502,'Provider rejected the configured key. Contact support.');if(res.status===429)fail(503,'Provider limit reached. Try again later.');fail(502,'Provider request failed (HTTP '+res.status+')');}try{return await res.json();}catch{fail(502,'Provider returned an unreadable response');}}
  async function chat(messages){const c=state.config.ai,key=state.secrets[c.provider==='gemini'?'geminiKey':'openaiKey'];const prompt=basePrompt+'\nAdditional app instructions: '+c.prompt;
    if(c.provider==='gemini'){const data=await provider('https://generativelanguage.googleapis.com/v1beta/models/'+encodeURIComponent(c.model)+':generateContent',{method:'POST',headers:{'content-type':'application/json','x-goog-api-key':key},body:JSON.stringify({systemInstruction:{parts:[{text:prompt}]},contents:messages.map(m=>({role:m.role==='user'?'user':'model',parts:[{text:m.text}]})),generationConfig:{maxOutputTokens:c.maxOutputTokens}})});const answer=(data.candidates?.[0]?.content?.parts||[]).filter(p=>!p.thought).map(p=>p.text||'').join('\n');if(!answer.trim())fail(502,'The AI did not return a response. Please try again.');return answer.slice(0,15000);}
    const data=await provider('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+key},body:JSON.stringify({model:c.model,messages:[{role:'system',content:prompt},...messages.map(m=>({role:m.role,content:m.text}))],max_completion_tokens:c.maxOutputTokens})});const answer=data.choices?.[0]?.message?.content;if(typeof answer!=='string'||!answer.trim())fail(502,'The AI did not return a response. Please try again.');return answer.slice(0,15000);
  }
  function settle(s,orderId,paymentId){const order=s.orders[orderId];if(!order||order.status==='paid')return;order.status='paid';order.paymentId=paymentId;order.paidAt=clock();const d=s.devices[order.device];if(d)d.plusUntil=Math.max(d.plusUntil||0,clock())+order.days*86400000;audit(s,'Payment captured · '+order.mode);}
  async function staticFile(name,type){const content=await readFile(new URL('./public/'+name,import.meta.url));return new Response(content,{headers:{'content-type':type,'cache-control':'no-store'}});}
  async function handle(req){if(store.transaction)state=await store.read();const url=new URL(req.url),path=url.pathname,method=req.method;
    limit('requests:'+ip(req),180);
    if(path==='/health'&&method==='GET')return json({ok:true,version:13});
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
    if(path==='/api/admin/config'&&method==='GET'){session(req);return json({config:state.config,keys:Object.fromEntries(secretNames.map(n=>[n,!!state.secrets[n]])),aiReady:aiReady(state),paymentReady:paymentReady(state)});}
    if(path==='/api/admin/config'&&method==='PUT'){
      session(req,true);const data=await body(req),config=validateConfig(data.config);
      await mutate(s=>{if(data.revision!==s.config.revision)fail(409,'Settings changed in another window. Reload before saving.');
        for(const n of secretNames){if(data.keys&&Object.hasOwn(data.keys,n)){const val=text(data.keys[n],0,500,n);if(val){if(/\s/.test(val))fail(400,'Keys cannot contain whitespace');s.secrets[n]=val;}}if(data.removeKeys?.includes(n))delete s.secrets[n];}
        for(const mode of ['test','live']){const k=paymentKeys(s,mode);if(k.id&&!k.id.startsWith(mode==='test'?'rzp_test_':'rzp_live_'))fail(400,'Razorpay '+mode+' key ID does not match its mode');}
        if(config.ai.enabled&&(!config.ai.model||!s.secrets[config.ai.provider==='gemini'?'geminiKey':'openaiKey']))fail(400,'Add the selected provider key and model before enabling AI');
        const p=paymentKeys(s,config.payment.mode);if(config.payment.enabled&&(!p.id||!p.secret))fail(400,'Add the payment key ID and secret before enabling payments');
        config.revision=s.config.revision+1;s.config=config;audit(s,'App settings updated');
      });return json({ok:true,revision:state.config.revision});
    }
    if(path==='/api/admin/models'&&method==='POST'){session(req,true);const c=state.config.ai,key=state.secrets[c.provider==='gemini'?'geminiKey':'openaiKey'];if(!key)fail(400,'Save a provider key first');limit('models',5,60000);const data=await provider(c.provider==='gemini'?'https://generativelanguage.googleapis.com/v1beta/models?pageSize=100':'https://api.openai.com/v1/models',{headers:c.provider==='gemini'?{'x-goog-api-key':key}:{authorization:'Bearer '+key}});const models=c.provider==='gemini'?(data.models||[]).filter(m=>m.supportedGenerationMethods?.includes('generateContent')).map(m=>m.name.replace(/^models\//,'')):(data.data||[]).map(m=>m.id);return json({models});}
    if(path==='/api/admin/payment-check'&&method==='POST'){session(req,true);const k=paymentKeys(state,state.config.payment.mode);if(!k.id||!k.secret)fail(400,'Save payment keys first');await provider('https://api.razorpay.com/v1/orders?count=1',{headers:{authorization:'Basic '+Buffer.from(k.id+':'+k.secret).toString('base64')}});return json({ok:true,message:'Payment key connection verified. No payment was created.'});}
    if(path==='/api/admin/overview'&&method==='GET'){session(req);const orders=Object.values(state.orders);return json({devices:Object.keys(state.devices).length,paidDevices:Object.values(state.devices).filter(paid).length,chatsToday:state.usage[date()]||0,testPayments:orders.filter(o=>o.status==='paid'&&o.mode==='test').length,liveRevenuePaise:orders.filter(o=>o.status==='paid'&&o.mode==='live').reduce((a,o)=>a+o.amount,0),audit:state.audit});}
    if(path==='/api/device/register'&&method==='POST'){
      limit('register:'+ip(req),8,86400000);if(Object.keys(state.devices).length>=25000)fail(503,'Registration is temporarily unavailable');
      const token=random(),id=hash(token),address=ip(req),day=date();
      await mutate(s=>{const count=s.registrations[address];if(count?.day===day&&count.count>=8)fail(429,'Device registration limit reached for today');s.registrations[address]={day,count:count?.day===day?count.count+1:1};s.devices[id]={created:clock(),day,used:0,plusUntil:0};for(const k of Object.keys(s.registrations))if(s.registrations[k].day!==day)delete s.registrations[k];});return json({token,status:deviceStatus(id)});
    }
    if(path==='/api/device/status'&&method==='GET'){const d=device(req);return json(deviceStatus(d.id));}
    if(path==='/api/chat'&&method==='POST'){
      const d=device(req);if(state.config.maintenance.enabled)fail(503,state.config.maintenance.message);if(!aiReady(state))fail(503,'AI is not configured yet. The owner can enable it in Admin panel.');limit('chat:'+ip(req),20);if(busy.has(d.id))fail(409,'Please wait for the current reply');
      const data=await body(req);if(data.consent!==true)fail(400,'Cloud chat consent is required');if(!Array.isArray(data.messages)||!data.messages.length||data.messages.length>16)fail(400,'Invalid conversation');
      const messages=data.messages.map(m=>{if(!['user','assistant'].includes(m.role))fail(400,'Invalid role');return {role:m.role,text:text(m.text,1,5000,'message')};});if(messages.at(-1).role!=='user')fail(400,'Last message must be from the user');
      busy.add(d.id);const day=date();let reserved=false;
      try{await mutate(s=>{const user=s.devices[d.id];if(user.day!==day){user.day=day;user.used=0;}const max=paid(user)?s.config.ai.paidDailyLimit:s.config.ai.freeDailyLimit;if(user.used>=max)fail(429,'Daily chat limit reached. Try tomorrow or view Plus in Settings.');if((s.usage[day]||0)>=s.config.ai.globalDailyLimit)fail(429,'App chat limit reached for today.');user.used++;s.usage[day]=(s.usage[day]||0)+1;for(const k of Object.keys(s.usage))if(k<new Date(clock()-30*86400000).toISOString().slice(0,10))delete s.usage[k];});reserved=true;const reply=await chat(messages);return json({text:reply,status:deviceStatus(d.id)});
      }catch(error){if(reserved)await mutate(s=>{if(s.devices[d.id]?.day===day)s.devices[d.id].used=Math.max(0,s.devices[d.id].used-1);s.usage[day]=Math.max(0,(s.usage[day]||0)-1);});throw error;}finally{busy.delete(d.id);}
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
      const secret=paymentKeys(state,webhook[1]).webhook;if(!secret)fail(503,'Webhook secret is not configured');const raw=await req.text();if(Buffer.byteLength(raw)>262144)fail(413,'Webhook too large');const sig=createHmac('sha256',secret).update(raw).digest('hex');if(!equal(sig,req.headers.get('x-razorpay-signature')||''))fail(400,'Invalid webhook signature');let data;try{data=JSON.parse(raw);}catch{fail(400,'Invalid webhook');}
      if(['payment.captured','order.paid'].includes(data.event)){const p=data.payload?.payment?.entity,o=state.orders[p?.order_id];if(o&&o.mode===webhook[1]&&p.status==='captured'&&p.amount===o.amount&&p.currency==='INR'&&/^pay_[a-zA-Z0-9]+$/.test(p.id||''))await mutate(s=>settle(s,p.order_id,p.id));}return json({ok:true});
    }
    fail(404,'Not found');
  }
  return {async fetch(req){let response;try{response=await handle(req);}catch(e){response=json({error:e.status?e.message:'Service temporarily unavailable'},e.status||500);}
    const checkout=new URL(req.url).pathname.startsWith('/checkout');
    response.headers.set('content-security-policy',"default-src 'self'; script-src 'self'"+(checkout?" https://checkout.razorpay.com":"")+"; style-src 'self'"+(checkout?" 'unsafe-inline'":"")+"; img-src 'self' data:; connect-src 'self'"+(checkout?" https://*.razorpay.com":"")+"; frame-src "+(checkout?'https://*.razorpay.com':"'none'")+"; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
    response.headers.set('x-content-type-options','nosniff');response.headers.set('referrer-policy','no-referrer');response.headers.set('permissions-policy','camera=(),microphone=(),geolocation=()');if(secureCookies)response.headers.set('strict-transport-security','max-age=31536000');return response;},snapshot:()=>structuredClone(state),close:()=>queue};
}
