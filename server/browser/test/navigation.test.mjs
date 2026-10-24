import {test} from 'node:test';
import assert from 'node:assert/strict';
import {openPortal} from '../navigation.mjs';
const url='https://ssc.gov.in/';
test('opening a portal uses a bounded navigation timeout',async()=>{let options;await openPortal({goto:async(target,input)=>{assert.equal(target,url);options=input;}},url);assert.deepEqual(options,{waitUntil:'domcontentloaded',timeout:20000});});
test('an unreachable portal reports its loading failure instead of pretending the browser started',async()=>{
 for(const [name,status]of [['TimeoutError',504],['Error',502]]){
  const page={goto:async()=>{throw Object.assign(Error('PRIVATE URL AND REQUEST'),{name});},url:()=> 'about:blank'};
  await assert.rejects(openPortal(page,url),error=>error.status===status&&/official portal/.test(error.message)&&!error.message.includes('PRIVATE'));
 }
});
test('an already usable official page survives a slow navigation completion',async()=>{
 const page={goto:async()=>{throw Object.assign(Error('timed out'),{name:'TimeoutError'});},url:()=>url,evaluate:async()=>true};
 await assert.doesNotReject(openPortal(page,url));page.evaluate=async()=>false;await assert.rejects(openPortal(page,url),error=>error.status===504);
});
