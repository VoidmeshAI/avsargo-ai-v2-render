import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createApp,defaults,hash,localChatReply} from '../app.mjs';

const now=Date.parse('2026-10-16T17:50:00Z'),day='2026-10-16',token='t'.repeat(43),id=hash(token);
async function setup({used=0,maintenance=false,ready=true}={}){
 const config=defaults();Object.assign(config.ai,{enabled:ready,model:'gemini-test',freeDailyLimit:8});config.maintenance.enabled=maintenance;
 let state={config,secrets:{geminiKey:'test-only-key'},aiConnection:{status:'connected',provider:'gemini',model:'gemini-test',keyHash:hash('test-only-key')},admin:null,devices:{[id]:{created:now,day,used,plusUntil:0}},orders:{},registrations:{},usage:{[day]:used},audit:[]};
 const calls=[];
 const app=await createApp({store:{read:async()=>structuredClone(state),write:async next=>{state=structuredClone(next);}},setupHash:'unused',clock:()=>now,fetchImpl:async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});return Response.json({candidates:[{content:{parts:[{text:'Kis state se apply karna hai?'}]}}]});}});
 const send=(messages,extra={})=>app.fetch(new Request('https://test.example/api/chat',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({consent:true,messages,...extra})}));
 return {app,calls,send};
}
test('standalone English, Hinglish and Hindi greetings stay short and make zero provider calls',async()=>{
 const {app,calls,send}=await setup();
 for(const text of ['Hi','Hello!','hi bro','नमस्ते','Good morning']){const r=await send([{role:'user',text}]);assert.equal(r.status,200);const data=await r.json();assert.equal(data.local,true);assert.ok(data.text.length<100);assert.doesNotMatch(data.text,/android|website|companion|auto.?submit|API|settings/i);assert.equal(data.status.used,0);}
 assert.equal(calls.length,0);assert.equal(app.snapshot().usage[day],0);await app.close();
});
test('courtesy replies do not consume allowance even when the AI daily allowance is exhausted',async()=>{
 const {app,calls,send}=await setup({used:8});const r=await send([{role:'user',text:'Thank you bro!'}]);assert.equal(r.status,200);assert.equal((await r.json()).status.used,8);assert.equal(calls.length,0);assert.equal(app.snapshot().usage[day],8);await app.close();
});
test('greetings with a real question and short continuations retain their full AI conversation',async()=>{
 const {app,calls,send}=await setup();
 const messages=[{role:'user',text:'Hi'},{role:'assistant',text:'Hi! Kis form ya kaam mein madad chahiye?'},{role:'user',text:'Hello, income certificate ke liye kya chahiye?'}];
 const r=await send(messages,{workflow:{client:'web',companionConnected:false,documentCount:0}});assert.equal(r.status,200);assert.equal((await r.json()).status.used,1);assert.equal(calls.length,1);assert.equal(calls[0].body.contents.at(-1).parts[0].text,messages.at(-1).text);
 const instructions=calls[0].body.systemInstruction.parts[0].text;assert.match(instructions,/Answer the latest request directly/);assert.match(instructions,/unless the applicant asks about them or a specific requested action is actually blocked/);assert.doesNotMatch(instructions,/companionConnected is false, explain this once/);
 for(const text of ['ok','yes','hello PAN form fill karo','Hi-tech business registration','Thanks, next step kya hai?'])assert.equal(localChatReply([{role:'user',text}]),'');await app.close();
});
test('greeting fast path preserves authentication, consent, validation and maintenance checks',async()=>{
 const {app,send,calls}=await setup();assert.equal((await send([{role:'user',text:'Hi'}],{consent:false})).status,400);assert.equal((await send([{role:'assistant',text:'Hi'}])).status,400);assert.equal((await app.fetch(new Request('https://test.example/api/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({consent:true,messages:[{role:'user',text:'Hi'}]})}))).status,401);assert.equal(calls.length,0);await app.close();
 const held=await setup({maintenance:true});assert.equal((await held.send([{role:'user',text:'Hi'}])).status,503);assert.equal(held.calls.length,0);await held.app.close();
});
test('a greeting during an existing conversation does not reset the application question',()=>{
 assert.equal(localChatReply([{role:'user',text:'PAN ke liye help'},{role:'assistant',text:'Details?'},{role:'user',text:'Hi'}]),'Hi! Aage kya madad chahiye?');
});
