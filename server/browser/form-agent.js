/* Isolated portal helper: no network/native bridge. Fill only reviewed blank values.
   Explicit upload mode may open a file picker; it never clicks navigation or submit. */
function avsarGoFormAgent(mode, payload) {
  'use strict';
  const deny=/password|\bpwd\b|login|user\s*(?:id|name)|otp|one.?time|verification.?code|captcha|security.?code|\bcvv\b|\bcvc\b|(?:credit|debit|payment).?card|card.?number|upi.?pin|payment|confirm|retype|submit|search|transaction|declar|agree|consent|(?:^|\s)pin(?:\s|$)|पासवर्ड|कैप्चा|ओटीपी|भुगतान/i;
  const specs=[
    ['aadhaarNumber',/aadhaar|aadhar|uid.?number|आधार/i],['panNumber',/pan.?number|pan.?no|pan.?card|^pan$|पैन/i],['passportNumber',/passport.?number|passport.?no/i],
    ['ifsc',/ifsc/i],['bankAccount',/bank.?account|account.?number|account.?no|खाता.?संख्या/i],['bankName',/bank.?name|name.?of.?bank/i],
    ['enterpriseName',/enterprise.?name|name.?of.?enterprise|business.?name|company.?name|उद्यम.?का.?नाम/i],['organisationType',/organi[sz]ation.?type|type.?of.?organi[sz]ation|constitution.?of.?business/i],
    ['gstin',/gstin|gst.?number|gst.?no/i],['udyamNumber',/udyam.?number|udyam.?registration.?number/i],['commencementDate',/commencement.?date|date.?of.?commencement|business.?start.?date/i],['annualIncome',/annual.?income|yearly.?income/i],['annualTurnover',/annual.?turnover|yearly.?turnover/i],['nicCode',/nic.?code|industry.?code/i],
    ['dobDay',/(?:birth|dob).*(?:day)|(?:day).*(?:birth|dob)/i],['dobMonth',/(?:birth|dob).*(?:month)|(?:month).*(?:birth|dob)/i],['dobYear',/(?:birth|dob).*(?:year)|(?:year).*(?:birth|dob)/i],
    ['maritalStatus',/marital.?status/i],['occupation',/occupation|profession/i],['houseNumber',/house.?number|house.?no|flat.?number/i],['street',/street|road.?name/i],['locality',/locality|village|area.?name/i],['postOffice',/post.?office/i],['tehsil',/tehsil|taluk|block.?name/i],['country',/country/i],
    ['fatherName',/father|पिता/i],['motherName',/mother|माता/i],
    ['dob',/date.?of.?birth|birth.?date|\bdob\b|जन्म.?तिथि|जन्म.?दिनांक/i],
    ['email',/e.?mail|ईमेल/i],['mobile',/mobile|phone|contact.?number|मोबाइल|फोन/i],
    ['pincode',/postal.?code|zip.?code|pin.?code|pincode|डाक.?कोड|पिन.?कोड/i],
    ['state',/\bstate\b|राज्य/i],['district',/district|जिला/i],['city',/\bcity\b|\btown\b|शहर/i],
    ['address',/address|residential|पता/i],['gender',/gender|\bsex\b|लिंग/i],
    ['nationality',/nationality|citizenship|राष्ट्रीयता/i],['qualification',/highest.?qualification|educational.?qualification|qualification|योग्यता/i],
    ['domicile',/domicile|निवास.?राज्य/i],['category',/reservation.?category|social.?category|caste.?category|^category$|श्रेणी/i],
    ['passingYear',/passing.?year|year.?of.?passing|उत्तीर्ण.?वर्ष/i],['percentage',/percentage|marks.?percent|प्रतिशत/i],
    ['board',/education.?board|exam.?board|university|बोर्ड|विश्वविद्यालय/i],['course',/course|discipline|पाठ्यक्रम/i],
    ['rollNumber',/roll.?n(?:o|umber)|रोल.?नंबर/i],['school',/school.?name|college.?name|institution.?name|विद्यालय.?नाम/i],
    ['firstName',/first.?name|given.?name|पहला.?नाम/i],['middleName',/middle.?name|मध्य.?नाम/i],['lastName',/last.?name|surname|family.?name|उपनाम/i],
    ['fullName',/applicant.?name|candidate.?name|full.?name|name.?of.?(?:applicant|candidate|entrepreneur)|entrepreneur.?name|name.?as.?per.?aadhaar|your.?name|आवेदक.?का.?नाम|पूरा.?नाम|^name$|^नाम$/i]
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
    if(el.tagName==='INPUT'&&!['text','email','tel','date','number','radio',''].includes((el.type||'text').toLowerCase()))return true;
    const d=descriptor(el),withoutPostal=d.replace(/(?:postal|zip|pin)\s*code|pincode|पिन\s*कोड/ig,'postalcode');
    return !d||deny.test(withoutPostal);
  }
  function keyFor(el){
    if(!visible(el)||secret(el))return null;const d=descriptor(el);
    if(/guardian|parent.?name|nominee|spouse|अभिभावक|(?:exam|test|preferred).*(?:city|centre|center)|(?:school|college|university).*address/i.test(d))return null;
    if(/domicile|निवास.?राज्य/i.test(d))return 'domicile';
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
    if(el.type==='radio')return !all.some(r=>r.type==='radio'&&r.name===el.name&&r.form===el.form&&r.checked);
    return String(el.value||'').trim()==='';
  }
  const all=docs.reduce((items,doc)=>items.concat(Array.from(doc.querySelectorAll('input,textarea,select,[role=combobox]'))),[]);
  function radios(el){return all.filter(r=>r.type==='radio'&&r.name===el.name&&r.form===el.form&&r.ownerDocument===el.ownerDocument&&visible(r)&&!secret(r));}
  const radioFirst=el=>el.type!=='radio'||radios(el)[0]===el;
  const flagElements=all.filter(visible);
  const flags={
    login:flagElements.some(el=>el.tagName==='INPUT'&&el.type==='password')||flagElements.some(el=>/(?:login|user\s*(?:name|id))/i.test(descriptor(el))),
    otp:flagElements.some(el=>/otp|one.?time|verification.?code|ओटीपी/i.test(descriptor(el))),
    captcha:flagElements.some(el=>/captcha|कैप्चा/i.test(descriptor(el)))||docs.some(doc=>Array.from(doc.querySelectorAll('img[src*="captcha" i],iframe[src*="recaptcha" i]')).some(visible)),
    payment:flagElements.some(el=>/cvv|cvc|card.?number|upi|payment|भुगतान/i.test(descriptor(el))),
    files:flagElements.some(el=>el.type==='file'),crossOriginFrame:blockedFrames.length>0
  };
  const candidates=flags.login||flags.payment?[]:all.map((el,i)=>({element:el,fieldId:'f'+i,key:keyFor(el)})).filter(m=>visible(m.element)&&!secret(m.element)&&blank(m.element)&&radioFirst(m.element)).slice(0,100);
  const matches=candidates.filter(m=>m.key);
  const fields=[...new Set(matches.map(m=>m.key))];
  const page=location.origin+location.pathname;
  const uploads=flags.login||flags.payment?[]:all.map((el,i)=>({element:el,fieldId:'f'+i})).filter(m=>m.element.type==='file'&&visible(m.element)&&!m.element.files?.length);
  const metadata=m=>({fieldId:m.fieldId,key:m.key||'',label:descriptor(m.element),type:m.element.getAttribute('role')==='combobox'?'combobox':m.element.tagName==='SELECT'?'select':m.element.tagName==='TEXTAREA'?'textarea':m.element.type||'text',required:!!m.element.required,maxLength:m.element.maxLength,options:m.element.tagName==='SELECT'?Array.from(m.element.options).filter(o=>!o.disabled).slice(0,100).map(o=>o.textContent.slice(0,100)):m.element.type==='radio'?radios(m.element).map(r=>Array.from(r.labels||[]).map(l=>l.textContent).join(' ')||r.value):[]});
  const descriptors=candidates.map(metadata);
  const signature=page+':'+JSON.stringify(descriptors)+':'+uploads.map(m=>m.fieldId+'@'+descriptor(m.element)).join('|')+':'+JSON.stringify(flags);
  const unknownRequired=candidates.filter(m=>m.element.required&&!m.key).length;
  if(mode==='scan')return {ok:true,page,signature,fields,flags,detected:matches.length,unknownRequired,candidates:descriptors,uploads:uploads.map(m=>({fieldId:m.fieldId,label:descriptor(m.element),accept:m.element.getAttribute('accept')||''}))};
  if(mode==='upload'||mode==='uploadTarget'||mode==='uploadFocus'){
    if(!payload||payload.signature!==signature)return {ok:false,error:'PAGE_CHANGED'};
    const target=uploads.find(m=>m.fieldId===payload.fieldId);if(!target)return {ok:false,error:'Upload field unavailable'};
    if(mode==='uploadTarget'||mode==='uploadFocus'){
      const input=target.element;if(!payload.measureOnly)input.scrollIntoView({block:'center',inline:'nearest'});const rect=input.getBoundingClientRect(),doc=input.ownerDocument,view=doc.defaultView,x=rect.left+Math.min(35,rect.width/2),y=rect.top+rect.height/2,hit=doc.elementFromPoint(x,y);
      if(hit!==input&&hit?.control!==input)return {ok:false,error:'Upload field is covered'};
      if(view!==window)return {ok:false,error:'Embedded upload needs manual selection'};
      if(mode==='uploadFocus'){input.focus({preventScroll:true});return {ok:doc.activeElement===input,safeTarget:true,focusedFile:doc.activeElement===input,fieldId:target.fieldId,neverSubmitted:true};}
      const viewport=window.visualViewport;return {ok:true,safeTarget:true,x:x-(viewport?.offsetLeft||0),y:y-(viewport?.offsetTop||0),viewportWidth:viewport?.width||window.innerWidth,neverSubmitted:true};
    }
    target.element.click();return {ok:true,pickerOpened:true,neverSubmitted:true};
  }
  if(mode!=='fill'||!payload||typeof payload.fields!=='object')return {ok:false,error:'Invalid approved fields'};
  if(payload.signature!==signature)return {ok:false,error:'PAGE_CHANGED',filled:[]};
  const filled=[],skipped=[];
  function setText(el,value){
    const view=el.ownerDocument.defaultView,proto=el.tagName==='TEXTAREA'?view.HTMLTextAreaElement.prototype:view.HTMLInputElement.prototype;
    const setter=Object.getOwnPropertyDescriptor(proto,'value')?.set;
    if(setter)setter.call(el,value);else el.value=value;
    el.dispatchEvent(new view.Event('input',{bubbles:true}));el.dispatchEvent(new view.Event('change',{bubbles:true}));
  }
  const allowed=new Set([...specs.map(s=>s[0]),...Object.keys(payload.meta||{}).filter(k=>/^extra_[a-f0-9]{16}$/.test(k)&&!deny.test(payload.meta[k]?.label||''))]);
  for(const m of candidates){
    const mapped=payload.mappings?.[m.fieldId],key=m.key||(allowed.has(mapped)?mapped:null),custom=Object.prototype.hasOwnProperty.call(payload.custom||{},m.fieldId),el=m.element;
    if((!key&&!custom)||(!custom&&!Object.prototype.hasOwnProperty.call(payload.fields,key))||!blank(el))continue;
    const name=key||'field:'+m.fieldId;let value=String(custom?payload.custom[m.fieldId]:payload.fields[key]||'').trim();
    if(!value||value.length>(key==='address'||el.tagName==='TEXTAREA'?700:240)||/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value)){skipped.push(name);continue;}
    if(el.maxLength>=0&&value.length>el.maxLength){skipped.push(name);continue;}
    let expected=value;
    if(el.type==='radio'){
      const norm=s=>String(s).trim().toLowerCase(),v=norm(value),aliases={male:['male','m','पुरुष'],female:['female','f','महिला'],other:['other','others','अन्य']};const variants=aliases[v]||[v];const target=radios(el).find(r=>variants.includes(norm(Array.from(r.labels||[]).map(l=>l.textContent).join(' ')))||norm(r.value)===v);if(!target){skipped.push(name);continue;}const view=el.ownerDocument.defaultView;Object.getOwnPropertyDescriptor(view.HTMLInputElement.prototype,'checked').set.call(target,true);target.dispatchEvent(new view.Event('input',{bubbles:true}));target.dispatchEvent(new view.Event('change',{bubbles:true}));if(target.checked)filled.push(name);else skipped.push(name);continue;
    }else if(el.getAttribute('role')==='combobox'&&el.tagName!=='SELECT'){
      const root=el.ownerDocument.getElementById(el.getAttribute('aria-controls')||el.getAttribute('aria-owns')||'');const choice=root&&Array.from(root.querySelectorAll('[role=option]')).find(o=>visible(o)&&o.getAttribute('aria-disabled')!=='true'&&o.textContent.trim().toLowerCase()===value.toLowerCase());if(!choice){skipped.push(name);continue;}choice.click();if(String(el.value||el.textContent).trim().toLowerCase()===value.toLowerCase())filled.push(name);else skipped.push(name);continue;
    }else if(el.tagName==='SELECT'){
      const norm=s=>String(s).trim().toLowerCase();const aliases={male:['male','m','पुरुष'],female:['female','f','महिला'],other:['other','others','अन्य']};
      let values=aliases[norm(value)]||[norm(value)];if(key==='dobMonth'){const months=['january','february','march','april','may','june','july','august','september','october','november','december'],n=Number(value);if(n>=1&&n<=12)values=[String(n),String(n).padStart(2,'0'),months[n-1],months[n-1].slice(0,3)];}if(key==='dobDay')values=[String(Number(value)),value];
      const option=Array.from(el.options).find(o=>!o.disabled&&o.value!==''&&(values.includes(norm(o.textContent))||values.includes(norm(o.value))));
      if(!option){skipped.push(name);continue;}expected=option.value;
      const view=el.ownerDocument.defaultView;
      Object.getOwnPropertyDescriptor(view.HTMLSelectElement.prototype,'value').set.call(el,option.value);
      el.dispatchEvent(new view.Event('input',{bubbles:true}));el.dispatchEvent(new view.Event('change',{bubbles:true}));
    }else{
      if(el.type==='number'&&['dobDay','dobMonth'].includes(key))value=String(Number(value));
      if(el.type==='date'){const d=value.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/);if(d)value=`${d[3]}-${d[2].padStart(2,'0')}-${d[1].padStart(2,'0')}`;}
      expected=value;setText(el,value);
    }
    if(String(el.value||'').trim()===String(expected).trim())filled.push(name);else skipped.push(name);
  }
  return {ok:true,filled,skipped,neverSubmitted:true};
}
