import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const origin='https://avsargo-ai-admin-production.up.railway.app';
async function get(path){let error;for(let i=0;i<4;i++){try{return await fetch(origin+path,{redirect:'error',signal:AbortSignal.timeout(45000)});}catch(e){error=e;await new Promise(r=>setTimeout(r,3000));}}throw error;}
const expectedAdmin=await readFile(new URL('../server/public/admin.js',import.meta.url),'utf8');
let liveAdmin='';for(let i=0;i<20;i++){const js=await get('/admin.js');if(js.status===200)liveAdmin=await js.text();if(liveAdmin===expectedAdmin)break;if(i<19)await new Promise(r=>setTimeout(r,5000));}
assert.equal(liveAdmin===expectedAdmin,true,'Live admin JavaScript must match the checked-in repair');
const health=await get('/health');assert.equal(health.status,200);assert.equal((await health.json()).version,15);
const config=await get('/api/app/config');assert.equal(config.status,200);const data=await config.json();assert.ok(data.branding?.name);assert.equal(typeof data.ai.ready,'boolean');assert.equal(typeof data.payment.ready,'boolean');assert.equal(data.secrets,undefined);
assert.equal((await get('/api/admin/config')).status,401);
const session=await get('/api/admin/session');assert.equal(session.status,200);const sessionData=await session.json();assert.equal(sessionData.authenticated,false);assert.equal(typeof sessionData.setupRequired,'boolean');
const longBody=JSON.stringify({consent:true,messages:Array.from({length:15},(_,i)=>({role:i%2?'assistant':'user',text:'क'.repeat(4000)}))});
const unauthorized=await fetch(origin+'/api/chat',{method:'POST',headers:{'content-type':'application/json'},body:longBody,redirect:'error',signal:AbortSignal.timeout(45000)});assert.equal(unauthorized.status,401);
const html=await get('/admin');assert.equal(html.status,200);assert.ok((await html.text()).includes('YOUR CONTROL ROOM'));
assert.ok(liveAdmin.includes("api('admin/ai/test'"));assert.ok(!liveAdmin.includes('Model ID'));assert.ok(!liveAdmin.includes('Check key & list models'));
const testUnauthorized=await fetch(origin+'/api/admin/ai/test',{method:'POST',headers:{'content-type':'application/json'},body:'{}',redirect:'error',signal:AbortSignal.timeout(45000)});assert.equal(testUnauthorized.status,401);
console.log('Live HTTPS checks passed: repaired admin JavaScript, health, public configuration, admin authentication boundary, session and admin page. Owner setup required: '+sessionData.setupRequired+'. Owner setup was not consumed.');
