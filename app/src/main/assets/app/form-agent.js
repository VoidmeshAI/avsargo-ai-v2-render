/* Runs only inside the portal WebView. No network, native bridge, clicks or submission.
   Only descriptors and blankness of supported non-secret fields are inspected. */
function avsarGoFormAgent(mode, payload) {
  'use strict';
  const deny=/password|\bpwd\b|login|user\s*(?:id|name)|otp|one.?time|verification.?code|captcha|security.?code|\bcvv\b|\bcvc\b|card.?number|upi|payment|bank|account|ifsc|aadhaar|aadhar|uidai|pan.?number|passport.?number|ssn|confirm|retype|submit|search|transaction|(?:^|\s)pin(?:\s|$)|पासवर्ड|कैप्चा|ओटीपी|खाता|आधार|पैन.?नंबर|भुगतान/i;
  const specs=[
    ['fatherName',/father|पिता/i],['motherName',/mother|माता/i],
    ['dob',/date.?of.?birth|birth.?date|\bdob\b|जन्म.?तिथि|जन्म.?दिनांक/i],
    ['email',/e.?mail|ईमेल/i],['mobile',/mobile|phone|contact.?number|मोबाइल|फोन/i],
    ['pincode',/postal.?code|zip.?code|pin.?code|pincode|डाक.?कोड|पिन.?कोड/i],
    ['state',/\bstate\b|राज्य/i],['district',/district|जिला/i],['city',/\bcity\b|\btown\b|शहर/i],
    ['address',/address|residential|पता/i],['gender',/gender|\bsex\b|लिंग/i],
    ['nationality',/nationality|citizenship|राष्ट्रीयता/i],['qualification',/highest.?qualification|educational.?qualification|qualification|योग्यता/i],
    ['firstName',/first.?name|given.?name|पहला.?नाम/i],['middleName',/middle.?name|मध्य.?नाम/i],['lastName',/last.?name|surname|family.?name|उपनाम/i],
    ['fullName',/applicant.?name|candidate.?name|full.?name|name.?of.?(?:applicant|candidate)|your.?name|आवेदक.?का.?नाम|पूरा.?नाम|^name$|^नाम$/i]
  ];
  const docs=[document], blockedFrames=[];
  function frames(doc){for(const frame of doc.querySelectorAll('iframe,frame')){
    try{const inner=frame.contentDocument;if(inner&&inner.location.origin===location.origin){docs.push(inner);if(docs.length<8)frames(inner);}else blockedFrames.push(true);}catch(_){blockedFrames.push(true);}
  }}
  frames(document);
  function visible(el){
    const view=el.ownerDocument.defaultView,s=view.getComputedStyle(el),r=el.getBoundingClientRect();
    if(s.display==='none'||s.visibility==='hidden'||s.visibility==='collapse'||r.width<=0||r.height<=0||el.disabled||el.readOnly)return false;
    for(let v=view;v&&v!==window;v=v.parent){const f=v.frameElement;if(!f)return false;const fs=v.parent.getComputedStyle(f),fr=f.getBoundingClientRect();if(fr.width<=0||fr.height<=0||fs.display==='none'||fs.visibility==='hidden')return false;}
    return true;
  }
  function descriptor(el){
    const doc=el.ownerDocument;
    const aria=(el.getAttribute('aria-labelledby')||'').split(/\s+/).map(id=>doc.getElementById(id)?.textContent||'').join(' ');
    const labels=el.labels?Array.from(el.labels).map(x=>x.textContent||'').join(' '):'';
    return [el.name,el.id,el.getAttribute('aria-label'),aria,el.getAttribute('placeholder'),labels]
      .filter(Boolean).join(' ').replace(/([a-z])([A-Z])/g,'$1 $2').replace(/[_-]/g,' ').replace(/\s+/g,' ').trim().slice(0,300);
  }
  function secret(el){
    if(el.tagName==='INPUT'&&!['text','email','tel','date','number',''].includes((el.type||'text').toLowerCase()))return true;
    const d=descriptor(el),withoutPostal=d.replace(/(?:postal|zip|pin)\s*code|pincode|पिन\s*कोड/ig,'postalcode');
    return !d||deny.test(withoutPostal)||/guardian|parent.?name|organisation|organization|company|school|college|nominee|spouse|अभिभावक|संस्था/i.test(d);
  }
  function keyFor(el){
    if(!visible(el)||secret(el))return null;const d=descriptor(el);
    // Generic "Name" applies only when the semantic label is exactly Name; never bank/college names.
    for(const [key,rule]of specs)if(rule.test(d))return key;
    if((el.labels&&Array.from(el.labels).some(l=>/^(name|नाम)\s*[:*]?$/i.test(l.textContent.trim())))||/^(name|नाम)$/i.test(el.name||el.id||''))return 'fullName';
    return null;
  }
  function blank(el){
    if(el.tagName==='SELECT'){
      const option=el.options[el.selectedIndex];
      return !option||option.disabled||el.value===''||/^(?:select|choose|please select|--|चुनें)/i.test(option.textContent.trim());
    }
    return String(el.value||'').trim()==='';
  }
  const all=docs.flatMap(doc=>Array.from(doc.querySelectorAll('input,textarea,select')));
  const flagElements=all.filter(visible);
  const flags={
    login:flagElements.some(el=>el.tagName==='INPUT'&&el.type==='password')||flagElements.some(el=>/(?:login|user\s*(?:name|id))/i.test(descriptor(el))),
    otp:flagElements.some(el=>/otp|one.?time|verification.?code|ओटीपी/i.test(descriptor(el))),
    captcha:flagElements.some(el=>/captcha|कैप्चा/i.test(descriptor(el)))||docs.some(doc=>Array.from(doc.querySelectorAll('img[src*="captcha" i],iframe[src*="recaptcha" i]')).some(visible)),
    payment:flagElements.some(el=>/cvv|cvc|card.?number|upi|payment|भुगतान/i.test(descriptor(el))),
    files:flagElements.some(el=>el.type==='file'),crossOriginFrame:blockedFrames.length>0
  };
  const matches=flags.login||flags.payment?[]:all.map(el=>({element:el,key:keyFor(el)})).filter(m=>m.key&&blank(m.element));
  const fields=[...new Set(matches.map(m=>m.key))];
  const page=location.origin+location.pathname;
  const signature=page+':'+matches.map(m=>m.key+'@'+descriptor(m.element)).join('|')+':'+JSON.stringify(flags);
  const unknownRequired=flags.login||flags.payment?0:flagElements.filter(el=>el.required&&!secret(el)&&!keyFor(el)&&['INPUT','TEXTAREA','SELECT'].includes(el.tagName)).length;
  if(mode==='scan')return {ok:true,page,signature,fields,flags,detected:matches.length,unknownRequired};
  if(mode!=='fill'||!payload||typeof payload.fields!=='object')return {ok:false,error:'Invalid approved fields'};
  if(payload.signature!==signature)return {ok:false,error:'PAGE_CHANGED',filled:[]};
  const filled=[],skipped=[];
  function setText(el,value){
    const view=el.ownerDocument.defaultView,proto=el.tagName==='TEXTAREA'?view.HTMLTextAreaElement.prototype:view.HTMLInputElement.prototype;
    const setter=Object.getOwnPropertyDescriptor(proto,'value')?.set;
    if(setter)setter.call(el,value);else el.value=value;
    el.dispatchEvent(new view.Event('input',{bubbles:true}));el.dispatchEvent(new view.Event('change',{bubbles:true}));
  }
  for(const m of matches){
    const el=m.element,key=m.key;if(!Object.prototype.hasOwnProperty.call(payload.fields,key)||!blank(el))continue;
    let value=String(payload.fields[key]||'').trim();if(!value||value.length>(key==='address'?500:180)){skipped.push(key);continue;}
    if(el.maxLength>=0&&value.length>el.maxLength){skipped.push(key);continue;}
    if(el.tagName==='SELECT'){
      const norm=s=>String(s).trim().toLowerCase();const aliases={male:['male','m','पुरुष'],female:['female','f','महिला'],other:['other','others','अन्य']};
      const values=aliases[norm(value)]||[norm(value)];
      const option=Array.from(el.options).find(o=>!o.disabled&&o.value!==''&&(values.includes(norm(o.textContent))||norm(o.value)===norm(value)));
      if(!option){skipped.push(key);continue;}
      const view=el.ownerDocument.defaultView;
      Object.getOwnPropertyDescriptor(view.HTMLSelectElement.prototype,'value').set.call(el,option.value);
      el.dispatchEvent(new view.Event('input',{bubbles:true}));el.dispatchEvent(new view.Event('change',{bubbles:true}));
    }else{
      if(el.type==='date'){const d=value.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/);if(d)value=`${d[3]}-${d[2].padStart(2,'0')}-${d[1].padStart(2,'0')}`;}
      setText(el,value);
    }
    if(String(el.value||'').trim())filled.push(key);else skipped.push(key);
  }
  return {ok:true,filled,skipped,neverSubmitted:true};
}
