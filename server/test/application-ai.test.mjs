import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createApp,hash,defaults} from '../app.mjs';
import {documentsInput,parseDocumentResult,mappingInput,parseMappingResult,workflowContext} from '../application-ai.mjs';
const origin='https://qa.example',key='private_provider_key',token='a'.repeat(43),id=hash(token);
const scan={id:'doc-1',text:'Name: Sample Applicant\nDOB: 21/01/2000\nState: Delhi\nEducation board: CBSE\nPercentage: 85.50%'};
const candidate=(overrides={})=>({key:'fullName',value:'Sample Applicant',documentId:'doc-1',evidence:'Name: Sample Applicant',confidence:'high',...overrides});
async function fixture(response={candidates:[candidate()]},provider='gemini'){
 const config=defaults();Object.assign(config.ai,{enabled:true,model:provider==='gemini'?'gemini-3.5-flash-lite':'gpt-4.1-mini',provider});
 let state={config,secrets:{[provider==='gemini'?'geminiKey':'openaiKey']:key},admin:null,devices:{[id]:{created:Date.now(),day:'',used:0,plusUntil:0}},orders:{},registrations:{},usage:{},audit:[],aiConnection:{status:'connected',provider,model:config.ai.model,keyHash:hash(key),outputTokenLimit:8192}};
 const calls=[],logs=[];const app=await createApp({store:{read:async()=>structuredClone(state),write:async s=>state=structuredClone(s)},origin,report:e=>logs.push(e),fetchImpl:async(url,options)=>{calls.push({url,options});const value=typeof response==='function'?await response():response;return new Response(JSON.stringify(provider==='gemini'?{candidates:[{content:{parts:[{text:typeof value==='string'?value:JSON.stringify(value)}]}}]}:{choices:[{message:{content:typeof value==='string'?value:JSON.stringify(value)}}]}));}});
 const req=async(path,body,auth=true)=>{const r=await app.fetch(new Request(origin+path,{method:'POST',headers:{'content-type':'application/json',...(auth?{authorization:'Bearer '+token}:{})},body:JSON.stringify(body)}));return {status:r.status,data:await r.json()};};
 return {app,req,calls,logs};
}
test('document analysis requires native authentication and separate explicit consent',async()=>{
 const f=await fixture();assert.equal((await f.req('/api/documents/analyse',{consent:true,documents:[scan]},false)).status,401);
 assert.equal((await f.req('/api/documents/analyse',{documents:[scan]})).status,400);assert.equal(f.calls.length,0);assert.equal(f.app.snapshot().devices[id].used,0);
});
test('selected OCR text uses structured AI and returns source-backed proposals, without server persistence',async()=>{
 const f=await fixture();const r=await f.req('/api/documents/analyse',{consent:true,documents:[scan],profile:{fullName:'DO NOT SEND PROFILE'}});
 assert.equal(r.status,200);assert.equal(r.data.requiresReview,true);assert.equal(r.data.candidates[0].value,'Sample Applicant');assert.equal(r.data.status.used,1);
 const payload=JSON.parse(f.calls[0].options.body);assert.equal(payload.generationConfig.responseMimeType,'application/json');assert.ok(payload.generationConfig.responseJsonSchema.properties.candidates);assert.ok(!f.calls[0].options.body.includes('DO NOT SEND PROFILE'));
 assert.ok(!JSON.stringify(f.app.snapshot()).includes('Sample Applicant'));assert.ok(!JSON.stringify(f.logs).includes('Sample Applicant'));
});
test('OpenAI structured analysis uses the configured server key and store false',async()=>{
 const f=await fixture({candidates:[candidate()]},'openai');assert.equal((await f.req('/api/documents/analyse',{consent:true,documents:[scan]})).status,200);
 const p=JSON.parse(f.calls[0].options.body);assert.equal(p.response_format.type,'json_schema');assert.equal(p.response_format.json_schema.strict,true);assert.equal(p.store,false);assert.equal(p.max_completion_tokens,4096);
});
test('hallucinated values, missing evidence, identity numbers and invalid dates never become proposals',()=>{
 const input=documentsInput({consent:true,documents:[scan]}),r=parseDocumentResult(JSON.stringify({candidates:[candidate(),candidate({value:'Invented Person'}),candidate({documentId:'other'}),candidate({key:'aadhaar',value:'123456789012'}),candidate({key:'dob',value:'31/02/2000',evidence:'31/02/2000'}),candidate({evidence:'Invented evidence'}),candidate({key:'firstName',value:'Sa',evidence:'Name: Sample Applicant',confidence:'low'})]}),input);
 assert.equal(r.candidates.filter(c=>c.key==='fullName').length,1);assert.ok(r.candidates.every(c=>c.key!=='aadhaar'&&c.key!=='dob'));
});
test('different documents keep conflicting values for the user to choose',()=>{
 const second={id:'doc-2',text:'Name: Sample A. Applicant'},input=documentsInput({consent:true,documents:[scan,second]});
 const r=parseDocumentResult(JSON.stringify({candidates:[candidate(),candidate({documentId:'doc-2',value:'Sample A. Applicant',evidence:'Name: Sample A. Applicant'})]}),input);
 assert.equal(r.candidates.length,2);assert.equal(r.requiresReview,true);
});
test('oversized, empty or duplicate scans stop before contacting the provider',async()=>{
 const f=await fixture();for(const documents of [[{...scan,text:'x'.repeat(12001)}],[{...scan,text:''}],[scan,scan],Array.from({length:4},(_,i)=>({id:'doc-'+i,text:'x'.repeat(12000)}))])assert.equal((await f.req('/api/documents/analyse',{consent:true,documents})).status,400);
 assert.equal(f.calls.length,0);
});
test('incomplete structured results refund reserved allowance and can be retried',async()=>{
 const f=await fixture('{broken');const r=await f.req('/api/documents/analyse',{consent:true,documents:[scan]});assert.equal(r.status,502);assert.equal(r.data.code,'DOCUMENT_RESPONSE');assert.equal(f.app.snapshot().devices[id].used,0);
});
test('form mapping sends labels and key names only; conflicting or weak suggestions are skipped',async()=>{
 const f=await fixture({mappings:[{fieldId:'f1',key:'district',confidence:'high'},{fieldId:'f2',key:'city',confidence:'low'}]});
 const r=await f.req('/api/forms/map',{consent:true,fields:[{fieldId:'f1',label:'Applicant administrative district',type:'text',value:'PRIVATE PORTAL VALUE'},{fieldId:'f2',label:'Municipality',type:'text'}],profile:{city:'PRIVATE PROFILE VALUE'}});
 assert.equal(r.status,200);assert.deepEqual(r.data.mappings,[{fieldId:'f1',key:'district'}]);assert.ok(!f.calls[0].options.body.includes('PRIVATE'));
 const input=mappingInput({consent:true,fields:[{fieldId:'f1',label:'Place',type:'text'}]});assert.deepEqual(parseMappingResult(JSON.stringify({mappings:[{fieldId:'f1',key:'city',confidence:'high'},{fieldId:'f1',key:'state',confidence:'high'}]}),input).mappings,[]);
});
test('protected or unsupported website controls cannot be sent to AI Assist',async()=>{
 const f=await fixture();for(const label of ['OTP number','Bank account','Password','Aadhaar number','Legal declaration','PAN number','Email confirmation'])assert.equal((await f.req('/api/forms/map',{consent:true,fields:[{fieldId:'f1',label,type:'text'}]})).status,400);
 assert.equal((await f.req('/api/forms/map',{consent:true,fields:[{fieldId:'f1',label:'Accept',type:'checkbox'}]})).status,400);assert.equal(f.calls.length,0);
});
test('ordinary chat has grounded workflow facts but no document text or profile values',async()=>{
 const f=await fixture('Use Upload documents, then review and autofill');const r=await f.req('/api/chat',{consent:true,messages:[{role:'user',text:'PAN form fill karo'}],workflow:{service:'pan',documentCount:2,reviewedKeys:['fullName','password'],documentAnalysis:'reviewed',filledCount:3,profile:{fullName:'PRIVATE APPLICANT'},text:'PRIVATE OCR'}});
 assert.equal(r.status,200);const p=JSON.parse(f.calls[0].options.body),prompt=p.systemInstruction.parts[0].text;assert.ok(prompt.includes('can import PDF/JPG/PNG'));assert.ok(prompt.includes('"filledCount":3'));assert.ok(!prompt.includes('PRIVATE'));assert.ok(!prompt.includes('Never claim to have read uploaded documents'));
 assert.deepEqual(workflowContext({documentCount:99,reviewedKeys:['fullName','password']} ).reviewedKeys,['fullName']);
});
test('document analysis and chat share per-device concurrency and quota protection',async()=>{
 let release,entered;const start=new Promise(r=>entered=r),wait=new Promise(r=>release=r);const f=await fixture(async()=>{entered();await wait;return {candidates:[candidate()]};});
 const first=f.req('/api/documents/analyse',{consent:true,documents:[scan]});await start;assert.equal((await f.req('/api/forms/map',{consent:true,fields:[]})).status,409);assert.equal((await f.req('/api/chat',{consent:true,messages:[{role:'user',text:'Hello'}]})).status,409);release();assert.equal((await first).status,200);
});
