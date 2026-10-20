import {test} from 'node:test';
import assert from 'node:assert/strict';
import {BrowserSessions} from '../engine.mjs';
import {inspectView,capturePlan,jpegSize,documentPointer} from '../view.mjs';

function jpeg(width,height){const b=Buffer.alloc(25);b[0]=255;b[1]=216;b[2]=255;b[3]=192;b.writeUInt16BE(17,4);b[6]=8;b.writeUInt16BE(height,7);b.writeUInt16BE(width,9);return b;}
function fixture(documentView=true){
 let now=10000,shots=0,scans=0;
 const clicks=[],view={key:'document-one',revision:0,width:390,height:3500,scrollX:0,scrollY:0,title:'Official fixture',focus:{editable:false,secure:false,options:[]}};
 const page={isClosed:()=>false,url:()=> 'https://ssc.gov.in/form',evaluate:async(fn,data)=>{
  if(fn===inspectView)return structuredClone(view);
  if(data?.mode==='scan'){scans++;return {signature:'fields',flags:{},candidates:[],uploads:[]};}
  if(data&&Object.hasOwn(data,'x')&&Object.hasOwn(data,'height')){view.scrollY=Math.max(0,data.y-data.height/2);return {x:0,y:view.scrollY};}
  if(data&&Object.hasOwn(data,'dy')){view.scrollY+=data.dy;return true;}
  throw Error('Unexpected browser operation');
 },screenshot:async options=>{shots++;if(options.caret!=='initial')view.revision++;return jpeg(390,options.fullPage?view.height:600);},mouse:{click:async(x,y)=>clicks.push({x,y}),wheel:async()=>{}},keyboard:{insertText:async()=>{},press:async()=>{}}};
 const engine=new BrowserSessions({}, {clock:()=>now});
 const session={id:'session-one',owner:'a'.repeat(64),browser:{close:async()=>{}},context:{},page,width:390,height:600,created:now,touched:now,queue:Promise.resolve(),profile:{fields:{},meta:{}},documents:[],enabled:false,filledCount:0,attachedCount:0,documentView};engine.sessions.set(session.id,session);
 return {engine,session,view,clicks,counts:()=>({shots,scans}),advance:ms=>now+=ms,frame:input=>engine.frame(session.owner,session.id,input),action:input=>engine.action(session.owner,session.id,input),done:()=>engine.shutdown()};
}
test('mobile document view preloads a scrollable form but bounds tall and oversized pages',()=>{
 const viewport={width:390,height:600};assert.equal(capturePlan({width:390,height:3500},viewport,true).mode,'document');
 for(const view of [{width:390,height:30000},{width:1900,height:2000},{width:1440,height:11000}])assert.equal(capturePlan(view,viewport,true).mode,'viewport');
 assert.equal(capturePlan({width:390,height:3500},viewport,false).mode,'viewport');
 assert.deepEqual(jpegSize(jpeg(390,3500),viewport),{width:390,height:3500});
});
test('unchanged frame polls scan and capture once, then transfer metadata without the image',async()=>{
 const f=fixture();try{const initial=await f.frame();assert.equal(initial.capture.mode,'document');assert.equal(initial.capture.height,3500);
 for(let i=0;i<8;i++){const frame=await f.frame({since:initial.frameRevision});assert.equal(frame.unchanged,true);assert.equal(frame.image,undefined);}
 assert.deepEqual(f.counts(),{shots:1,scans:1});const legacy=await f.frame();assert.ok(legacy.image.startsWith('data:image/jpeg;base64,'));assert.deepEqual(f.counts(),{shots:1,scans:1});
 }finally{await f.done();}
});
test('changed fields invalidate the image, while cached form guards are periodically rechecked',async()=>{
 const f=fixture();try{const first=await f.frame();f.view.revision++;const second=await f.frame({since:first.frameRevision});assert.equal(second.unchanged,false);assert.ok(second.image);assert.equal(second.frameRevision,first.frameRevision+1);f.advance(2100);await f.frame({since:second.frameRevision});assert.deepEqual(f.counts(),{shots:2,scans:3});f.advance(5000);await f.frame({since:second.frameRevision});assert.equal(f.counts().shots,3);}finally{await f.done();}
});
test('a click far below the viewport scrolls and clicks in one ordered operation',async()=>{
 const f=fixture();try{const first=await f.frame();await f.action({action:'click',coordinateSpace:'document',frameRevision:first.frameRevision,x:120,y:2400});assert.deepEqual(f.clicks,[{x:120,y:300}]);assert.equal(f.view.scrollY,2100);assert.equal(f.counts().shots,2);}finally{await f.done();}
});
test('stale or changed document views cannot click a new field by old coordinates',async()=>{
 const f=fixture();try{const first=await f.frame();f.view.revision++;await assert.rejects(f.action({action:'click',coordinateSpace:'document',frameRevision:first.frameRevision,x:120,y:2400}),e=>e.status===409);assert.equal(f.clicks.length,0);assert.throws(()=>documentPointer({x:1,y:2,frameRevision:0},first.capture,first.frameRevision),e=>e.status===409);assert.throws(()=>documentPointer({x:-1,y:2,frameRevision:first.frameRevision},first.capture,first.frameRevision),e=>e.status===400);}finally{await f.done();}
});
test('a recent displayed image can still be clicked after an unchanged refresh overtakes it',async()=>{
 const f=fixture();try{const displayed=await f.frame();f.advance(5100);const refreshed=await f.frame({since:displayed.frameRevision});assert.ok(refreshed.frameRevision>displayed.frameRevision);await f.action({action:'click',coordinateSpace:'document',frameRevision:displayed.frameRevision,x:120,y:2400});assert.equal(f.clicks.length,1);assert.ok(f.session.captureHistory.size<=4);}finally{await f.done();}
});
test('legacy viewport scrolling captures the new scroll position immediately',async()=>{
 const f=fixture(false);try{await f.frame();const moved=await f.action({action:'scroll',dy:350});assert.equal(moved.scrollY,350);assert.equal(moved.capture.mode,'viewport');assert.equal(f.counts().shots,2);}finally{await f.done();}
});
test('session ownership protects cached images and closing clears temporary capture data',async()=>{
 const f=fixture();await f.frame();await assert.rejects(f.engine.frame('b'.repeat(64),f.session.id),e=>e.status===404);await f.engine.close(f.session.owner,f.session.id);assert.equal(f.session.cachedImage,null);assert.equal(f.session.scanCache,null);await f.done();
});
