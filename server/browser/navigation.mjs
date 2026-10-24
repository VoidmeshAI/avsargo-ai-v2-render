import {official} from './guards.mjs';

export async function openPortal(page,url){
 try{await page.goto(url,{waitUntil:'domcontentloaded',timeout:20000});}
 catch(error){
  // A slow subresource can outlast navigation even when the usable page is ready.
  const usable=official(page.url())&&await page.evaluate(()=>document.readyState!=='loading'&&!!document.body?.textContent.trim()).catch(()=>false);
  if(usable)return;
  const timeout=error?.name==='TimeoutError';
  throw Object.assign(Error(timeout?'The official portal did not respond in time. Try Reopen form shortly.':'The official portal could not be reached. Try Reopen form shortly.'),{status:timeout?504:502});
 }
}
