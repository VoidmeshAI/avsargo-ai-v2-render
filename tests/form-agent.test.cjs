// Deterministic DOM unit tests. Not a browser/emulator or a native Android acceptance test.
const vm=require('node:vm'),fs=require('node:fs'),assert=require('node:assert/strict');
const source=fs.readFileSync(require('node:path').join(__dirname,'../app/src/main/assets/app/form-agent.js'),'utf8');
let count=0;
function scenario(specs,{frames=[],path='/application'}={}){
 class Event{constructor(type,options){this.type=type;this.bubbles=options?.bubbles;}}
 class Input{
  constructor(s){Object.assign(this,{tagName:'INPUT',name:'',id:'',type:'text',disabled:false,readOnly:false,required:false,maxLength:-1,_value:'',labels:[],attrs:{},events:[],shown:true},s);if(s.value!==undefined)this._value=s.value;if(s.label)this.labels=[{textContent:s.label}];if(s.secret)Object.defineProperty(this,'value',{get(){throw Error('Secret value was read');},set(){throw Error('Secret value was written');}});}
  get value(){return this._value;}set value(v){this._value=String(v);}
  getAttribute(name){return this.attrs[name]||null;}getBoundingClientRect(){return {width:this.shown?120:0,height:this.shown?30:0};}dispatchEvent(e){this.events.push(e.type);}closest(){return null;}
 }
 class Textarea extends Input{constructor(s){super({...s,tagName:'TEXTAREA'});}}
 class Select extends Input{
  constructor(s){super({...s,tagName:'SELECT'});this.options=s.options;this.selectedIndex=s.selectedIndex??0;}
  get value(){return this.options[this.selectedIndex]?.value||'';}set value(v){this.selectedIndex=this.options.findIndex(o=>o.value===v);}
 }
 const location={origin:'https://test.gov.in',pathname:path};
 const window={HTMLInputElement:Input,HTMLTextAreaElement:Textarea,HTMLSelectElement:Select,Event,getComputedStyle:el=>({display:el.shown?'block':'none',visibility:'visible'})};window.parent=window;
 const elements=specs.map(s=>s.tagName==='SELECT'?new Select(s):s.tagName==='TEXTAREA'?new Textarea(s):new Input(s));
 const doc={title:'Application',location,defaultView:window,
  getElementById:id=>elements.find(el=>el.id===id)||null,
  querySelectorAll:q=>q==='input,textarea,select'?elements:q==='iframe,frame'?frames:[],querySelector:()=>null};
 for(const el of elements)el.ownerDocument=doc;
 const context=vm.createContext({document:doc,location,window,console});vm.runInContext(source,context);
 const run=(mode,payload)=>JSON.parse(JSON.stringify(context.avsarGoFormAgent(mode,payload)));
 const scan=()=>run('scan',null);const fill=values=>run('fill',{signature:scan().signature,fields:values});
 return {elements,scan,fill,run,doc,window};
}
function test(name,fn){fn();count++;console.log('PASS',name);}
test('Fills approved blank fields; preserves existing data and secret fields',()=>{
 const s=scenario([{name:'fullName',label:'Full name'},{name:'fatherName',label:"Father's name"},{name:'email',value:'existing@example.com'},{name:'mobile',label:'Mobile number'},{name:'otp',secret:true},{name:'captcha',secret:true},{name:'aadhaarNumber',secret:true},{name:'bankAccount',secret:true}]);
 const result=s.fill({fullName:'Test Applicant',fatherName:'Parent',email:'overwrite@example.com',mobile:'9876543210',otp:'wrong',captcha:'wrong',aadhaar:'wrong'});
 assert.deepEqual(result.filled,['fullName','fatherName','mobile']);assert.equal(s.elements[2].value,'existing@example.com');assert.equal(result.neverSubmitted,true);
});
test('Visible login screen blocks all autofill without reading password',()=>{const s=scenario([{name:'fullName',label:'Full name'},{type:'password',name:'password',secret:true}]);assert.equal(s.scan().flags.login,true);assert.deepEqual(s.scan().fields,[]);assert.deepEqual(s.fill({fullName:'X'}).filled,[]);});
test('Hidden password does not block a current application step',()=>{const s=scenario([{name:'fullName',label:'Full name'},{name:'password',type:'password',secret:true,shown:false}]);assert.deepEqual(s.scan().fields,['fullName']);});
test('OTP, CAPTCHA, card and login descriptors never map to profile',()=>{const s=scenario([{name:'email_otp',secret:true},{name:'captchaFullName',secret:true},{name:'card_number',secret:true},{name:'userName',secret:true}]);assert.deepEqual(s.scan().fields,[]);});
test('Payment step blocks autofill and never reads payment values',()=>{const s=scenario([{name:'fullName',label:'Full name'},{name:'paymentUpi',secret:true}]);assert.equal(s.scan().flags.payment,true);assert.deepEqual(s.fill({fullName:'X'}).filled,[]);});
test('Postal PIN is distinct from secret PIN',()=>{const s=scenario([{name:'pincode',label:'Postal PIN code'},{name:'pin',secret:true}]);assert.deepEqual(s.scan().fields,['pincode']);assert.equal(s.fill({pincode:'110001'}).filled.length,1);});
test('Actual select placeholder with value 0 is fillable',()=>{const s=scenario([{tagName:'SELECT',name:'state',options:[{value:'0',textContent:'Select state'},{value:'DL',textContent:'Delhi'}]}]);assert.deepEqual(s.fill({state:'Delhi'}).filled,['state']);assert.equal(s.elements[0].value,'DL');});
test('Actual selected state is not overwritten',()=>{const s=scenario([{tagName:'SELECT',name:'state',selectedIndex:1,options:[{value:'0',textContent:'Select state'},{value:'DL',textContent:'Delhi'},{value:'UP',textContent:'Uttar Pradesh'}]}]);assert.deepEqual(s.fill({state:'Uttar Pradesh'}).filled,[]);assert.equal(s.elements[0].value,'DL');});
test('Unmatched select value stays empty and is reported',()=>{const s=scenario([{tagName:'SELECT',name:'state',options:[{value:'',textContent:'Select state'},{value:'DL',textContent:'Delhi'}]}]);assert.deepEqual(s.fill({state:'Incorrect State'}).skipped,['state']);assert.equal(s.elements[0].value,'');});
test('DD/MM/YYYY maps to an HTML date input',()=>{const s=scenario([{name:'dob',type:'date'}]);s.fill({dob:'21/01/2024'});assert.equal(s.elements[0].value,'2024-01-21');});
test('Name components only use separately reviewed profile values',()=>{const s=scenario([{name:'firstName'},{name:'lastName'},{name:'collegeName'},{name:'guardianName'}]);assert.deepEqual(s.fill({fullName:'Test Applicant'}).filled,[]);assert.deepEqual(s.fill({firstName:'Test',lastName:'Applicant'}).filled,['firstName','lastName']);});
test('Page-change guard blocks stale approval',()=>{const s=scenario([{name:'fullName',label:'Full name'}]);const signature=s.scan().signature;s.elements.push();s.elements[0].attrs['aria-label']='Updated step full name';assert.equal(s.run('fill',{signature,fields:{fullName:'Test'}}).error,'PAGE_CHANGED');assert.equal(s.elements[0].value,'');});
test('Disabled, readonly and hidden fields are excluded',()=>{const s=scenario([{name:'fullName',disabled:true},{name:'mobile',readOnly:true},{name:'email',shown:false}]);assert.deepEqual(s.scan().fields,[]);});
test('Hindi labels map correctly',()=>{const s=scenario([{id:'applicant',label:'आवेदक का नाम'},{id:'father',label:'पिता का नाम'},{id:'birth',label:'जन्म तिथि'}]);assert.deepEqual(s.scan().fields,['fullName','fatherName','dob']);});
test('Length constraint skips rather than truncating an approved name',()=>{const s=scenario([{name:'fullName',label:'Full name',maxLength:4}]);assert.deepEqual(s.fill({fullName:'Test Applicant'}).skipped,['fullName']);assert.equal(s.elements[0].value,'');});
test('Input/change events are emitted and no click/submit is attempted',()=>{const s=scenario([{name:'email'}]);s.fill({email:'test@example.com'});assert.deepEqual(s.elements[0].events,['input','change']);});
test('Unsupported required details are flagged',()=>{const s=scenario([{name:'occupation',required:true},{name:'fullName',label:'Full name'}]);assert.equal(s.scan().unknownRequired,1);});
test('Same-origin iframe fields are scanned; cross-origin frame is flagged',()=>{
 const inside=scenario([{name:'city'}]);const frame={contentDocument:inside.doc};
 const outer=scenario([],{frames:[frame,{contentDocument:null}]});frame.ownerDocument=outer.doc;frame.shown=true;frame.getBoundingClientRect=()=>({width:150,height:150});inside.window.parent=outer.window;inside.window.frameElement=frame;
 assert.deepEqual(outer.scan().fields,['city']);assert.equal(outer.scan().flags.crossOriginFrame,true);
});
console.log(`Form agent: ${count} checks passed`);
