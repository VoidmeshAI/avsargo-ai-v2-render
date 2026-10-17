import assert from 'node:assert/strict';
export async function selfTest(engine){
 const owner='a'.repeat(64),other='b'.repeat(64),checks=[];let first,second;
 const fixture=`<!doctype html><html><body><form onsubmit="window.submissions++;event.preventDefault()"><label>Applicant name<input name="fullName"></label><label>Email<input name="email" value="kept@example.test"></label><label>Date of birth<input name="dob" type="date"></label><label>State<select name="state"><option value="">Choose state</option><option value="BR">Bihar</option></select></label><label>Passport size photo<input type="file" name="photo" accept="image/png"></label><button type="submit">Submit</button></form><script>window.submissions=0</script></body></html>`;
 const profile={fullName:'Self Test Applicant',email:'replace@example.test',dob:'21/01/2000',state:'Bihar',mobile:'9876543210'};
 const documents=[{id:'photo1',name:'photo.png',mime:'image/png',type:'photo'}];
 try{
  first=await engine.start(owner,{consent:true,profile,documents,width:1000,height:700},{fixture});const s=engine.get(owner,first.sessionId);
  let values=await s.page.evaluate(()=>Object.fromEntries([...document.querySelectorAll('input,select')].map(e=>[e.name,e.value])));assert.equal(values.fullName,profile.fullName);assert.equal(values.email,'kept@example.test');assert.equal(values.dob,'2000-01-21');assert.equal(values.state,'BR');checks.push('blank fields, dates and selects fill; existing values remain');
  assert.ok(first.image.startsWith('data:image/jpeg;base64,'));checks.push('live viewport frame renders');
  const file=first.uploads[0];await engine.upload(owner,first.sessionId,{signature:first.signature,fieldId:file.fieldId,documentId:'photo1',data:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j3XcAAAAASUVORK5CYII='});assert.equal(await s.page.locator('input[type=file]').evaluate(e=>e.files.length),1);checks.push('matching saved document attaches');
  assert.equal(await s.page.evaluate(()=>window.submissions),0);checks.push('autofill never submits');
  await s.page.evaluate(()=>{const label=document.createElement('label');label.textContent='Mobile number';const e=document.createElement('input');e.name='mobile';label.append(e);document.body.append(label);});await engine.frame(owner,first.sessionId);assert.equal(await s.page.locator('[name=mobile]').inputValue(),profile.mobile);checks.push('new form step fills automatically');
  await s.context.addCookies([{name:'isolation',value:'first',url:'https://avsargo-selfcheck.invalid'}]);
  await assert.rejects(engine.frame(other,first.sessionId),e=>e.status===404);checks.push('another workspace cannot access the session');
  await s.page.setContent('<label>Login password<input type="password"></label><label>Applicant name<input name="fullName"></label>');const blocked=await engine.frame(owner,first.sessionId);assert.equal(blocked.flags.login,true);assert.equal(await s.page.locator('[name=fullName]').inputValue(),'');checks.push('login screen is excluded from autofill');
  await s.page.setContent('<label>OTP<input name="otp"></label><label>Applicant name<input name="fullName"></label>');await engine.frame(owner,first.sessionId);assert.equal(await s.page.locator('[name=otp]').inputValue(),'');checks.push('OTP remains manual');
  const box=await s.page.locator('[name=otp]').boundingBox();await engine.action(owner,first.sessionId,{action:'click',x:box.x+10,y:box.y+10});await engine.action(owner,first.sessionId,{action:'text',text:'123456'});assert.equal(await s.page.locator('[name=otp]').inputValue(),'123456');checks.push('user can complete verification through browser controls');
  await engine.close(owner,first.sessionId);await assert.rejects(engine.frame(owner,first.sessionId),e=>e.status===404);checks.push('ending the session removes access');
  second=await engine.start(other,{consent:true,profile:{fullName:'Other Applicant'},width:700,height:600},{fixture});const b=engine.get(other,second.sessionId);assert.equal((await b.context.cookies()).length,0);assert.equal(await b.page.locator('[name=fullName]').inputValue(),'Other Applicant');checks.push('new workspaces have isolated cookies and values');
  await engine.close(other,second.sessionId);return {passed:checks.length,checks};
 }finally{for(const id of [first?.sessionId,second?.sessionId]){const s=engine.sessions.get(id);if(s)await engine.destroy(s);}}
}
