// Opt-in real account check. The workflow runs this only for commits explicitly
// marked [verify live AI]; ordinary deployments do not consume provider usage.
import assert from 'node:assert/strict';
const origin='https://avsargo-ai-admin-production.up.railway.app';
const request=(path,options={})=>fetch(origin+path,{...options,redirect:'error',signal:AbortSignal.timeout(45000)});
let config;
for(let i=0;i<12;i++){config=await(await request('/api/app/config')).json();if(config.ai?.ready)break;await new Promise(resolve=>setTimeout(resolve,5000));}
assert.equal(config.ai?.ready,true,'Saved AI connection must pass its real server verification before chat');
const register=await request('/api/device/register',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});assert.equal(register.status,200);const device=await register.json();assert.ok(device.token);
const started=Date.now();
const response=await request('/api/chat',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+device.token},body:JSON.stringify({consent:true,messages:[{role:'user',text:'Hi, reply with a short greeting.'}]})});
const data=await response.json();assert.equal(response.status,200,data.error||'Live chat must return an AI reply');assert.equal(typeof data.text,'string');assert.ok(data.text.trim().length>0);assert.equal(data.status.used,1);
console.log('Live saved-key AI check passed: actual Android chat endpoint returned a text reply in '+(Date.now()-started)+'ms. One QA installation and one short AI chat were used. Credentials and reply content were not logged.');
