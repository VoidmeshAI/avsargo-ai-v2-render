// Credentials are sent only in headers. Provider bodies and exception messages
// are never returned to users or included in diagnostics.
export class ProviderError extends Error {
  constructor(status,code,message,httpStatus=0){super(message);this.status=status;this.code=code;this.httpStatus=httpStatus;}
}
const error=(status,code,message,httpStatus)=>new ProviderError(status,code,message,httpStatus);
export function transportError(cause){
  const codes=[cause?.name,cause?.code,cause?.cause?.code,...(cause?.cause?.errors||[]).map(e=>e.code)];
  if(codes.some(c=>['TimeoutError','AbortError','ETIMEDOUT','UND_ERR_CONNECT_TIMEOUT','UND_ERR_HEADERS_TIMEOUT','UND_ERR_BODY_TIMEOUT'].includes(c)))return error(504,'PROVIDER_TIMEOUT','AI reply timed out. Test the connection again; a faster model will be selected automatically.');
  if(codes.some(c=>['ENOTFOUND','EAI_AGAIN'].includes(c)))return error(502,'PROVIDER_DNS','The server could not resolve the AI provider. Try Test connection again shortly.');
  if(codes.some(c=>['CERT_HAS_EXPIRED','UNABLE_TO_VERIFY_LEAF_SIGNATURE','ERR_TLS_CERT_ALTNAME_INVALID'].includes(c)))return error(502,'PROVIDER_TLS','The server could not verify the AI provider connection. Contact support.');
  return error(502,'PROVIDER_NETWORK','The server could not reach the AI provider. Try Test connection again shortly.');
}
export function createProviderClient({fetchImpl=fetch,report=()=>{}}={}){
  async function request(url,options={},signal=AbortSignal.timeout(35000)){
    const host=new URL(url).hostname;let response;
    try{response=await fetchImpl(url,{...options,redirect:'error',signal});}
    catch(cause){const e=transportError(cause);report({event:'provider_failure',host,code:e.code});throw e;}
    let data;try{data=await response.json();}catch(cause){
      if(signal.aborted)throw transportError(cause);
      if(response.ok)throw error(502,'PROVIDER_RESPONSE','The AI provider returned an unreadable response. Try again.');
    }
    if(!response.ok){
      const reason=(data?.error?.details||[]).map(d=>d.reason).find(r=>['API_KEY_INVALID','API_KEY_EXPIRED','API_KEY_SERVICE_BLOCKED','API_KEY_HTTP_REFERRER_BLOCKED','API_KEY_IP_ADDRESS_BLOCKED'].includes(r));
      let e;
      if(reason||response.status===401||response.status===403)e=error(502,'PROVIDER_KEY','API key rejected or restricted. Check the key and its server/API permissions, save it, then test again.',response.status);
      else if(response.status===402||data?.error?.status==='FAILED_PRECONDITION')e=error(502,'PROVIDER_BILLING','The AI provider requires billing or credits for this key. Check the provider account, then test again.',response.status);
      else if(response.status===429)e=error(503,'PROVIDER_QUOTA','AI provider quota or credits are exhausted, or its rate limit was reached. Check the provider account and try later.',response.status);
      else if(response.status===400||response.status===404)e=error(502,'MODEL_UNAVAILABLE','This model is not available for chat with the saved key. Test connection to select another model.',response.status);
      else if(response.status>=500)e=error(503,'PROVIDER_UNAVAILABLE','The AI provider is temporarily unavailable. Try again shortly.',response.status);
      else e=error(502,'PROVIDER_REQUEST','The AI provider rejected the request. Test connection or check the provider account.',response.status);
      report({event:'provider_failure',host,code:e.code,httpStatus:response.status});throw e;
    }
    return data;
  }
  return {request};
}
const specialised=/image|vision-preview|audio|tts|live|realtime|embedding|robotics|computer-use|research|codex|search|moderation|instruct|transcrib|whisper|dall-e|sora|lyria/i;
export function rankModels(provider,items){
  const models=items.map(m=>typeof m==='string'?{id:m}:m).filter(m=>/^[a-zA-Z0-9._-]{1,100}$/.test(m.id)&&!specialised.test(m.id));
  const score=m=>{
    const id=m.id,preview=/preview|exp(?:erimental)?/.test(id)?10000:0,version=Number(id.match(/(?:gemini-|gpt-)(\d+(?:\.\d+)?)/)?.[1]||0);
    if(provider==='gemini')return preview+(id.includes('flash-lite')?0:id.includes('flash')?1000:5000)-version*10;
    // Non-reasoning mini models are a fast, economical default for this app.
    return preview+(id.startsWith('gpt-4.1-mini')?0:id.startsWith('gpt-4o-mini')?10:id.includes('mini')?100:id.includes('nano')?200:1000)-version;
  };
  return [...new Map(models.filter(m=>provider==='gemini'?/^gemini-/.test(m.id):/^gpt-[4-9]/.test(m.id)).map(m=>[m.id,m])).values()].sort((a,b)=>score(a)-score(b)||a.id.localeCompare(b.id));
}
export async function discoverModels(client,provider,key,signal){
  const headers=provider==='gemini'?{'x-goog-api-key':key}:{authorization:'Bearer '+key};
  if(provider==='openai'){
    const data=await client.request('https://api.openai.com/v1/models',{headers},signal);
    return rankModels(provider,(data.data||[]).map(m=>({id:m.id})));
  }
  const models=[];let page='';const seen=new Set();
  for(let i=0;i<10;i++){
    const url='https://generativelanguage.googleapis.com/v1beta/models?pageSize=100'+(page?'&pageToken='+encodeURIComponent(page):'');
    const data=await client.request(url,{headers},signal);
    for(const m of data.models||[])if(m.supportedGenerationMethods?.includes('generateContent'))models.push({id:String(m.name||'').replace(/^models\//,''),outputTokenLimit:m.outputTokenLimit});
    page=data.nextPageToken||'';if(!page||seen.has(page))break;seen.add(page);
  }
  return rankModels(provider,models);
}
export function geminiGeneration(model,maxOutputTokens){
  const generation={maxOutputTokens};
  // Gemini 3.8 Flash supports LOW, not MINIMAL. Never send a thinking level to 2.x.
  if(/^gemini-3/.test(model))generation.thinkingConfig={thinkingLevel:/^gemini-(3\.5-flash-lite|3\.6-flash|3-flash-preview)/.test(model)?'MINIMAL':'LOW'};
  else if(/^gemini-2\.5-flash/.test(model))generation.thinkingConfig={thinkingBudget:0};
  return generation;
}
export async function generateReply(client,{provider,model,key,prompt,messages,maxOutputTokens,schema},signal){
  let answer;
  if(provider==='gemini'){
    const generationConfig=geminiGeneration(model,maxOutputTokens);
    if(schema)Object.assign(generationConfig,{responseMimeType:'application/json',responseJsonSchema:schema});
    const data=await client.request('https://generativelanguage.googleapis.com/v1beta/models/'+encodeURIComponent(model)+':generateContent',{method:'POST',headers:{'content-type':'application/json','x-goog-api-key':key},body:JSON.stringify({systemInstruction:{parts:[{text:prompt}]},contents:messages.map(m=>({role:m.role==='user'?'user':'model',parts:[{text:m.text}]})),generationConfig})},signal);
    answer=(data.candidates?.[0]?.content?.parts||[]).filter(p=>!p.thought).map(p=>p.text||'').join('\n');
  }else{
    const payload={model,messages:[{role:'system',content:prompt},...messages.map(m=>({role:m.role,content:m.text}))],max_completion_tokens:maxOutputTokens,store:false};
    if(schema)payload.response_format={type:'json_schema',json_schema:{name:'avsargo_application',strict:true,schema}};
    if(/^gpt-[5-9]/.test(model))payload.reasoning_effort='low';
    const data=await client.request('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+key},body:JSON.stringify(payload)},signal);
    answer=data.choices?.[0]?.message?.content;
  }
  if(typeof answer!=='string'||!answer.trim())throw error(502,'EMPTY_AI_REPLY','The AI did not return a text reply. Test connection to select a working model.');
  return answer.slice(0,schema?40000:15000);
}
export async function testSavedProvider(client,{provider,key,prompt},clock=Date.now){
  const started=clock(),overall=AbortSignal.timeout(42000);
  const models=await discoverModels(client,provider,key,AbortSignal.any([overall,AbortSignal.timeout(10000)]));
  if(!models.length)throw error(502,'NO_CHAT_MODEL','No supported chat model is available for this key. Check its API permissions and account access.');
  let last;
  for(const model of models.slice(0,3)){
    try{
      await generateReply(client,{provider,model:model.id,key,prompt,messages:[{role:'user',text:'Connection test. Reply with OK only.'}],maxOutputTokens:Math.min(1024,model.outputTokenLimit||1024)},AbortSignal.any([overall,AbortSignal.timeout(20000)]));
      return {model:model.id,outputTokenLimit:model.outputTokenLimit||8192,latencyMs:Math.max(0,clock()-started)};
    }catch(e){last=e;if(overall.aborted||!['MODEL_UNAVAILABLE','EMPTY_AI_REPLY','PROVIDER_TIMEOUT'].includes(e.code))throw e;}
  }
  throw last;
}
