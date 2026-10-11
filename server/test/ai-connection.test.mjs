import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createApp,hash,defaults} from '../app.mjs';
import {rankModels,geminiGeneration,transportError} from '../ai-provider.mjs';
const origin='https://qa.example',secret='private_test_api_key',setup='private_test_owner_setup';
const json=(data,status=200)=>new Response(JSON.stringify(data),{status});
const models=(ids=['gemini-3.8-flash','gemini-3.5-flash-lite'])=>json({models:ids.map(id=>({name:'models/'+id,supportedGenerationMethods:['generateContent'],outputTokenLimit:65536}))});
const reply=()=>json({candidates:[{content:{parts:[{thought:true,text:'private reasoning'},{text:'OK'}]}}]});
async function fixture(providerFetch=async url=>url.includes('models?')?models():reply(),initial=null){
  let state=initial;const events=[],calls=[];
  const store={read:async()=>structuredClone(state),write:async value=>{state=structuredClone(value);}};
  const app=await createApp({store,origin,setupHash:hash(setup),report:event=>events.push(event),fetchImpl:async(...args)=>{calls.push(args);return providerFetch(...args);}});
  let cookie='',csrf='';
  async function req(path,method='GET',data,extra={}){const response=await app.fetch(new Request(origin+path,{method,headers:{origin,cookie,'x-csrf-token':csrf,'content-type':'application/json',...extra},body:data===undefined?undefined:JSON.stringify(data)}));return {status:response.status,data:await response.json(),response};}
  async function owner(){const r=await req('/api/admin/setup','POST',{username:'qa_owner',password:'QA password over 12 chars',token:setup});assert.equal(r.status,200);cookie=r.response.headers.get('set-cookie').split(';')[0];csrf=r.data.csrf;}
  const save=(changes={},keys={geminiKey:secret},removeKeys=[])=>{const config=app.snapshot().config;Object.assign(config.ai,changes);return req('/api/admin/config','PUT',{config,keys,removeKeys,revision:config.revision});};
  const run=()=>req('/api/admin/ai/test','POST',{revision:app.snapshot().config.revision});
  return {app,store,events,calls,req,owner,save,run};
}
test('a saved key alone is unverified; Test selects a listed model, generates a real reply and enables AI',async()=>{
  const f=await fixture();await f.owner();assert.equal((await f.save()).status,200);
  assert.equal((await f.req('/api/app/config')).data.ai.ready,false);
  assert.equal(f.app.snapshot().config.ai.model,'');assert.equal(f.calls.length,0);
  const r=await f.run();assert.equal(r.status,200);assert.equal(r.data.connection.model,'gemini-3.5-flash-lite');
  assert.equal(f.calls.length,2);assert.equal(f.calls[1][1].headers['x-goog-api-key'],secret);
  const payload=JSON.parse(f.calls[1][1].body);assert.equal(payload.generationConfig.thinkingConfig.thinkingLevel,'MINIMAL');assert.equal(payload.contents[0].parts[0].text,'Connection test. Reply with OK only.');
  assert.equal((await f.req('/api/app/config')).data.ai.ready,true);
  assert.equal((await f.req('/api/admin/config')).data.config.ai.enabled,true);
  assert.ok(!JSON.stringify(r.data).includes(secret));assert.ok(!JSON.stringify(f.events).includes(secret));
  assert.deepEqual(f.app.snapshot().usage,{});
});
test('Test requires an authenticated owner, CSRF, same origin, saved key and fresh revision',async()=>{
  const f=await fixture();assert.equal((await f.run()).status,401);await f.owner();assert.equal((await f.run()).status,400);await f.save();
  assert.equal((await f.req('/api/admin/ai/test','POST',{revision:2},{'x-csrf-token':'wrong'})).status,403);
  assert.equal((await f.req('/api/admin/ai/test','POST',{revision:2},{origin:'https://evil.example'})).status,403);
  assert.equal((await f.req('/api/admin/ai/test','POST',{revision:1})).status,409);assert.equal(f.calls.length,0);
});
test('manual model input is ignored; replacing the active key invalidates the connection',async()=>{
  const f=await fixture();await f.owner();await f.save({model:'made-up-model'});assert.equal(f.app.snapshot().config.ai.model,'');await f.run();
  await f.save({model:'gemini-expensive-pro'});assert.equal(f.app.snapshot().config.ai.model,'gemini-3.5-flash-lite');assert.equal((await f.req('/api/app/config')).data.ai.ready,true);
  await f.save({}, {geminiKey:'replacement_private_key'});assert.equal(f.app.snapshot().config.ai.model,'');assert.equal((await f.req('/api/app/config')).data.ai.ready,false);
});
test('key removal preserves the owner and disables AI; blank input preserves a saved key',async()=>{
  const f=await fixture();await f.owner();await f.save();await f.run();await f.save({}, {geminiKey:''});assert.equal(f.app.snapshot().secrets.geminiKey,secret);
  assert.equal((await f.save({}, {}, ['geminiKey'])).status,200);assert.equal(f.app.snapshot().secrets.geminiKey,undefined);assert.equal(f.app.snapshot().config.ai.enabled,false);assert.equal(f.app.snapshot().admin.username,'qa_owner');
});
test('switching providers requires a new test and OpenAI uses a compatible mini model',async()=>{
  const f=await fixture(async(url,options)=>url.includes('/v1/models')?json({data:[{id:'whisper-1'},{id:'gpt-image-1'},{id:'gpt-4.1-mini'},{id:'gpt-5-mini'}]}):url.includes('/chat/completions')?json({choices:[{message:{content:'OK'}}]}):url.includes('models?')?models():reply());
  await f.owner();await f.save();await f.run();await f.save({provider:'openai'},{openaiKey:'private_openai_key'});assert.equal((await f.req('/api/app/config')).data.ai.ready,false);assert.equal((await f.run()).status,200);
  const call=f.calls.at(-1),payload=JSON.parse(call[1].body);assert.equal(payload.model,'gpt-4.1-mini');assert.equal(payload.store,false);assert.equal(payload.messages[1].content,'Connection test. Reply with OK only.');assert.equal(payload.max_completion_tokens,1024);
});
test('discovery handles pagination and excludes non-chat models; an unsupported model falls back',async()=>{
  const f=await fixture(async url=>url.includes('pageToken=next')?models(['gemini-3.8-flash']):url.includes('models?')?json({models:[{name:'models/gemini-3.5-flash-lite',supportedGenerationMethods:['generateContent']},{name:'models/gemini-image-preview',supportedGenerationMethods:['generateContent']}],nextPageToken:'next'}):url.includes('3.5-flash-lite')?json({error:{message:secret}},404):reply());
  await f.owner();await f.save();const r=await f.run();assert.equal(r.status,200);assert.equal(r.data.connection.model,'gemini-3.8-flash');assert.equal(f.calls.length,4);assert.equal(JSON.parse(f.calls.at(-1)[1].body).generationConfig.thinkingConfig.thinkingLevel,'LOW');
});
test('invalid key, quota, billing and network errors are actionable, never report connected or leak provider details',async()=>{
  for(const [status,body,code]of [[400,{error:{message:secret,details:[{reason:'API_KEY_INVALID'}]}},'PROVIDER_KEY'],[403,{error:{message:secret}},'PROVIDER_KEY'],[429,{error:{message:secret}},'PROVIDER_QUOTA'],[400,{error:{status:'FAILED_PRECONDITION',message:secret}},'PROVIDER_BILLING']]){
    const f=await fixture(async()=>json(body,status));await f.owner();await f.save();const r=await f.run();assert.equal(r.data.code,code);assert.equal(f.calls.length,1);assert.equal((await f.req('/api/app/config')).data.ai.ready,false);assert.equal((await f.req('/api/admin/config')).data.aiConnection.status,'failed');assert.ok(!JSON.stringify(r.data).includes(secret));assert.ok(!JSON.stringify(f.events).includes(secret));
  }
  const f=await fixture(async()=>{throw Object.assign(new Error(secret),{cause:{code:'EAI_AGAIN'}});});await f.owner();await f.save();assert.equal((await f.run()).data.code,'PROVIDER_DNS');
});
test('a model list without a text reply cannot pass the test',async()=>{
  const f=await fixture(async url=>url.includes('models?')?models(['gemini-3.5-flash-lite']):json({candidates:[{content:{parts:[{thought:true,text:'hidden reasoning'}]}}]}));await f.owner();await f.save();const r=await f.run();assert.equal(r.data.code,'EMPTY_AI_REPLY');assert.equal((await f.req('/api/app/config')).data.ai.ready,false);
});
test('settings changed during an in-flight test cannot activate the old key or overwrite new settings',async()=>{
  let start,release;const entered=new Promise(resolve=>start=resolve),paused=new Promise(resolve=>release=resolve);
  const f=await fixture(async url=>{if(url.includes('models?'))return models();start();await paused;return reply();});await f.owner();await f.save();const running=f.run();await entered;
  assert.equal((await f.run()).status,409);assert.equal((await f.save({}, {geminiKey:'new_private_key'})).status,200);release();assert.equal((await running).status,409);assert.equal(f.app.snapshot().secrets.geminiKey,'new_private_key');assert.equal((await f.req('/api/app/config')).data.ai.ready,false);
});
test('verified connection survives restart; a legacy enabled installation is tested only once during migration',async()=>{
  const f=await fixture();await f.owner();await f.save();await f.run();const state=f.app.snapshot();delete state.aiConnection;
  const migrated=await fixture(undefined,state);assert.equal((await migrated.app.migrateAI()).ok,true);assert.equal((await migrated.app.migrateAI()).skipped,true);assert.equal(migrated.calls.length,2);assert.equal(migrated.app.snapshot().admin.password,state.admin.password);
  const restarted=await fixture(undefined,migrated.app.snapshot());assert.equal((await restarted.app.migrateAI()).skipped,true);assert.equal((await restarted.req('/api/app/config')).data.ai.ready,true);assert.equal(restarted.calls.length,0);
  const failed=await fixture(async()=>json({},403),state);await assert.rejects(failed.app.migrateAI());assert.equal((await failed.app.migrateAI()).skipped,true);assert.equal(failed.calls.length,1);
});
test('model choice stays text-only and low-latency settings respect model capabilities',()=>{
  assert.deepEqual(rankModels('gemini',['gemini-3.8-flash','gemini-3.5-flash-lite','gemini-3.5-flash-lite-preview','gemini-3.1-flash-lite-image','gemini-embedding-001','gemini-robotics-er-2-preview']).map(m=>m.id),['gemini-3.5-flash-lite','gemini-3.8-flash','gemini-3.5-flash-lite-preview']);
  assert.deepEqual(geminiGeneration('gemini-3.8-flash',1200).thinkingConfig,{thinkingLevel:'LOW'});assert.deepEqual(geminiGeneration('gemini-2.5-flash',1200).thinkingConfig,{thinkingBudget:0});assert.equal(geminiGeneration('gemini-2.0-flash',1200).thinkingConfig,undefined);
  assert.equal(transportError(new DOMException('secret exception','TimeoutError')).code,'PROVIDER_TIMEOUT');
});
