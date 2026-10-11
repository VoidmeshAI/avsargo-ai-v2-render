// Opt-in real account check. The workflow runs this only for commits explicitly
// marked [verify live AI]; ordinary deployments do not consume provider usage.
import assert from 'node:assert/strict';
const origin='https://avsargo-ai-admin-production.up.railway.app';
const request=(path,options={})=>fetch(origin+path,{...options,redirect:'error',signal:AbortSignal.timeout(45000)});
let config;
for(let i=0;i<12;i++){config=await(await request('/api/app/config')).json();if(config.ai?.ready)break;await new Promise(resolve=>setTimeout(resolve,5000));}
assert.equal(config.ai?.ready,true,'Saved AI connection must pass its real server verification before chat');
const register=await request('/api/device/register',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});assert.equal(register.status,200);const device=await register.json();assert.ok(device.token);
const post=async(path,body)=>{const started=Date.now(),r=await request(path,{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+device.token},body:JSON.stringify(body)}),value=await r.json();assert.equal(r.status,200,value.error||path+' must return a valid response');return {value,ms:Date.now()-started};};
const analysis=await post('/api/documents/analyse',{consent:true,documents:[{id:'synthetic-doc-1',text:'Full name: Test Applicant\nDate of birth: 01/01/2000\nCity: Delhi\nState: Delhi\nPostal PIN code: 110001\nEducation board: CBSE\nPassing year: 2020'}]});
assert.equal(analysis.value.requiresReview,true);assert.ok(analysis.value.candidates.some(c=>c.key==='fullName'&&c.value==='Test Applicant'),'AI must extract the explicitly labelled synthetic applicant name');assert.ok(analysis.value.candidates.some(c=>c.key==='dob'),'AI must extract a source-backed DOB');assert.equal(analysis.value.status.used,1);
const mapping=await post('/api/forms/map',{consent:true,fields:[{fieldId:'f1',label:'Applicant administrative division (district of residence)',type:'text',required:true,options:[]}]});
assert.ok(mapping.value.mappings.some(m=>m.fieldId==='f1'&&m.key==='district'),'AI must match the synthetic residential district label');assert.equal(mapping.value.status.used,2);
const chat=await post('/api/chat',{consent:true,workflow:{service:'pan',documentCount:1,documentAnalysis:'analysed',reviewedKeys:[],filledCount:0},messages:[{role:'user',text:'Documents upload karke AI se details nikal kar app mein form autofill kaise karun? Short steps batao.'}]});
assert.equal(typeof chat.value.text,'string');assert.ok(chat.value.text.trim().length>0);assert.equal(chat.value.status.used,3);
assert.ok(!/cannot read (?:your |uploaded )?documents|cannot fill (?:your |a |the )?form|can't read (?:your |uploaded )?documents/i.test(chat.value.text),'Chat must explain the real document/autofill capability');
console.log(JSON.stringify({result:'passed',documentAnalysisMs:analysis.ms,sourceBackedProposals:analysis.value.candidates.length,formMappingMs:mapping.ms,chatMs:chat.ms,qaInstallations:1,aiOperations:3,syntheticDataOnly:true}));
