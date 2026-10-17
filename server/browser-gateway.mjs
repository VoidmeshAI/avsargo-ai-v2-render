const paths=new Set(['start','frame','action','upload','close']);
export function browserGateway(token,fetcher=fetch){
 async function call(path,data){
  const r=await fetcher('http://127.0.0.1:3001'+path,{method:data===undefined?'GET':'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},...(data===undefined?{}:{body:JSON.stringify(data)}),redirect:'error',signal:AbortSignal.timeout(60000)});
  const value=await r.json();if(!r.ok)throw Object.assign(Error(value.error||'The application browser is unavailable.'),{status:r.status});return value;
 }
 return {status:()=>call('/health').catch(()=>({ready:false,state:'unavailable'})),send:(operation,owner,data)=>{if(!paths.has(operation))throw Object.assign(Error('Unsupported browser operation'),{status:400});return call('/v1/'+operation,{...data,owner});}};
}
