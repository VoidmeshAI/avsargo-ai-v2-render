import assert from 'node:assert/strict';
const origin='https://avsargo-ai-admin-production.up.railway.app';
async function get(path){let error;for(let i=0;i<4;i++){try{return await fetch(origin+path,{redirect:'error',signal:AbortSignal.timeout(45000)});}catch(e){error=e;await new Promise(r=>setTimeout(r,3000));}}throw error;}
const health=await get('/health');assert.equal(health.status,200);assert.equal((await health.json()).version,13);
const config=await get('/api/app/config');assert.equal(config.status,200);const data=await config.json();assert.ok(data.branding?.name);assert.equal(typeof data.ai.ready,'boolean');assert.equal(typeof data.payment.ready,'boolean');assert.equal(data.secrets,undefined);
assert.equal((await get('/api/admin/config')).status,401);
const session=await get('/api/admin/session');assert.equal(session.status,200);assert.equal((await session.json()).authenticated,false);
const html=await get('/admin');assert.equal(html.status,200);assert.ok((await html.text()).includes('YOUR CONTROL ROOM'));
console.log('Live HTTPS checks passed: health, public configuration, admin authentication boundary, session and admin page. Owner setup was not consumed.');
