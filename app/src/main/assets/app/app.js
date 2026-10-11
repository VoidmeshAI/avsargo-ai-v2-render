(() => {
  'use strict';
  const $=id=>document.getElementById(id),native=window.AvsarGoNative,onPhone=!!native;
  const storage=(()=>{try{return window.localStorage;}catch(_){return {getItem:()=>null,setItem:()=>{},removeItem:()=>{}};}})();
  const userFields=['fullName','firstName','middleName','lastName','fatherName','motherName','dob','mobile','email','address','state','city','district','pincode','gender','nationality','qualification','category','domicile','board','school','passingYear','percentage','course','rollNumber'];
  const labels={fullName:'Full name',firstName:'First name',middleName:'Middle name',lastName:'Last name',fatherName:"Father’s name",motherName:"Mother’s name",dob:'Date of birth',mobile:'Mobile',email:'Email',address:'Address',state:'State',city:'City',district:'District',pincode:'Postal PIN code',gender:'Gender',nationality:'Nationality',qualification:'Highest qualification',category:'Category',domicile:'Domicile state',board:'Education board / university',school:'School / college',passingYear:'Passing year',percentage:'Percentage',course:'Course / discipline',rollNumber:'Education roll number'};
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
  let workspace={profile:{},documents:[],ai:{},workspace:{},server:{}},currentService='',currentCustomService='',chatMessages=[],awaiting=false,importing=false,pendingOcr={},pendingNode=null,requestId='',saveTimer=null,consentMessage='',analysing=false,autoAnalyseAfterImport=false,importedIds=[];
  function appearance(){const mode=storage.getItem('av_theme')||workspace.server?.branding?.theme||'dark';document.body.classList.toggle('theme-dark',mode!=='light');document.body.classList.toggle('theme-light',mode==='light');native?.setAppearance?.(mode);}
  appearance();
  const node=(tag,cl,text)=>{const el=document.createElement(tag);if(cl)el.className=cl;if(text!==undefined)el.textContent=text;return el;};
  const append=(parent,tag,cl,text)=>{const el=node(tag,cl,text);parent.append(el);return el;};
  function notify(text){$('toast').textContent=text;$('toast').hidden=false;clearTimeout(notify.timer);notify.timer=setTimeout(()=>$('toast').hidden=true,3500);}
  function refresh(){if(!onPhone)return;try{const value=JSON.parse(native.state());workspace={profile:{},documents:[],ai:{},workspace:{},server:{},...value};if(!Array.isArray(workspace.documents))workspace.documents=[];$('docCount').textContent=String(workspace.documents.length);if(workspace.storageError)notify('Saved data read nahi hua. Settings mein help check karein.');}catch(_){notify('Private storage unavailable');}}
  function applyRemote(){const c=workspace.server||{},b=c.branding||{};appearance();document.querySelectorAll('[data-brand]').forEach(n=>n.textContent=b.name||'AvsarGo AI');if($('welcomeTitle')&&b.greeting)$('welcomeTitle').textContent=b.greeting;if($('welcomeCopy')&&b.tagline)$('welcomeCopy').textContent=b.tagline;
    if($('announcement')){$('announcement').hidden=!b.announcement;$('announcement').textContent=b.announcement||'';}
    if(/^#[0-9a-f]{6}$/i.test(b.accent)){document.body.style.setProperty('--accent',b.accent);const v=b.accent.slice(1),l=.299*parseInt(v.slice(0,2),16)+.587*parseInt(v.slice(2,4),16)+.114*parseInt(v.slice(4,6),16);document.body.style.setProperty('--accent-ink',l>155?'#14231b':'#ffffff');}
    for(const [id,url]of Object.entries(c.portals||{}))if(services[id]&&typeof url==='string')services[id].url=url;
  }
  function persist(){if(!onPhone)return;clearTimeout(saveTimer);saveTimer=setTimeout(()=>{try{native.saveWorkspace(JSON.stringify({messages:chatMessages.slice(-80),service:currentService,custom:currentCustomService}));}catch(_){notify('Chat save unavailable');}},180);}
  function toggleMenu(open){$('drawer').classList.toggle('open',open);$('scrim').classList.toggle('visible',open);$('drawer').setAttribute('aria-hidden',String(!open));}
  function hideSheet(){$('modal').hidden=true;$('sheetBody').replaceChildren();$('sheetActions').replaceChildren();}
  function sheet(title,content,buttons=[],eyebrow='AVSARGO'){
    toggleMenu(false);$('sheetTitle').textContent=title;$('sheetEyebrow').textContent=eyebrow;$('sheetBody').replaceChildren(content);$('sheetActions').replaceChildren();$('modal').hidden=false;
    for(const {text,primary,action}of buttons){const b=node('button','btn'+(primary?' primary':''),text);b.onclick=action;$('sheetActions').append(b);}
  }
  function info(parent,text,warn=false){return append(parent,'div','info-box'+(warn?' warning-box':''),text);}
  function button(text,action,primary=false){const b=node('button','chip-action'+(primary?' primary':''),text);b.onclick=action;return b;}
  function inline(parent,text){for(const part of text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g)){if(part.startsWith('**')&&part.endsWith('**'))parent.append(node('strong','',part.slice(2,-2)));else if(part.startsWith('`')&&part.endsWith('`'))parent.append(node('code','',part.slice(1,-1)));else parent.append(node('span','',part));}}
  function formatted(parent,text){let list=null,code=null;for(const line of String(text).split('\n')){if(line.startsWith('```')){if(code){code=null;}else{code=node('pre');parent.append(code);}list=null;continue;}if(code){code.textContent+=(code.textContent?'\n':'')+line;continue;}if(!line.trim()){list=null;continue;}const bullet=line.match(/^\s*(?:[-•*]|\d+\.)\s+(.+)$/);if(bullet){if(!list){list=node('ul');parent.append(list);}const li=node('li');inline(li,bullet[1]);list.append(li);continue;}list=null;const heading=line.match(/^#{1,3}\s+(.+)$/),p=node(heading?'h3':'p');inline(p,heading?heading[1]:line);parent.append(p);}}
  function message(role,text,actions=[],save=true,cloud=role==='user'){
    $('welcome').hidden=true;const wrap=node('div','message '+role);if(role==='assistant')wrap.append(node('div','avatar','✦'));
    const body=node('div','msg-body');if(role==='user')body.textContent=text;else formatted(body,text);if(actions.length){const row=node('div','action-inline');for(const a of actions)row.append(button(a.text,a.action,a.primary));body.append(row);}if(role==='assistant'&&save&&cloud){const tools=node('div','message-tools'),copy=node('button','','Copy response');copy.onclick=()=>{native?.copyText?.(text);notify('Response copied');};tools.append(copy);body.append(tools);}wrap.append(body);$('messages').append(wrap);
    if(save){chatMessages.push({role,text,cloud});chatMessages=chatMessages.slice(-80);persist();}
    requestAnimationFrame(()=>$('chatScroll').scrollTo({top:$('chatScroll').scrollHeight,behavior:'smooth'}));return wrap;
  }
  function grow(){const input=$('chatInput');input.style.height='auto';input.style.height=Math.min(130,input.scrollHeight)+'px';$('send').classList.toggle('empty',!input.value.trim());}
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
  function progress(){refresh();const status=workspace.application?.status||'none',valid=Object.keys(workspace.profile||{}).length>0;$('progressPill').hidden=!currentService;$('progressText').textContent=analysing?'AI is analysing your documents…':status==='analysed'?'AI analysis ready · Review details':valid&&status==='reviewed'?'Profile approved · Autofill your form':workspace.documents.length?'Documents ready · AI → Review → Autofill':'Documents → AI → Review → Autofill';$('progressAction').textContent=status==='analysed'?'Review →':valid?'Open →':'Continue →';$('progressAction').onclick=status==='analysed'?()=>reviewAnalysis():valid?browserPanel:uploadDocs;}
  function answer(raw){
    const text=raw.trim();if(!text||awaiting)return;if(importing||analysing)return notify('Document scan / AI analysis complete hone dein');if(text.length>4000){notify('Message ko 4000 characters se chhota rakhein');return;}
    refresh();if(workspace.server?.maintenance?.enabled)return notify(workspace.server.maintenance.message);
    if(onPhone&&workspace.server?.ai?.ready&&!workspace.ai.enabled){const box=node('div');info(box,'AI chat enable karne par aapke typed messages app ke secure server aur configured AI provider ko jayenge. Documents aur reviewed profile automatically nahi bheje jayenge.');sheet('Chat with AvsarGo',box,[{text:'Abhi nahi',action:hideSheet},{text:'Enable & continue',primary:true,action:()=>{consentMessage=text;hideSheet();native.saveAiSettings(JSON.stringify({enabled:true}));}}]);return;}
    message('user',text);$('chatInput').value='';grow();const id=infer(text);if(id){currentService=id;currentCustomService=id==='general'?text.slice(0,120):'';progress();persist();}
    refresh();if(onPhone&&workspace.ai.enabled&&workspace.server?.ai?.ready){
      awaiting=true;$('send').disabled=true;requestId=String(Date.now())+Math.random().toString(36).slice(2);pendingNode=message('assistant','',[],false);pendingNode.classList.add('typing');const dots=node('div','thinking');dots.setAttribute('aria-label','AvsarGo is thinking');for(let i=0;i<3;i++)dots.append(node('span'));pendingNode.lastElementChild.append(dots);
      try{native.requestAi(JSON.stringify({requestId,workflow:{service:currentService},messages:chatMessages.filter(m=>m.cloud===true||m.role==='user').slice(-16).map(m=>({role:m.role,text:m.text.slice(0,5000)}))}));}catch(_){awaiting=false;$('send').disabled=false;pendingNode?.remove();notify('AI connection unavailable');}return;
    }
    if(id){const s=spec();message('assistant',s.name+' ke liye pehle documents taiyar karte hain.\n\nIndicative checklist:\n'+s.docs.map(x=>'• '+x).join('\n')+'\n\n'+s.note+'\n\nDocuments upload karo, extracted details review karo, phir app ke andar official form kholenge.',actions());}
    else if(currentService&&/done|next|continue|aage|आगे|ho gay[ao]/i.test(text)){message('assistant','Reviewed profile ready hai to official form app mein khol sakte hain. Login, OTP, CAPTCHA, payment aur final submit aap khud karenge.',[{text:'Open form',action:browserPanel,primary:true}]);}
    else message('assistant','Kaunsa form bharna hai? Form ka naam aur state batayein. Documents aur reviewed profile se supported fields fill kar sakte hain.\n\nAbhi live AI connection configured nahi hai. Owner Admin panel mein connection configure kar sakta hai.',[{text:'Settings',action:settingsPanel},{text:'Upload documents',action:uploadDocs}]);
  }
  function reviewAnalysis(){refresh();const candidates=workspace.application?.candidates||[],proposed={};for(const key of userFields){const options=[...new Set(candidates.filter(c=>c.key===key).map(c=>c.value))];if(options.length===1&&!workspace.profile[key])proposed[key]=options[0];}profilePanel(proposed);}
  function beginAnalysis(ids){
    if(importing||analysing||awaiting)return notify('Current operation complete hone dein');if(!ids.length)return notify('Pehle documents scan karein');
    analysing=true;hideSheet();progress();message('assistant','Selected document scans AI ko analyse karne ke liye bhej raha hoon. Details aur mismatches review screen mein aayenge.');
    try{native.analyseDocuments(JSON.stringify({consent:true,ids}));}catch(_){analysing=false;progress();notify('AI analysis unavailable. App refresh karke try karein');}
  }
  function analysePanel(ids){
    refresh();if(!workspace.server?.ai?.ready){profilePanel(pendingOcr);return;}const box=node('div');info(box,'Selected scans ka text app ke server aur owner ke configured AI provider ko jayega. AI extracted values private review screen mein dikhayega; profile mein save tab hoga jab aap approve karoge.');
    const choices=[];for(const item of workspace.documents.filter(d=>!ids||ids.includes(d.id))){const row=node('label','checkrow'),check=node('input');check.type='checkbox';check.checked=item.scanned!==false;check.disabled=item.scanned===false;row.append(check,node('span','',item.name+(item.truncated?' · Partial scan: '+item.pages+' / '+item.totalPages+' pages':'')));box.append(row);choices.push([check,item.id]);}
    const consent=node('label','checkrow'),tick=node('input');tick.type='checkbox';tick.id='documentAiConsent';consent.append(tick,node('span','','Main selected document text ko AI analysis ke liye share karna approve karta/karti hoon.'));box.append(consent);
    sheet('Analyse documents with AI',box,[{text:'Review scan only',action:()=>profilePanel(pendingOcr)},{text:'Analyse with AI',primary:true,action:()=>{if(!tick.checked)return notify('Pehle document AI consent dein');beginAnalysis(choices.filter(([check])=>check.checked&&!check.disabled).map(([,id])=>id));}}]);
  }
  function renderDocs(parent){
    parent.replaceChildren();if(!workspace.documents.length){append(parent,'p','hint','Abhi koi document saved nahi hai.');return;}
    for(const item of workspace.documents){const row=node('div','doc-row');row.append(node('span','doc-icon','▤'));const details=node('div','doc-text');details.append(node('strong','',item.name),node('small','',Math.round(item.size/1024)+' KB · '+(item.scanned?'Scan ready':'Private on phone')+(item.truncated?' · Partial scan':'' )));row.append(details);
      row.append(button('Scan',()=>{if(onPhone&&!importing&&!analysing){hideSheet();pendingOcr={};native.rescanDocument(item.id);notify('Saved document scan ho raha hai…');}}));
      const remove=node('button','doc-remove','✕');remove.setAttribute('aria-label','Delete '+item.name);remove.onclick=()=>{if(importing||analysing)return notify('Document operation complete hone dein');if(confirm('Ye saved document delete karein?'))native?.removeDocument(item.id);};row.append(remove);parent.append(row);}
  }
  function uploadDocs(){
    refresh();const box=node('div');if(currentService)info(box,spec().name+': '+spec().docs.join(' · '));
    info(box,'PDF, JPG ya PNG · Maximum 8 MB/file · 15 saved documents. Ek saath multiple files choose kar sakte hain. Documents phone par encrypted rahenge; OCR on-device chalega. Phir selected scan text ko AI se analyse karwa sakte hain.');
    const tick=node('label','checkrow'),check=node('input');check.type='checkbox';tick.append(check,node('span','','Main selected documents ko phone par encrypted save aur scan karne ki consent deta/deti hoon.'));box.append(tick);
    const cloudCheck=node('input');cloudCheck.type='checkbox';cloudCheck.id='autoDocumentAi';if(workspace.server?.ai?.ready){const cloud=node('label','checkrow');cloud.append(cloudCheck,node('span','','Scan ke baad selected document text AI provider ko bhej kar details automatically analyse karein.'));box.append(cloud);box.append(button('Analyse saved documents with AI',()=>analysePanel()));}
    const list=node('div');list.id='docList';box.append(list);renderDocs(list);
    sheet('My documents',box,[{text:'Close',action:hideSheet},{text:importing?'Scanning…':'Choose documents',primary:true,action:()=>{
      if(importing||analysing||awaiting)return notify('Current scan / AI operation complete hone dein');if(!check.checked)return notify('Pehle consent dein');if(!onPhone)return notify('Android app mein document picker available hai');
      importing=true;pendingOcr={};importedIds=[];autoAnalyseAfterImport=cloudCheck.checked;native.pickDocument();hideSheet();
    }}]);
  }
  function profilePanel(proposed={}){
    refresh();const merged={...proposed,...workspace.profile},box=node('div'),candidates=workspace.application?.candidates||[];if(candidates.length)info(box,workspace.application?.status==='analysed'?'AI analysis complete. Source aur conflicting values neeche review karein.':'Scanned proposals ready. Original document se har value confirm karein.');info(box,'Har detail original document se check karein. OCR galat ho sakta hai. First/middle/last name apni marzi se review karein; app naam ko guess karke split nahi karega.');
    const grid=node('div','field-grid'),inputs={};box.append(grid);
    for(const key of userFields){const group=node('div','form-group'+(key==='address'?' wide':''));const label=append(group,'label','',labels[key]);const input=node(key==='address'?'textarea':'input');input.id='profile-'+key;label.htmlFor=input.id;
      const distinct=[...new Set(candidates.filter(c=>c.key===key).map(c=>c.value))];input.value=String(!workspace.profile[key]&&distinct.length>1?'':merged[key]||'');input.maxLength=key==='address'?500:180;input.autocomplete='off';input.placeholder=key==='dob'?'DD/MM/YYYY':key==='mobile'?'10 digits':key==='pincode'?'6 digits':'';
      if(key==='mobile'||key==='pincode')input.inputMode='numeric';if(key==='email')input.type='email';group.append(input);const sources=candidates.filter(c=>c.key===key);if(sources.length){const sourceBox=node('div','source-options');const values=[...new Set(sources.map(c=>c.value))];if(values.length>1||workspace.profile[key]&&values.some(v=>v!==workspace.profile[key]))append(sourceBox,'p','source-conflict','Values differ — correct detail choose karein');for(const c of sources){const doc=workspace.documents.find(d=>d.id===c.documentId);sourceBox.append(button(c.value,()=>{input.value=c.value;}));append(sourceBox,'small','source-evidence',(doc?.name||'Document')+' · '+(c.confidence||'scan')+' confidence · '+c.evidence);}group.append(sourceBox);}grid.append(group);inputs[key]=input;}
    const tick=node('label','checkrow'),check=node('input');check.type='checkbox';tick.append(check,node('span','','Maine details original documents se verify ki hain. Inhe private profile mein save aur form filling mein use karne ki consent deta/deti hoon.'));box.append(tick);
    sheet('Review applicant details',box,[{text:'Back',action:hideSheet},{text:'Approve & save',primary:true,action:()=>{
      if(!check.checked)return notify('Details verify karke consent dein');const profile={};for(const key of userFields){const value=inputs[key].value.trim();if(value)profile[key]=value;}
      if(!Object.keys(profile).length)return notify('Kam se kam ek detail enter karein');if(!onPhone)return notify('Private profile Android app mein save hoga');native.saveProfile(JSON.stringify(profile));
    }}]);
  }
  function browserPanel(){
    refresh();const s=spec(),box=node('div'),valid=Object.keys(workspace.profile).length>0;
    info(box,'Official form app ke andar khulega. Aap login karein; Assist reviewed blank fields fill karega. Missing supported details popup mein poochhega. Website session ki permission dene par agle steps par filling continue ho sakti hai.');
    if(workspace.server?.ai?.ready){const row=node('label','checkrow'),check=node('input');check.type='checkbox';check.id='formAiConsent';row.append(check,node('span','','AI Assist: blank form ke labels/options AI ko bhej kar profile se match karein. Profile values phone par rahengi.'));box.append(row);}
    const group=node('div','form-group');const label=append(group,'label','','Official application link');const input=node('input');input.id='portalUrl';label.htmlFor=input.id;input.placeholder='https://…gov.in';input.value=s.url;input.autocapitalize='none';input.spellcheck=false;group.append(input);box.append(group);
    info(box,s.note);append(box,'p','hint','Login, OTP, CAPTCHA, fees, eSign, declaration, appointments aur final submission aapke control mein hain. Kuch portals embedded browser ko block karte hain.');
    if(!valid)info(box,'Pehle documents ki details review aur save karein.',true);
    sheet('Open your application',box,[{text:'Back',action:hideSheet},{text:valid?'Open in-app browser':'Review profile',primary:true,action:()=>{
      if(!valid){profilePanel(pendingOcr);return;}
      let url;try{url=new URL(input.value.trim());}catch(_){return notify('Valid HTTPS application link daalein');}
      if(url.protocol!=='https:'||url.username||url.password||!(/(?:\.gov\.in|\.nic\.in)$/i.test(url.hostname)||['onlineservices.proteantech.in','www.onlineservices.proteantech.in','pan.utiitsl.com','www.pan.utiitsl.com'].includes(url.hostname))||url.port&&url.port!=='443')return notify('Official HTTPS government / verified PAN operator link chahiye');
      if(!onPhone)return notify('In-app browser Android app mein available hai');const useAi=!!$('formAiConsent')?.checked;native.setFormAiConsent?.(useAi);hideSheet();native.openPortal(url.href);
    }}]);
  }
  function settingsPanel(){
    refresh();const box=node('div');append(box,'h3','','Appearance');const modes=node('div','action-inline');for(const mode of ['auto','light','dark'])modes.append(button(mode==='auto'?'App default':mode==='light'?'Light':'Dark',()=>{if(mode==='auto')storage.removeItem('av_theme');else storage.setItem('av_theme',mode);appearance();}));box.append(modes);
    append(box,'h3','','AI chat');const consent=node('label','checkrow'),enabled=node('input');enabled.type='checkbox';enabled.id='cloudConsent';enabled.checked=!!workspace.ai.enabled;consent.append(enabled,node('span','','Enable cloud chat. Typed messages are sent to the app server and its AI provider. Uploaded scans and reviewed profile are not sent automatically.'));box.append(consent);
    info(box,workspace.server?.ai?.ready?'AI connection is configured by the owner.':'AI is not configured yet. The owner can add a provider key, save it and test the connection in Admin panel.');
    box.append(button('Save chat preference',()=>{if(!onPhone)return notify('Android app required');native.saveAiSettings(JSON.stringify({enabled:enabled.checked}));},true));
    append(box,'h3','','AvsarGo Plus');const p=workspace.server?.payment||{};info(box,p.ready?p.planName+' · ₹'+(p.pricePaise/100).toFixed(2)+' / '+p.durationDays+' days'+(p.mode==='test'?' · Test payment':''):'Plus payments are currently disabled.');
    const account=node('p','hint',workspace.account?.paid?'Plus active until '+new Date(workspace.account.plusUntil).toLocaleDateString():workspace.account?'Today: '+workspace.account.used+' / '+workspace.account.dailyLimit+' AI chats':'Your allowance will appear after the next refresh.');box.append(account);
    if(p.ready)box.append(button(p.mode==='test'?'Open test checkout':'Get Plus',()=>native?.createPayment?.(),true));
    box.append(button('Refresh app settings',()=>{native?.fetchConfig?.();notify('Refreshing settings…');}));
    append(box,'h3','','Owner controls');info(box,'Manage AI/payment keys, pricing, app appearance, usage limits, support and official portals. Owner sign-in is required.');box.append(button('Open admin panel',()=>{hideSheet();native?.openAdmin?.();},true));
    const b=workspace.server?.branding||{};if(b.supportEmail)info(box,'Support: '+b.supportEmail);if(b.supportUrl)box.append(button('Open support',()=>native?.openSupport?.()));
    append(box,'h3','','Privacy');info(box,'Documents, reviewed profile and chat are encrypted on this phone. Selected scan text is shared with AI only after you approve document analysis. A document is shared with a portal after you approve its upload. Plus is linked to this app installation.');
    box.append(button('Delete all app data',()=>{if(importing||analysing||awaiting)return notify('Current scan / AI response complete hone dein');if(confirm('Documents, profile, chat, AI preference and website login sessions permanently delete karein? Plus access on this installation will also be removed.'))native?.eraseLocalData();}));
    const tests=node('details','advanced-settings');append(tests,'summary','','Test tools');info(tests,'Local sample form real government site nahi hai. Dummy profile ke saath login → details → next step → document upload → OTP/CAPTCHA test kar sakte hain.');tests.append(button('Open sample form',()=>{if(!Object.keys(workspace.profile).length)return profilePanel({fullName:'Test Applicant',firstName:'Test',lastName:'Applicant',fatherName:'Sample Parent',dob:'01/01/2000',email:'test@example.com',mobile:'9876543210',address:'Example Lane',state:'Delhi',city:'Delhi',pincode:'110001'});if(onPhone){hideSheet();native.openDemo();}}));box.append(tests);
    append(box,'p','hint','AvsarGo AI · Android 14.0 test · Independent application assistant');sheet('Your settings',box,[{text:'Done',primary:true,action:hideSheet}]);
  }
  window.AvsarGoEvent=(name,data)=>{
    switch(name){
      case 'documentAdded':refresh();message('assistant','“'+data.item.name+'” privately save ho gaya. Text scan ho raha hai…');break;
      case 'ocrResult':for(const [key,value]of Object.entries(data.fields||{}))if(userFields.includes(key)&&value){if(!pendingOcr[key])pendingOcr[key]=value;else if(pendingOcr[key]!==value)delete pendingOcr[key];}
        if(data.documentId&&!importedIds.includes(data.documentId))importedIds.push(data.documentId);if(data.truncated)message('assistant','Partial scan: '+data.pages+' / '+data.totalPages+' pages. Baaki required pages alag file mein upload karein; AI sirf scanned text use karega.');
        if(!importing){refresh();message('assistant','Document scan ready. Ab AI se details analyse karke review kar sakte hain.',[{text:'Analyse with AI',action:()=>analysePanel(data.documentId?[data.documentId]:undefined),primary:true},{text:'Review scan',action:()=>profilePanel(pendingOcr)}]);progress();}break;
      case 'importDone':importing=false;refresh();notify(data.message);progress();if(autoAnalyseAfterImport&&importedIds.length){autoAnalyseAfterImport=false;beginAnalysis(importedIds);}
        else if(workspace.server?.ai?.ready&&importedIds.length){message('assistant','Documents scan complete. AI details nikaalega aur mismatches review ke liye dikhayega.',[{text:'Analyse with AI',action:()=>analysePanel(importedIds),primary:true}]);analysePanel(importedIds);}
        else if(Object.keys(pendingOcr).length){message('assistant','Documents scan complete. Details ko ek saath review aur approve karein.',[{text:'Review extracted details',action:()=>profilePanel(pendingOcr),primary:true}]);profilePanel(pendingOcr);}break;
      case 'documentAnalysis':analysing=false;refresh();progress();if(data.ok){message('assistant',data.candidates?.length?'AI ne selected scans se '+data.candidates.length+' details propose ki hain. Sources check karo, mismatch resolve karo, phir approve karke form autofill karenge.':'AI ko readable applicant details nahi mili. Clearer scan try karo ya review screen mein details enter karo.',[{text:'Review AI details',action:reviewAnalysis,primary:true}]);reviewAnalysis();}else{message('assistant','AI document analysis complete nahi hua: '+data.message,[{text:'Try analysis again',action:()=>analysePanel(),primary:true},{text:'Review scan',action:()=>profilePanel(pendingOcr)}]);}break;
      case 'formFilled':refresh();progress();message('assistant',data.message,[{text:'Continue in form',action:()=>native?.resumePortal?.()}]);break;
      case 'ocrError':message('assistant','Text scan nahi hua: '+data.message+'\nSaved document ko dobara scan kar sakte hain ya details manually review karein.',[{text:'Enter details',action:()=>profilePanel()}]);break;
      case 'documentError':notify(data.message);break;
      case 'documentRemoved':refresh();notify(data.message);if($('docList'))renderDocs($('docList'));break;
      case 'profileSaved':refresh();notify(data.message);if(data.ok){hideSheet();pendingOcr={};progress();message('assistant','Details reviewed aur save ho gayi hain. Ab official application app mein khol sakte hain.',[{text:'Open form',action:browserPanel,primary:true}]);}break;
      case 'profileUpdated':refresh();notify(data.message);progress();break;
      case 'keySaved':refresh();notify(data.message);if(data.ok&&consentMessage){const text=consentMessage;consentMessage='';answer(text);}break;
      case 'configUpdated':refresh();applyRemote();if(!data.ok)notify(data.message);break;
      case 'paymentStatus':refresh();notify(data.message);break;
      case 'aiReply':if(data.requestId&&data.requestId!==requestId)break;awaiting=false;$('send').disabled=false;pendingNode?.remove();pendingNode=null;
        message('assistant',data.ok?data.text:'AI connection issue: '+data.text,data.ok&&currentService?actions():[{text:'Settings',action:settingsPanel}],true,!!data.ok);break;
      case 'storageError':notify(data.message);break;
      case 'erased':if(!data.ok){notify(data.message);break;}clearTimeout(saveTimer);requestId='';pendingNode?.remove();chatMessages=[];currentService='';currentCustomService='';pendingOcr={};awaiting=false;importing=false;analysing=false;autoAnalyseAfterImport=false;importedIds=[];refresh();$('messages').replaceChildren();$('welcome').hidden=false;$('send').disabled=false;$('chatInput').value='';$('progressPill').hidden=true;storage.removeItem('av_cloud_opt_in');hideSheet();notify(data.message);break;
    }
  };
  window.avsargoOnReturn=()=>{refresh();progress();native?.fetchConfig?.();};
  window.avsargoHandleBack=()=>{if(!$('modal').hidden){hideSheet();return true;}if($('drawer').classList.contains('open')){toggleMenu(false);return true;}return false;};
  $('menuButton').onclick=()=>toggleMenu(true);$('closeMenu').onclick=()=>toggleMenu(false);$('scrim').onclick=()=>toggleMenu(false);
  $('newChat').onclick=()=>{if(awaiting)return notify('Current reply complete hone dein');toggleMenu(false);chatMessages=[];currentService='';currentCustomService='';pendingNode?.remove();requestId='';$('messages').replaceChildren();$('welcome').hidden=false;progress();persist();};
  $('openDocs').onclick=uploadDocs;$('openProfile').onclick=()=>profilePanel();$('openBrowser').onclick=browserPanel;$('openSettings').onclick=settingsPanel;
  $('profileShortcut').onclick=()=>profilePanel();$('attach').onclick=uploadDocs;$('closeSheet').onclick=hideSheet;$('send').onclick=()=>answer($('chatInput').value);
  if($('topNewChat'))$('topNewChat').onclick=$('newChat').onclick;if($('brandSettings'))$('brandSettings').onclick=settingsPanel;
  $('chatInput').oninput=grow;$('chatInput').addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();answer(event.target.value);}});
  document.querySelectorAll('[data-prompt]').forEach(b=>b.onclick=()=>answer(b.dataset.prompt));
  refresh();const old=workspace.workspace||{};currentService=services[old.service]||old.service==='general'?old.service:'';currentCustomService=old.custom||'';
  if(Array.isArray(old.messages))for(const item of old.messages.slice(-80))if(['assistant','user'].includes(item.role))message(item.role,String(item.text),[],false);
  chatMessages=Array.isArray(old.messages)?old.messages.slice(-80):[];progress();applyRemote();grow();native?.fetchConfig?.();
})();
