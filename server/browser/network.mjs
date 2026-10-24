import {official,publicResource} from './guards.mjs';

// Playwright may emit a popup's navigation before its Frame exists. Treat that
// request as a top-level navigation and keep the same destination restrictions.
// A rejected or already-handled route must never reject out of this callback.
export function portalRoute({fixture,resourceAllowed=publicResource,navigationAllowed=official,report=()=>{}}={}){
 return async route=>{
  try{
   const request=route.request(),url=request.url(),navigation=request.isNavigationRequest();
   let topLevel=false;
   if(navigation){try{topLevel=!request.frame().parentFrame();}catch{topLevel=true;}}
   if(fixture&&url==='https://avsargo-selfcheck.invalid/'){await route.fulfill({contentType:'text/html',body:fixture});return;}
   if(!await resourceAllowed(url)||navigation&&topLevel&&!navigationAllowed(url)){await route.abort('blockedbyclient');return;}
   await route.continue();
  }catch(error){
   // No URL, headers, form values, or request bodies enter diagnostics.
   try{report({event:'browser_route_error',kind:error?.name||'Error'});}catch{}
   await route.abort('blockedbyclient').catch(()=>{});
  }
 };
}
