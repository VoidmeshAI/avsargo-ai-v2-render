// Only geometry, focus descriptors and a change counter leave this evaluation.
// Applicant values are never used as cache keys or exposed as focus metadata.
export function inspectView(){
 const key='__avsargoRemoteView_v1';
 if(!window[key]||window[key].root!==document.documentElement){
  window[key]?.observer.disconnect();
  const state={key:Date.now().toString(36)+Math.random().toString(36).slice(2),revision:0,root:document.documentElement};
  Object.defineProperty(window,key,{value:state,configurable:true});
  state.observer=new MutationObserver(()=>state.revision++);state.observer.observe(document.documentElement,{subtree:true,childList:true,characterData:true,attributes:true});
  for(const name of ['input','change'])document.addEventListener(name,()=>state.revision++,true);
 }
 const state=window[key],root=document.documentElement,body=document.body,e=document.activeElement;
 const focus={};
 if(e){
  focus.editable=['INPUT','TEXTAREA'].includes(e.tagName)&&e.type!=='file'&&!e.disabled;
  focus.secure=e.type==='password'||/otp|one.?time|captcha|cvv|security.?code|pin/i.test([e.name,e.id,e.autocomplete].join(' '));
  focus.options=e.tagName==='SELECT'?[...e.options].filter(o=>!o.disabled).slice(0,100).map(o=>({label:o.textContent.slice(0,100),value:o.value})):[];
  if(focus.editable||e.tagName==='SELECT'){const r=e.getBoundingClientRect();focus.bounds={x:r.x+window.scrollX,y:r.y+window.scrollY,width:r.width,height:r.height};}
 }
 const viewportOnly=[...document.querySelectorAll('iframe,[role="dialog"]')].some(node=>{const r=node.getBoundingClientRect();return r.width>200&&r.height>150&&r.bottom>0&&r.top<window.innerHeight&&getComputedStyle(node).visibility!=='hidden';});
 return {key:state.key,revision:state.revision,width:Math.ceil(Math.max(root.scrollWidth,root.clientWidth,body?.scrollWidth||0)),height:Math.ceil(Math.max(root.scrollHeight,root.clientHeight,body?.scrollHeight||0)),scrollX:window.scrollX,scrollY:window.scrollY,title:document.title.slice(0,150),focus,viewportOnly};
}
export function capturePlan(view,viewport,documentView){
 const width=Math.max(viewport.width,Number(view.width)||viewport.width),height=Math.max(viewport.height,Number(view.height)||viewport.height);
 // Bound both dimensions and total pixels before asking the browser to render.
 const full=!!documentView&&!view.viewportOnly&&height>viewport.height+2&&height<=12000&&width<=1440&&width*height<=6000000;
 return {mode:full?'document':'viewport',width:full?width:viewport.width,height:full?height:viewport.height};
}
export function jpegSize(bytes,fallback){
 for(let i=2;i+9<bytes.length;){
  if(bytes[i]!==255){i++;continue;}
  const marker=bytes[i+1];if(marker===216||marker===217){i+=2;continue;}
  const length=bytes.readUInt16BE(i+2);if(length<2||i+length+2>bytes.length)break;
  if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker))return {height:bytes.readUInt16BE(i+5),width:bytes.readUInt16BE(i+7)};
  i+=2+length;
 }
 return {width:fallback.width,height:fallback.height};
}
export function documentPointer(input,capture,revision){
 const x=Number(input.x),y=Number(input.y);
 if(!capture||capture.mode!=='document'||input.frameRevision!==revision)throw Object.assign(Error('This form view changed. Tap again on the refreshed page.'),{status:409});
 if(!Number.isFinite(x)||!Number.isFinite(y)||x<0||y<0||x>=capture.width||y>=capture.height)throw Object.assign(Error('Invalid pointer'),{status:400});
 return {x,y};
}
