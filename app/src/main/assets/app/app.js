(() => {
  'use strict';
  const $=id=>document.getElementById(id),native=window.AvsarGoNative,onPhone=!!native;
  const storage=(()=>{try{return window.localStorage;}catch(_){return {getItem:()=>null,setItem:()=>{},removeItem:()=>{}};}})();
  const userFields=['fullName','firstName','middleName','lastName','fatherName','motherName','dob','mobile','email','address','state','city','district','pincode','gender','nationality','qualification'];
  const labels={fullName:'Full name',firstName:'First name',middleName:'Middle name',lastName:'Last name',fatherName:"Father’s name",motherName:"Mother’s name",dob:'Date of birth',mobile:'Mobile',email:'Email',address:'Address',state:'State',city:'City',district:'District',pincode:'Postal PIN code',gender:'Gender',nationality:'Nationality',qualification:'Highest qualification'};
  const services={
    pan:{name:'PAN application',docs:['Identity proof','Address proof','Date of birth proof','Photo, if required'],url:'https://www.incometax.gov.in/iec/foportal/',note:'New PAN, e-PAN, correction aur duplicate ki process alag hai. Application type official site par choose karein.'},
    dl:{name:'Driving licence',docs:['Identity / age proof','Address proof','Photo / signature as required','Learner licence, if applicable'],url:'https://parivahan.gov.in/parivahan/',note:'Apna state aur learner/new/renewal service choose karein. Requirements RTO aur vehicle class ke mutabik badalti hain.'},
    ssc:{name:'SSC exam',docs:['Qualification certificates','Age / identity proof','Photo and signature','Category certificate, if applicable'],url:'https://ssc.gov.in/',note:'Exam name aur official notification se eligibility aur deadline verify karein.'},
    rrb:{name:'Railway / RRB exam',docs:['Qualification certificates','Age / identity proof','Photo and signature','Category certificate, if applicable'],url:'https://www.rrcb.gov.in/rrbs.html',note:'Railway ka form SSC portal par nahi bhara jayega. Apne RRB ki official site se current application link kholen.'},
    income:{name:'Income certificate',docs:['Identity / address proof','Income evidence','State-specific supporting documents'],url:'',note:'Kaunse state ka certificate chahiye? Apne state ka official application link daalein.'},
    caste:{name:'Caste certificate',docs:['Identity / address proof','Community/family evidence','State-specific supporting documents'],url:'',note:'State aur category ke mutabik eligibility verify karein.'},
    domicile:{name:'Domicile certificate',docs:['Identity / address proof','Residence evidence','State-specific supporting documents'],url:'',note:'Apne state ka official service portal choose karein.'},
    passport:{name:'Passport',docs:['Address proof','Date of birth proof','Case-specific documents'],url:'https://www.passportindia.gov.in/',note:'New/reissue application alag hai. Appointment aur verification aap khud complete karenge.'},
    voter:{name:'Voter application',docs:['Identity / age proof','Residence proof','Photo as required'],url:'',note:'Apne official voter application portal ka link daalein. New registration/correction service verify karein.'}
  };
  let workspace={profile:{},documents:[],ai:{},workspace:{}},currentService='',currentCustomService='',chatMessages=[],awaiting=false,importing=false,pendingOcr={},pendingNode=null,requestId='',saveTimer=null;
  document.body.classList.toggle('theme-dark',storage.getItem('av_theme')==='dark');
  const node=(tag,cl,text)=>{const el=document.createElement(tag);if(cl)el.className=cl;if(text!==undefined)el.textContent=text;return el;};
  const append=(parent,tag,cl,text)=>{const el=node(tag,cl,text);parent.append(el);return el;};
  function notify(text){$('toast').textContent=text;$('toast').hidden=false;clearTimeout(notify.timer);notify.timer=setTimeout(()=>$('toast').hidden=true,3500);}
  function refresh(){if(!onPhone)return;try{const value=JSON.parse(native.state());workspace={profile:{},documents:[],ai:{},workspace:{},...value};if(!Array.isArray(workspace.documents))workspace.documents=[];$('docCount').textContent=String(workspace.documents.length);if(workspace.storageError)notify('Saved data read nahi hua. Settings mein help check karein.');}catch(_){notify('Private storage unavailable');}}
  function persist(){if(!onPhone)return;clearTimeout(saveTimer);saveTimer=setTimeout(()=>{try{native.saveWorkspace(JSON.stringify({messages:chatMessages.slice(-80),service:currentService,custom:currentCustomService}));}catch(_){notify('Chat save unavailable');}},180);}
  function toggleMenu(open){$('drawer').classList.toggle('open',open);$('scrim').classList.toggle('visible',open);$('drawer').setAttribute('aria-hidden',String(!open));}
  function hideSheet(){$('modal').hidden=true;$('sheetBody').replaceChildren();$('sheetActions').replaceChildren();}
  function sheet(title,content,buttons=[],eyebrow='AVSARGO'){
    toggleMenu(false);$('sheetTitle').textContent=title;$('sheetEyebrow').textContent=eyebrow;$('sheetBody').replaceChildren(content);$('sheetActions').replaceChildren();$('modal').hidden=false;
    for(const {text,primary,action}of buttons){const b=node('button','btn'+(primary?' primary':''),text);b.onclick=action;$('sheetActions').append(b);}
  }
  function info(parent,text,warn=false){return append(parent,'div','info-box'+(warn?' warning-box':''),text);}
  function button(text,action,primary=false){const b=node('button','chip-action'+(primary?' primary':''),text);b.onclick=action;return b;}
  function message(role,text,actions=[],save=true,cloud=role==='user'){
    $('welcome').hidden=true;const wrap=node('div','message '+role);if(role==='assistant')wrap.append(node('div','avatar','✦'));
    const body=node('div','msg-body',text);if(actions.length){const row=node('div','action-inline');for(const a of actions)row.append(button(a.text,a.action,a.primary));body.append(row);}wrap.append(body);$('messages').append(wrap);
    if(save){chatMessages.push({role,text,cloud});chatMessages=chatMessages.slice(-80);persist();}
    requestAnimationFrame(()=>$('chatScroll').scrollTo({top:$('chatScroll').scrollHeight,behavior:'smooth'}));return wrap;
  }
  function grow(){const input=$('chatInput');input.style.height='auto';input.style.height=Math.min(130,input.scrollHeight)+'px';}
  function spec(){return services[currentService]||{name:currentCustomService||'Application',docs:['Official checklist ke required identity / qualification / supporting documents'],url:'',note:'Exact form name aur official HTTPS application link batayein. Unknown forms ko kisi doosre department par route nahi karunga.'};}
  function infer(text){
    if(/railway|\brrb\b|ntpc|रेलवे/i.test(text))return 'rrb';
    if(/\bssc\b|staff selection/i.test(text))return 'ssc';
    if(/\bpan\b|पैन/i.test(text))return 'pan';
    if(/driving|licen[cs]e|\bdl\b|ड्राइविंग/i.test(text))return 'dl';
    if(/income certificate|आय प्रमाण/i.test(text))return 'income';if(/caste|जाति/i.test(text))return 'caste';
    if(/domicile|निवास प्रमाण/i.test(text))return 'domicile';if(/passport|पासपोर्ट/i.test(text))return 'passport';
    if(/voter|मतदाता/i.test(text))return 'voter';
    if(/form|application|apply|exam|आवेदन|फॉर्म|परीक्षा|certificate/i.test(text))return 'general';return '';
  }
  const actions=()=>[{text:'Upload documents',action:uploadDocs,primary:true},{text:'Review profile',action:()=>profilePanel()},{text:'Open form',action:browserPanel}];
  function progress(){const valid=Object.keys(workspace.profile||{}).length>0;$('progressPill').hidden=!currentService;$('progressText').textContent=valid?'Profile ready · Open your form':'Prepare documents · Review details';$('progressAction').textContent=valid?'Open →':'Continue →';$('progressAction').onclick=valid?browserPanel:uploadDocs;}
  function answer(raw){
    const text=raw.trim();if(!text||awaiting)return;if(text.length>4000){notify('Message ko 4000 characters se chhota rakhein');return;}
    message('user',text);$('chatInput').value='';grow();const id=infer(text);if(id){currentService=id;currentCustomService=id==='general'?text.slice(0,120):'';progress();persist();}
    refresh();if(onPhone&&workspace.ai.enabled&&workspace.ai.hasKey){
      awaiting=true;$('send').disabled=true;requestId=String(Date.now())+Math.random().toString(36).slice(2);pendingNode=message('assistant','Soch raha hoon…',[],false);pendingNode.classList.add('typing');
      try{native.requestAi(JSON.stringify({requestId,messages:chatMessages.filter(m=>m.cloud===true||m.role==='user').slice(-16)}));}catch(_){awaiting=false;$('send').disabled=false;pendingNode?.remove();notify('AI connection unavailable');}return;
    }
    if(id){const s=spec();message('assistant',s.name+' ke liye pehle documents taiyar karte hain.\n\nIndicative checklist:\n'+s.docs.map(x=>'• '+x).join('\n')+'\n\n'+s.note+'\n\nDocuments upload karo, extracted details review karo, phir app ke andar official form kholenge.',actions());}
    else if(currentService&&/done|next|continue|aage|आगे|ho gay[ao]/i.test(text)){message('assistant','Reviewed profile ready hai to official form app mein khol sakte hain. Login, OTP, CAPTCHA, payment aur final submit aap khud karenge.',[{text:'Open form',action:browserPanel,primary:true}]);}
    else message('assistant','Kaunsa form bharna hai? Form ka naam aur state batayein. Documents aur reviewed profile se supported fields fill kar sakte hain.\n\nAbhi live AI connection configured nahi hai. Natural AI chat ke liye Settings mein connection enable karein.',[{text:'Settings',action:settingsPanel},{text:'Upload documents',action:uploadDocs}]);
  }
  function renderDocs(parent){
    parent.replaceChildren();if(!workspace.documents.length){append(parent,'p','hint','Abhi koi document saved nahi hai.');return;}
    for(const item of workspace.documents){const row=node('div','doc-row');row.append(node('span','doc-icon','▤'));const details=node('div','doc-text');details.append(node('strong','',item.name),node('small','',Math.round(item.size/1024)+' KB · Private on phone'));row.append(details);
      row.append(button('Scan',()=>{if(onPhone&&!importing){hideSheet();pendingOcr={};native.rescanDocument(item.id);notify('Saved document scan ho raha hai…');}}));
      const remove=node('button','doc-remove','✕');remove.setAttribute('aria-label','Delete '+item.name);remove.onclick=()=>{if(importing)return notify('Upload complete hone dein');if(confirm('Ye saved document delete karein?'))native?.removeDocument(item.id);};row.append(remove);parent.append(row);}
  }
  function uploadDocs(){
    refresh();const box=node('div');if(currentService)info(box,spec().name+': '+spec().docs.join(' · '));
    info(box,'PDF, JPG ya PNG · Maximum 8 MB/file · 15 saved documents. Ek saath multiple files choose kar sakte hain. Documents phone par encrypted rahenge; OCR on-device chalega.');
    const tick=node('label','checkrow'),check=node('input');check.type='checkbox';tick.append(check,node('span','','Main selected documents ko phone par encrypted save aur scan karne ki consent deta/deti hoon.'));box.append(tick);
    const list=node('div');list.id='docList';box.append(list);renderDocs(list);
    sheet('My documents',box,[{text:'Close',action:hideSheet},{text:importing?'Scanning…':'Choose documents',primary:true,action:()=>{
      if(importing)return notify('Pehla upload complete hone dein');if(!check.checked)return notify('Pehle consent dein');if(!onPhone)return notify('Android app mein document picker available hai');
      importing=true;pendingOcr={};native.pickDocument();hideSheet();
    }}]);
  }
  function profilePanel(proposed={}){
    refresh();const merged={...workspace.profile,...proposed},box=node('div');info(box,'Har detail original document se check karein. OCR galat ho sakta hai. First/middle/last name apni marzi se review karein; app naam ko guess karke split nahi karega.');
    const grid=node('div','field-grid'),inputs={};box.append(grid);
    for(const key of userFields){const group=node('div','form-group'+(key==='address'?' wide':''));const label=append(group,'label','',labels[key]);const input=node(key==='address'?'textarea':'input');input.id='profile-'+key;label.htmlFor=input.id;
      input.value=String(merged[key]||'');input.maxLength=key==='address'?500:180;input.autocomplete='off';input.placeholder=key==='dob'?'DD/MM/YYYY':key==='mobile'?'10 digits':key==='pincode'?'6 digits':'';
      if(key==='mobile'||key==='pincode')input.inputMode='numeric';if(key==='email')input.type='email';group.append(input);grid.append(group);inputs[key]=input;}
    const tick=node('label','checkrow'),check=node('input');check.type='checkbox';tick.append(check,node('span','','Maine details original documents se verify ki hain. Inhe private profile mein save aur form filling mein use karne ki consent deta/deti hoon.'));box.append(tick);
    sheet('Review applicant details',box,[{text:'Back',action:hideSheet},{text:'Approve & save',primary:true,action:()=>{
      if(!check.checked)return notify('Details verify karke consent dein');const profile={};for(const key of userFields){const value=inputs[key].value.trim();if(value)profile[key]=value;}
      if(!Object.keys(profile).length)return notify('Kam se kam ek detail enter karein');if(!onPhone)return notify('Private profile Android app mein save hoga');native.saveProfile(JSON.stringify(profile));
    }}]);
  }
  function browserPanel(){
    refresh();const s=spec(),box=node('div'),valid=Object.keys(workspace.profile).length>0;
    info(box,'Official form app ke andar khulega. Aap login karein; Assist reviewed blank fields fill karega. Missing supported details popup mein poochhega. Website session ki permission dene par agle steps par filling continue ho sakti hai.');
    const group=node('div','form-group');const label=append(group,'label','','Official application link');const input=node('input');input.id='portalUrl';label.htmlFor=input.id;input.placeholder='https://…gov.in';input.value=s.url;input.autocapitalize='none';input.spellcheck=false;group.append(input);box.append(group);
    info(box,s.note);append(box,'p','hint','Login, OTP, CAPTCHA, fees, eSign, declaration, appointments aur final submission aapke control mein hain. Kuch portals embedded browser ko block karte hain.');
    if(!valid)info(box,'Pehle documents ki details review aur save karein.',true);
    sheet('Open your application',box,[{text:'Back',action:hideSheet},{text:valid?'Open in-app browser':'Review profile',primary:true,action:()=>{
      if(!valid){profilePanel(pendingOcr);return;}
      let url;try{url=new URL(input.value.trim());}catch(_){return notify('Valid HTTPS application link daalein');}
      if(url.protocol!=='https:'||url.username||url.password||!/(?:\.gov\.in|\.nic\.in)$/i.test(url.hostname)||url.port&&url.port!=='443')return notify('Official HTTPS .gov.in / .nic.in link chahiye');
      if(!onPhone)return notify('In-app browser Android app mein available hai');hideSheet();native.openPortal(url.href);
    }}]);
  }
  function settingsPanel(){
    refresh();const box=node('div');append(box,'h3','','Appearance');const modes=node('div','action-inline');for(const mode of ['light','dark'])modes.append(button(mode==='light'?'Light':'Dark',()=>{document.body.classList.toggle('theme-dark',mode==='dark');storage.setItem('av_theme',mode);}));box.append(modes);
    const advanced=node('details','advanced-settings');append(advanced,'summary','','AI connection');box.append(advanced);
    info(advanced,'Live AI chat ke liye apni Gemini key configure karein. Provider/key controls chat screen par nahi dikhte. Koi API key APK mein embed nahi hai. Cloud chat off rehne par local document/form tools kaam karte hain.');
    const group=node('div','form-group');append(group,'label','','API key');const key=node('input');key.id='aiKey';key.type='password';key.autocomplete='off';key.placeholder=workspace.ai.hasKey?'Saved key hidden':'Enter key';group.append(key);advanced.append(group);
    const modelGroup=node('div','form-group');append(modelGroup,'label','','Model ID (optional)');const model=node('input');model.id='aiModel';model.value=workspace.ai.model||'';model.placeholder='Blank = discover a supported Flash model';modelGroup.append(model);advanced.append(modelGroup);
    const consent=node('label','checkrow'),enabled=node('input');enabled.type='checkbox';enabled.id='cloudConsent';enabled.checked=!!workspace.ai.enabled;consent.append(enabled,node('span','','Cloud chat enable: typed conversation Google ko jayegi. Uploaded scans aur profile values automatically nahi bheji jayengi. Provider quota / charges aapki API settings par depend karte hain.'));advanced.append(consent);
    const row=node('div','action-inline');row.append(button('Save connection',()=>{if(!onPhone)return notify('Android app required');native.saveAiSettings(JSON.stringify({key:key.value.trim(),model:model.value.trim(),enabled:enabled.checked}));key.value='';},true),button('Remove key',()=>{if(onPhone&&confirm('Saved AI key delete karein?'))native.saveAiSettings(JSON.stringify({removeKey:true,enabled:false,model:''}));}));advanced.append(row);
    append(box,'h3','','Privacy');info(box,'Documents, profile aur chat locally encrypted hain. Saved documents website ko tabhi milte hain jab aap portal ke upload picker mein select aur approve karte hain.');
    box.append(button('Delete all app data',()=>{if(importing||awaiting)return notify('Current scan / AI response complete hone dein');if(confirm('Documents, profile, chat, AI key aur website login sessions permanently delete karein?'))native?.eraseLocalData();}));
    const tests=node('details','advanced-settings');append(tests,'summary','','Test tools');info(tests,'Local sample form real government site nahi hai. Dummy profile ke saath login → details → next step → document upload → OTP/CAPTCHA test kar sakte hain.');tests.append(button('Open sample form',()=>{if(!Object.keys(workspace.profile).length)return profilePanel({fullName:'Test Applicant',firstName:'Test',lastName:'Applicant',fatherName:'Sample Parent',dob:'01/01/2000',email:'test@example.com',mobile:'9876543210',address:'Example Lane',state:'Delhi',city:'Delhi',pincode:'110001'});if(onPhone){hideSheet();native.openDemo();}}));box.append(tests);
    append(box,'p','hint','AvsarGo AI · V12 test source · Independent application assistant');sheet('Settings',box,[{text:'Done',primary:true,action:hideSheet}]);
  }
  window.AvsarGoEvent=(name,data)=>{
    switch(name){
      case 'documentAdded':refresh();message('assistant','“'+data.item.name+'” privately save ho gaya. Text scan ho raha hai…');break;
      case 'ocrResult':for(const [key,value]of Object.entries(data.fields||{}))if(userFields.includes(key)&&value)pendingOcr[key]=value;
        if(!importing){message('assistant','Document scan complete. Extracted details original document se review karein.',[{text:'Review details',action:()=>profilePanel(pendingOcr),primary:true}]);profilePanel(pendingOcr);}break;
      case 'importDone':importing=false;refresh();notify(data.message);if(Object.keys(pendingOcr).length){message('assistant','Documents scan complete. Details ko ek saath review aur approve karein.',[{text:'Review extracted details',action:()=>profilePanel(pendingOcr),primary:true}]);profilePanel(pendingOcr);}break;
      case 'ocrError':message('assistant','Text scan nahi hua: '+data.message+'\nSaved document ko dobara scan kar sakte hain ya details manually review karein.',[{text:'Enter details',action:()=>profilePanel()}]);break;
      case 'documentError':notify(data.message);break;
      case 'documentRemoved':refresh();notify(data.message);if($('docList'))renderDocs($('docList'));break;
      case 'profileSaved':refresh();notify(data.message);if(data.ok){hideSheet();pendingOcr={};progress();message('assistant','Details reviewed aur save ho gayi hain. Ab official application app mein khol sakte hain.',[{text:'Open form',action:browserPanel,primary:true}]);}break;
      case 'profileUpdated':refresh();notify(data.message);progress();break;
      case 'keySaved':refresh();notify(data.message);break;
      case 'aiReply':if(data.requestId&&data.requestId!==requestId)break;awaiting=false;$('send').disabled=false;pendingNode?.remove();pendingNode=null;
        message('assistant',data.ok?data.text:'AI connection issue: '+data.text,data.ok&&currentService?actions():[{text:'Settings',action:settingsPanel}],true,!!data.ok);break;
      case 'storageError':notify(data.message);break;
      case 'erased':if(!data.ok){notify(data.message);break;}clearTimeout(saveTimer);requestId='';pendingNode?.remove();chatMessages=[];currentService='';currentCustomService='';pendingOcr={};awaiting=false;importing=false;refresh();$('messages').replaceChildren();$('welcome').hidden=false;$('send').disabled=false;$('chatInput').value='';$('progressPill').hidden=true;storage.removeItem('av_cloud_opt_in');hideSheet();notify(data.message);break;
    }
  };
  window.avsargoOnReturn=()=>{refresh();progress();};
  window.avsargoHandleBack=()=>{if(!$('modal').hidden){hideSheet();return true;}if($('drawer').classList.contains('open')){toggleMenu(false);return true;}return false;};
  $('menuButton').onclick=()=>toggleMenu(true);$('closeMenu').onclick=()=>toggleMenu(false);$('scrim').onclick=()=>toggleMenu(false);
  $('newChat').onclick=()=>{if(awaiting)return notify('Current reply complete hone dein');toggleMenu(false);chatMessages=[];currentService='';currentCustomService='';pendingNode?.remove();requestId='';$('messages').replaceChildren();$('welcome').hidden=false;progress();persist();};
  $('openDocs').onclick=uploadDocs;$('openProfile').onclick=()=>profilePanel();$('openBrowser').onclick=browserPanel;$('openSettings').onclick=settingsPanel;
  $('profileShortcut').onclick=()=>profilePanel();$('attach').onclick=uploadDocs;$('closeSheet').onclick=hideSheet;$('send').onclick=()=>answer($('chatInput').value);
  $('chatInput').oninput=grow;$('chatInput').addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();answer(event.target.value);}});
  document.querySelectorAll('[data-prompt]').forEach(b=>b.onclick=()=>answer(b.dataset.prompt));
  refresh();const old=workspace.workspace||{};currentService=services[old.service]||old.service==='general'?old.service:'';currentCustomService=old.custom||'';
  if(Array.isArray(old.messages))for(const item of old.messages.slice(-80))if(['assistant','user'].includes(item.role))message(item.role,String(item.text),[],false);
  chatMessages=Array.isArray(old.messages)?old.messages.slice(-80):[];progress();
})();
