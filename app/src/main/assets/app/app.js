/* Generated from ui/app.source.js for older Android WebViews. */
(() => {
    'use strict';
    var _a, _b, _c;
    const $ = id => document.getElementById(id), native = window.AvsarGoNative;
    const el = (tag, cl, text) => { const n = document.createElement(tag); if (cl)
        n.className = cl; if (text !== undefined)
        n.textContent = text; return n; };
    const add = (p, tag, cl, text) => { const n = el(tag, cl, text); p.append(n); return n; };
    const icon = (id) => { const n = document.createElementNS('http://www.w3.org/2000/svg', 'svg'), u = document.createElementNS('http://www.w3.org/2000/svg', 'use'); u.setAttribute('href', '#i-' + id); n.append(u); return n; };
    const fixed = window.AvsarGoFields || [], catalog = [{ id: 'udyam', name: 'Udyam / MSME registration', url: 'https://udyamregistration.gov.in/UdyamRegistration.aspx', match: /udyam|udhyam|udyog|udhyog|msme|उद्यम|उद्योग/i }, { id: 'pan', name: 'PAN application', url: 'https://onlineservices.proteantech.in/paam/endUserRegisterContact.html', match: /\bpan\b|पैन/i }, { id: 'ssc', name: 'SSC examination', url: 'https://ssc.gov.in/', match: /ssc|cgl|chsl/i }, { id: 'dl', name: 'Driving licence', url: 'https://sarathi.parivahan.gov.in/', match: /driving|licen[cs]e|ड्राइविंग/i }];
    let state = { profile: {}, profileMeta: {}, documents: [], application: {}, ai: {}, server: {}, account: {}, workspace: {} }, chats = [], activeId = '', messages = [], application = null, awaiting = false, importing = false, analysing = false, resolving = false, addedDuringImport = false, pendingNode = null, requestId = '', afterPermission = null, openAfterReview = false, saveTimer = null, modalKind = '';
    const storage = (() => { try {
        return localStorage;
    }
    catch (_a) {
        return { getItem: () => null, setItem: () => { } };
    } })();
    function toast(text) { $('toast').textContent = text; $('toast').hidden = false; clearTimeout(toast.timer); toast.timer = setTimeout(() => $('toast').hidden = true, 3800); }
    function refresh() { if (!native)
        return; try {
        state = { ...state, ...JSON.parse(native.state()) };
    }
    catch (_a) {
        toast('Private workspace could not be read. Please reopen the app.');
    } state.documents = Array.isArray(state.documents) ? state.documents : []; state.profile || (state.profile = {}); state.profileMeta || (state.profileMeta = {}); state.application || (state.application = {}); state.ai || (state.ai = {}); state.server || (state.server = {}); state.account || (state.account = {}); }
    function theme(mode) { var _a, _b; mode = mode || storage.getItem('av_theme') || ((_a = state.server.branding) === null || _a === void 0 ? void 0 : _a.theme) || 'dark'; document.body.classList.toggle('theme-dark', mode !== 'light'); document.body.classList.toggle('theme-light', mode === 'light'); (_b = native === null || native === void 0 ? void 0 : native.setAppearance) === null || _b === void 0 ? void 0 : _b.call(native, mode); }
    function remote() { var _a; theme(); const b = state.server.branding || {}; document.querySelectorAll('[data-brand]').forEach(n => n.textContent = (b.name || 'AvsarGo').replace(/\s+AI$/i, '')); if (b.greeting && !['Kis form mein madad chahiye?', 'What can I help with?', 'From documents to done.', 'From documents to done'].includes(b.greeting))
        $('welcomeTitle').textContent = b.greeting; if (b.tagline && !['Your AI application assistant', 'A little guidance. A lot less paperwork.'].includes(b.tagline))
        $('welcomeCopy').textContent = b.tagline; if (/^#[a-f0-9]{6}$/i.test(b.accent)) {
        document.body.style.setProperty('--accent', b.accent);
        const v = b.accent.slice(1), l = .299 * parseInt(v.slice(0, 2), 16) + .587 * parseInt(v.slice(2, 4), 16) + .114 * parseInt(v.slice(4), 16);
        document.body.style.setProperty('--accent-ink', l > 155 ? '#15281e' : '#fff');
    } $('announcement').hidden = !b.announcement; $('announcement').textContent = b.announcement || ''; $('connectionText').textContent = ((_a = state.server.ai) === null || _a === void 0 ? void 0 : _a.ready) ? 'AI ready' : 'Ready to help'; $('docCount').textContent = state.documents.length; $('attachCount').hidden = !state.documents.length; $('attachCount').textContent = state.documents.length; $('profileDot').style.opacity = Object.keys(state.profile).length ? '1' : '.3'; const name = state.profile.fullName || 'Your workspace'; $('accountName').textContent = name; $('accountInitial').textContent = name.charAt(0).toUpperCase(); workflow(); syncChrome(); }
    function menu(open) { var _a, _b; if ((_b = (_a = window.matchMedia) === null || _a === void 0 ? void 0 : _a.call(window, '(min-width:760px) and (min-height:480px)')) === null || _b === void 0 ? void 0 : _b.matches) {
        if (open)
            document.body.classList.toggle('sidebar-collapsed');
        $('drawer').setAttribute('aria-hidden', 'false');
        $('scrim').classList.remove('visible');
        return;
    } $('drawer').classList.toggle('open', open); $('drawer').setAttribute('aria-hidden', String(!open)); $('scrim').classList.toggle('visible', open); }
    function closeSheet() { modalKind = ''; $('modal').hidden = true; $('sheetBody').replaceChildren(); $('sheetActions').replaceChildren(); }
    function button(text, fn, primary = false) { const b = el('button', 'chip-action' + (primary ? ' primary' : ''), text); b.onclick = fn; return b; }
    function sheet(title, body, actions = [], kind = '') { menu(false); modalKind = kind; $('sheetTitle').textContent = title; $('sheetEyebrow').textContent = kind === 'review' ? 'REVIEW YOUR DETAILS' : 'YOUR WORKSPACE'; $('sheetBody').replaceChildren(body); $('sheetActions').replaceChildren(); for (const a of actions) {
        const b = el('button', 'btn' + (a.primary ? ' primary' : ''), a.text);
        b.onclick = a.action;
        $('sheetActions').append(b);
    } $('modal').hidden = false; }
    function info(p, text, warn = false) { return add(p, 'div', 'info-box' + (warn ? ' warning-box' : ''), text); }
    function persist() { if (!native)
        return; clearTimeout(saveTimer); saveTimer = setTimeout(() => { const c = chats.find(c => c.id === activeId); if (c) {
        c.messages = messages.slice(-40);
        c.application = application;
    } native.saveWorkspace(JSON.stringify({ chats: chats.slice(-20), activeId, messages: messages.slice(-40), application, draft: $('chatInput').value.slice(0, 4000) })); history(); }, 120); }
    function history() { const query = ($('historySearch').value || '').toLowerCase().trim(); $('history').replaceChildren(); const visible = [...chats].reverse().filter(c => !query || (c.title || '').toLowerCase().includes(query) || (c.messages || []).some(m => m.text.toLowerCase().includes(query))); if (!visible.length) {
        add($('history'), 'div', 'history-empty', query ? 'No matching conversations.' : 'Your conversations will appear here.');
        return;
    } for (const c of visible) {
        const row = add($('history'), 'div', 'history-row' + (c.id === activeId ? ' active' : '')), b = add(row, 'button', 'history-item');
        b.append(el('span', '', c.title || 'New conversation'));
        b.onclick = () => switchChat(c.id);
        const more = add(row, 'button', 'history-menu', '···');
        more.setAttribute('aria-label', 'Manage ' + (c.title || 'conversation'));
        more.onclick = () => manageChat(c);
    } }
    function manageChat(c) { const body = el('div'), field = add(body, 'div', 'field'); add(field, 'label', '', 'Conversation name'); const input = add(field, 'input'); input.value = c.title || 'New conversation'; input.maxLength = 80; sheet('Conversation', body, [{ text: 'Delete chat', action: () => { const index = chats.indexOf(c); if (index >= 0)
                chats.splice(index, 1); closeSheet(); if (c.id === activeId) {
                activeId = '';
                messages = [];
                newChat();
            }
            else {
                history();
                persist();
            } } }, { text: 'Save name', primary: true, action: () => { c.title = input.value.trim().slice(0, 80) || 'New conversation'; closeSheet(); history(); persist(); } }]); }
    function syncChrome() { const chatting = messages.length > 0 || awaiting; document.body.classList.toggle('is-chatting', chatting); document.body.classList.toggle('is-welcome', !chatting); $('starterActions').hidden = chatting; const count = state.documents.length, reviewed = Object.keys(state.profile).length; $('headerDocCount').textContent = count; $('panelDocStatus').textContent = count ? `${count} documents in your workspace` : 'Add your first document'; $('panelProfileStatus').textContent = reviewed ? `${reviewed} reviewed details` : 'Review extracted details'; $('panelTitle').textContent = (application === null || application === void 0 ? void 0 : application.name) || 'Your next application'; $('panelCopy').textContent = application ? 'Your documents and details are ready to use on the official form.' : 'Documents and reviewed details, ready when you need them.'; $('panelStepDocs').classList.toggle('done', count > 0); $('panelStepReview').classList.toggle('done', reviewed > 0); $('panelStepApply').classList.toggle('done', !!application); }
    function newChat() { if (awaiting || importing || analysing || resolving)
        return toast('Let the current task finish first.'); if (messages.length) {
        const previous = chats.find(c => c.id === activeId);
        if (previous) {
            previous.messages = [...messages];
            previous.application = application;
        }
    } activeId = 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5); messages = []; application = null; chats.push({ id: activeId, title: 'New conversation', messages: [] }); chats = chats.slice(-20); $('messages').replaceChildren(); $('welcome').hidden = false; menu(false); workflow(); history(); persist(); syncChrome(); }
    function switchChat(id) { if (awaiting || importing || analysing || resolving)
        return toast('Let the current task finish first.'); const current = chats.find(c => c.id === activeId); if (current) {
        current.messages = messages;
        current.application = application;
    } const c = chats.find(c => c.id === id); if (!c)
        return; activeId = id; messages = c.messages || []; application = c.application || null; renderMessages(); workflow(); history(); menu(false); persist(); }
    function inline(p, text) { for (const part of String(text).split(/(\*\*[^*]+\*\*|`[^`]+`)/g)) {
        p.append(el(part.startsWith('**') ? 'strong' : part.startsWith('`') ? 'code' : 'span', '', part.startsWith('**') ? part.slice(2, -2) : part.startsWith('`') ? part.slice(1, -1) : part));
    } }
    function formatted(p, text) { let list = null, code = null; for (const line of String(text).split('\n')) {
        if (/^```/.test(line)) {
            if (code)
                code = null;
            else
                code = add(p, 'pre');
            list = null;
            continue;
        }
        if (code) {
            code.textContent += (code.textContent ? '\n' : '') + line;
            continue;
        }
        if (!line.trim()) {
            list = null;
            continue;
        }
        const m = line.match(/^\s*(?:[-•*]|\d+\.)\s+(.+)$/);
        if (m) {
            if (!list)
                list = add(p, 'ul');
            inline(add(list, 'li'), m[1]);
        }
        else {
            list = null;
            const h = line.match(/^#{1,3}\s+(.+)$/);
            inline(add(p, h ? 'h3' : 'p'), h ? h[1] : line);
        }
    } }
    function renderMessage(m) { var _a; $('welcome').hidden = true; const n = el('div', 'message ' + m.role); if (m.role === 'assistant')
        n.append(el('div', 'avatar', '✦')); const body = el('div', 'msg-body' + (m.error ? ' error-box' : '')); if (m.role === 'user')
        body.textContent = m.text;
    else
        formatted(body, m.text); n.append(body); if (m.error) {
        const row = add(body, 'div', 'action-inline');
        row.append(button('Retry', () => retry(), true));
    }
    else if (m.research) {
        const card = add(body, 'div', 'research-card');
        add(card, 'div', 'card-overline', 'LIVE · OFFICIAL SOURCES');
        add(card, 'h3', '', 'Fresh information, with sources');
        add(card, 'p', '', ((_a = m.research.sources) === null || _a === void 0 ? void 0 : _a.length) + ' official sources · ' + new Date(m.research.searchedAt || Date.now()).toLocaleDateString());
        card.append(button('Read results & sources ↗', () => { var _a; return (_a = native === null || native === void 0 ? void 0 : native.showResearch) === null || _a === void 0 ? void 0 : _a.call(native, JSON.stringify(m.research)); }, true));
    }
    else if (m.application) {
        formCard(body, m.application);
    }
    else if (m.role === 'assistant' && m.cloud) {
        const row = add(body, 'div', 'message-tools');
        const b = add(row, 'button', '', 'Copy');
        b.onclick = () => { var _a; (_a = native === null || native === void 0 ? void 0 : native.copyText) === null || _a === void 0 ? void 0 : _a.call(native, m.text); toast('Response copied'); };
    } if (m.actions) {
        const row = add(body, 'div', 'action-inline');
        for (const a of m.actions)
            row.append(button(a.text, a.action, a.primary));
    } $('messages').append(n); syncChrome(); return n; }
    function message(role, text, extra = {}) { const m = { role, text, cloud: role === 'user', ...extra }; messages.push(m); messages = messages.slice(-40); const c = chats.find(c => c.id === activeId); if (c && role === 'user' && c.title === 'New conversation')
        c.title = text.slice(0, 48); const n = renderMessage(m); persist(); requestAnimationFrame(() => $('chatScroll').scrollTo({ top: $('chatScroll').scrollHeight, behavior: 'smooth' })); return n; }
    function renderMessages() { $('messages').replaceChildren(); $('welcome').hidden = messages.length > 0; for (const m of messages)
        renderMessage(m); syncChrome(); }
    function formCard(parent, a) { const card = add(parent, 'div', 'form-card'); add(card, 'div', 'card-overline', 'OFFICIAL APPLICATION'); add(card, 'h3', '', a.name); let host = ''; try {
        host = new URL(a.url).hostname;
    }
    catch (_a) { } add(card, 'div', 'form-domain', '✓ ' + host); add(card, 'p', '', 'Your reviewed details will fill matching blank fields. Complete OTP and final submission on the portal.'); const row = add(card, 'div', 'action-inline'); row.append(button('Open & autofill ↗', () => launchApplication(a), true), button('Prepare documents', uploadDocuments)); }
    function workflow() { var _a; const status = ((_a = state.application) === null || _a === void 0 ? void 0 : _a.status) || 'none', has = Object.keys(state.profile || {}).length > 0; $('progressPill').hidden = !application && !importing && !analysing; if ($('progressPill').hidden)
        return; $('progressText').textContent = importing ? 'Scanning every page…' : analysing ? 'Reading text + document images…' : (application === null || application === void 0 ? void 0 : application.name) || 'Prepare your application'; const index = importing ? 0 : analysing ? 1 : status === 'analysed' ? 2 : has ? 3 : state.documents.length ? 1 : 0; $('workflowSteps').replaceChildren(); ['Documents', 'Extract', 'Review', 'Autofill'].forEach((text, i) => { if (i)
        add($('workflowSteps'), 'span', 'workflow-line'); const step = add($('workflowSteps'), 'span', 'workflow-step' + (i < index ? ' done' : i === index ? ' current' : '')); add(step, 'span', 'step-number', i < index ? '✓' : String(i + 1)); add(step, 'span', '', text); }); $('progressAction').textContent = importing || analysing ? 'In progress' : status === 'analysed' ? 'Review ↗' : has && application ? 'Open ↗' : 'Continue ↗'; $('progressAction').onclick = () => { if (importing || analysing)
        return; status === 'analysed' ? reviewProfile(true) : has && application ? launchApplication() : documentsPanel(); }; }
    function grow() { const i = $('chatInput'); i.style.height = 'auto'; i.style.height = Math.min(135, i.scrollHeight) + 'px'; $('send').classList.toggle('empty', !i.value.trim()); }
    function permission(action) { refresh(); if (state.ai.automationConsent) {
        action();
        return;
    } afterPermission = action; const body = el('div'); info(body, 'Use your selected documents with AI to extract details and autofill matching fields. This choice is saved for your next applications.'); sheet('Use documents with AI', body, [{ text: 'Later', action: () => { afterPermission = null; closeSheet(); } }, { text: 'Allow & continue', primary: true, action: () => { closeSheet(); if (native)
                native.savePermissions(true);
            else {
                state.ai = { enabled: true, automationConsent: true };
                const done = afterPermission;
                afterPermission = null;
                done === null || done === void 0 ? void 0 : done();
            } } }], 'consent'); }
    const live = q => /latest|current|abhi|आज|अभी|vacanc|government.?jobs|sarkari.?naukri|notification|last.?date|भर्त/i.test(q);
    function formIntent(q) { if (live(q) || /what is|kya hai|क्या है|fees?|documents chahiye|eligibility/i.test(q))
        return false; return /bhar|fill|apply|application|registration|register|ke liye|k liye|आवेदन|भर|बनवा|form|फॉर्म/i.test(q) || catalog.some(c => c.match.test(q)); }
    function answer(raw) { var _a; const text = raw.trim(); if (!text || awaiting || resolving)
        return; if (importing || analysing)
        return toast('Document processing is still running.'); if (text.length > 4000)
        return toast('Keep a message under 4000 characters.'); refresh(); if ((_a = state.server.maintenance) === null || _a === void 0 ? void 0 : _a.enabled)
        return toast(state.server.maintenance.message); const send = () => { message('user', text); $('chatInput').value = ''; grow(); if (formIntent(text)) {
        resolveApplication(text);
        return;
    } if (/^(done|continue|next|aage)$/i.test(text) && application) {
        launchApplication();
        return;
    } requestChat(); }; send(); }
    function requestChat() { refresh(); if (!native) {
        message('assistant', 'Name your application, or add documents to prepare your reviewed profile.', { actions: [{ text: 'Upload documents', action: uploadDocuments, primary: true }] });
        return;
    } awaiting = true; $('send').disabled = true; requestId = 'r' + Date.now().toString(36); pendingNode = renderMessage({ role: 'assistant', text: '' }); pendingNode.classList.add('typing'); const dots = add(pendingNode.lastElementChild, 'div', 'thinking'); dots.setAttribute('aria-label', 'AvsarGo is thinking'); for (let i = 0; i < 3; i++)
        add(dots, 'span'); const history = messages.filter(m => !m.error && (m.cloud || m.role === 'user')).slice(-16).map(m => ({ role: m.role, text: m.text.slice(0, 5000) })); try {
        native.requestAi(JSON.stringify({ requestId, messages: history, workflow: { service: (application === null || application === void 0 ? void 0 : application.id) || '' } }));
    }
    catch (_a) {
        finishReply({ ok: false, text: 'Connection could not start. Retry in a moment.', requestId });
    } }
    function retry() { if (awaiting || resolving)
        return; const last = messages[messages.length - 1]; if (last === null || last === void 0 ? void 0 : last.error) {
        messages.pop();
        renderMessages();
    } requestChat(); }
    function finishReply(data) { var _a; if (data.requestId !== requestId)
        return; awaiting = false; $('send').disabled = false; pendingNode === null || pendingNode === void 0 ? void 0 : pendingNode.remove(); pendingNode = null; if (data.ok && data.live && ((_a = data.sources) === null || _a === void 0 ? void 0 : _a.length)) {
        message('assistant', 'I found current information from official sources. Open the results to read the answer with its sources.', { cloud: false, research: data });
    }
    else
        message('assistant', data.text || 'Connection is temporarily unavailable. Please retry.', { cloud: !!data.ok, error: !data.ok }); refresh(); remote(); }
    function resolveApplication(query, stateName) { resolving = true; $('send').disabled = true; $('composerHint').textContent = 'Finding official application…'; const request = { query: query.slice(0, 300), ...(stateName ? { state: stateName } : {}) }; if (native)
        native.resolveApplication(JSON.stringify(request));
    else {
        const c = catalog.find(c => c.match.test(query));
        applicationResolved(c ? { ok: true, status: 'resolved', application: c } : { ok: true, status: 'choose_application', applications: catalog });
    } }
    function applicationResolved(data) { resolving = false; $('send').disabled = false; $('composerHint').textContent = 'Ask. Upload. Apply.'; if (!data.ok) {
        message('assistant', data.message || 'Could not find the official form. Try its exact application name.', { actions: [{ text: 'Choose application', action: applicationPicker }] });
        return;
    } if (data.status === 'needs_state') {
        const body = el('div');
        info(body, 'This certificate is issued by your state. Choose the state for the correct official service.');
        const field = add(body, 'div', 'field');
        add(field, 'label', '', 'Your state');
        const select = add(field, 'select');
        for (const name of data.states || [])
            select.append(el('option', '', name));
        sheet('Choose your state', body, [{ text: 'Back', action: closeSheet }, { text: 'Continue', primary: true, action: () => { closeSheet(); resolveApplication(data.name, select.value); } }]);
        return;
    } if (data.status === 'resolved' && data.application) {
        application = data.application;
        persist();
        message('assistant', 'Official application ready.', { application });
        workflow();
        launchApplication(application);
        return;
    } const body = el('div'); info(body, 'Choose the exact official application. No link needs to be typed.'); const list = add(body, 'div', 'choices'); for (const a of data.applications || []) {
        const b = add(list, 'button', 'choice');
        const copy = add(b, 'span');
        add(copy, 'b', '', a.name);
        if (a.url)
            try {
                add(copy, 'small', '', new URL(a.url).hostname);
            }
            catch (_a) { }
        add(b, 'span', '', '↗');
        b.onclick = () => { closeSheet(); if (a.url && !a.needsState) {
            application = a;
            message('assistant', 'Official application ready.', { application: a });
            persist();
            workflow();
            launchApplication(a);
        }
        else
            resolveApplication(a.name); };
    } if (!(data.applications || []).length)
        info(body, 'Tell me the exact exam, department or certificate name in chat. I will look for its official application.'); sheet('Choose your application', body, [{ text: 'Back to chat', action: closeSheet }]); }
    function applicationPicker() { var _a; refresh(); applicationResolved({ ok: true, status: 'choose_application', applications: ((_a = state.server.directory) === null || _a === void 0 ? void 0 : _a.applications) || catalog }); }
    function launchApplication(a = application) { if (!a)
        return applicationPicker(); closeSheet(); if (native)
        native.openPortal(a.url);
    else
        toast('Official application opens inside the Android app.'); }
    function documentsPanel() { refresh(); const body = el('div'), upload = add(body, 'button', 'upload-area'); upload.append(icon('clip')); add(upload, 'b', '', 'Add your documents'); add(upload, 'small', '', 'PDF, JPG or PNG · up to 8 MB each'); upload.onclick = uploadDocuments; info(body, 'Each page is scanned on your phone. AI reads the text with document images, then you review the extracted facts.'); for (const d of state.documents) {
        const card = add(body, 'div', 'doc-card');
        add(card, 'span', 'doc-symbol', d.mime === 'application/pdf' ? 'PDF' : 'IMAGE');
        const detail = add(card, 'div', 'doc-details');
        add(detail, 'b', '', d.name);
        add(detail, 'small', '', Math.ceil(d.size / 1024) + ' KB · ' + (d.scanned ? `${d.pages} / ${d.totalPages || d.pages} pages scanned${d.truncated ? ' · remaining content needs another document' : ''}` : 'Scan not ready') + (d.type ? ' · ' + d.type : ''));
        const row = add(detail, 'div', 'doc-actions');
        row.append(button('View original', () => { var _a; return (_a = native === null || native === void 0 ? void 0 : native.previewDocument) === null || _a === void 0 ? void 0 : _a.call(native, d.id); }), button('Document type', () => documentType(d)), button('Rescan', () => { var _a; (_a = native === null || native === void 0 ? void 0 : native.rescanDocument) === null || _a === void 0 ? void 0 : _a.call(native, d.id); toast('Rescanning document…'); }), button('Remove', () => removeDocument(d)));
    } if (!state.documents.length)
        info(body, 'Upload the documents you want to use. Names, addresses, education, IDs, business details and other printed facts appear in the review.'); sheet('Your documents', body, [{ text: 'Close', action: closeSheet }, { text: 'Extract with AI', primary: true, action: () => analyse() }], 'documents'); }
    function documentType(d) { const body = el('div'); info(body, 'Choose the actual document type. A saved file attaches automatically only when one matching file is available for the portal upload field.'); const field = add(body, 'div', 'field'); add(field, 'label', '', 'Document type'); const select = add(field, 'select'); for (const [type, label] of Object.entries({ aadhaar: 'Aadhaar card', pan: 'PAN card', passport: 'Passport', marksheet: 'Marksheet', qualification: 'Qualification certificate', caste: 'Caste certificate', income: 'Income certificate', domicile: 'Domicile certificate', bank: 'Bank statement / passbook', business: 'Business document', photo: 'Applicant photo', signature: 'Applicant signature', other: 'Other document' })) {
        const option = el('option', '', label);
        option.value = type;
        select.append(option);
    } select.value = d.type || 'other'; sheet('Review document type', body, [{ text: 'Back', action: documentsPanel }, { text: 'Save type', primary: true, action: () => { var _a; (_a = native === null || native === void 0 ? void 0 : native.setDocumentType) === null || _a === void 0 ? void 0 : _a.call(native, d.id, select.value); } }]); }
    function removeDocument(d) { const body = el('div'); info(body, 'Remove ' + d.name + ' from your private workspace? Your reviewed profile stays saved.'); sheet('Remove document', body, [{ text: 'Keep document', action: documentsPanel }, { text: 'Remove', primary: true, action: () => { var _a; (_a = native === null || native === void 0 ? void 0 : native.removeDocument) === null || _a === void 0 ? void 0 : _a.call(native, d.id); closeSheet(); } }]); }
    function uploadDocuments() { if (importing || analysing || awaiting)
        return toast('Let the current task finish first.'); permission(() => { closeSheet(); if (!native)
        return toast('Use the Android app to add private documents.'); importing = true; addedDuringImport = false; workflow(); native.pickDocument(); }); }
    function analyse(ids) { if (importing || analysing || awaiting)
        return toast('Let the current task finish first.'); refresh(); ids = ids || state.documents.filter(d => d.scanned).map(d => d.id); if (!ids.length)
        return documentsPanel(); permission(() => { var _a; analysing = true; closeSheet(); workflow(); (_a = native === null || native === void 0 ? void 0 : native.analyseDocuments) === null || _a === void 0 ? void 0 : _a.call(native, JSON.stringify({ ids })); }); }
    function reviewProfile(fromAnalysis = false) {
        var _a;
        refresh();
        const candidates = fromAnalysis ? state.application.candidates || [] : [], meta = { ...state.profileMeta, ...state.application.meta }, keys = new Set([...Object.keys(state.profile), ...candidates.map(c => c.key)]);
        const body = el('div');
        info(body, fromAnalysis ? 'AI extracted the printed facts below. Check values against the originals. Conflicting facts need your choice.' : 'Your approved details are reused across applications. Edit them here whenever needed.');
        if ((_a = state.application.errors) === null || _a === void 0 ? void 0 : _a.length)
            info(body, 'Some documents could not be analysed. Their data is not included; rescan or retry those documents.', true);
        if (!keys.size) {
            info(body, 'No readable details were extracted. Rescan a clearer document, or add a detail yourself.', true);
            keys.add('fullName');
        }
        const groupOrder = ['identity', 'contact', 'education', 'business', 'bank', 'other'];
        const inputs = new Map();
        function definition(k) { var _a; return fixed.find(f => f.key === k) || { key: k, label: ((_a = meta[k]) === null || _a === void 0 ? void 0 : _a.label) || 'Additional detail', type: 'text', group: 'other' }; }
        function field(k, grid) {
            if (inputs.has(k))
                return;
            const f = definition(k), wrap = add(grid, 'div', 'field' + (k === 'address' ? ' wide' : ''));
            add(wrap, 'label', '', f.label);
            const opts = [...new Set(candidates.filter(c => c.key === k).map(c => c.value))], conflict = opts.length > 1, stored = state.profile[k] || '';
            let input;
            if (conflict) {
                add(wrap, 'div', 'conflict', 'Different values found. Choose the correct printed detail.');
                input = add(wrap, 'select');
                const empty = el('option', '', 'Choose the correct value…');
                empty.value = '';
                input.append(empty);
                for (const v of [...new Set([...(stored ? [stored] : []), ...opts])]) {
                    const opt = el('option', '', v);
                    opt.value = v;
                    input.append(opt);
                }
                input.value = '';
            }
            else {
                input = add(wrap, k === 'address' ? 'textarea' : 'input');
                input.value = stored || opts[0] || '';
                if (input.tagName === 'INPUT') {
                    input.type = f.type === 'email' ? 'email' : 'text';
                    if (['mobile', 'pincode', 'aadhaarNumber', 'bankAccount', 'percentage', 'passingYear'].includes(k))
                        input.inputMode = 'numeric';
                }
                if (k === 'dob' || k === 'commencementDate')
                    input.placeholder = 'DD/MM/YYYY';
            }
            input.setAttribute('aria-label', f.label);
            const sources = candidates.filter(c => c.key === k);
            if (sources.length) {
                const notes = add(wrap, 'div', 'source-note');
                for (const c of sources.slice(0, 4)) {
                    const d = state.documents.find(d => d.id === c.documentId);
                    add(notes, 'span', 'confidence' + (c.confidence === 'low' ? ' low' : ''), c.sourceType === 'image' ? 'Image · check original' : c.confidence === 'low' ? 'Check original' : 'Printed fact');
                    const b = add(notes, 'button', '', ((d === null || d === void 0 ? void 0 : d.name) || 'Document') + ' · page ' + (c.page || 1));
                    b.onclick = () => { var _a; return (_a = native === null || native === void 0 ? void 0 : native.previewDocument) === null || _a === void 0 ? void 0 : _a.call(native, c.documentId); };
                }
                if (stored && opts.length && opts.some(v => v !== stored))
                    add(notes, 'span', '', 'Your saved value was kept.');
            }
            inputs.set(k, { input, wrap, conflict });
        }
        for (const group of groupOrder) {
            const ks = [...keys].filter(k => definition(k).group === group);
            if (!ks.length)
                continue;
            add(body, 'div', 'section-label', ({ identity: 'Identity', contact: 'Contact & address', education: 'Education', business: 'Business', bank: 'Bank details', other: 'Other printed facts' })[group]);
            const grid = add(body, 'div', 'review-grid');
            for (const k of ks)
                field(k, grid);
        }
        const more = add(body, 'button', 'chip-action', '＋ Add a detail');
        more.onclick = () => { const available = fixed.filter(f => !inputs.has(f.key)); if (!available.length)
            return toast('All supported details are already shown.'); const wrap = add(body, 'div', 'field'), select = add(wrap, 'select'); for (const f of available) {
            const opt = el('option', '', f.label);
            opt.value = f.key;
            select.append(opt);
        } const b = add(wrap, 'button', 'chip-action', 'Add field'); b.onclick = () => { const grid = add(body, 'div', 'review-grid'); field(select.value, grid); wrap.remove(); }; };
        sheet('Review your details', body, [{ text: 'Back', action: documentsPanel }, { text: 'Confirm details', primary: true, action: () => { var _a; const fields = {}; let bad = false; for (const [k, { input, wrap, conflict }] of inputs) {
                    const v = input.value.trim();
                    wrap.classList.remove('invalid');
                    if (conflict && !v) {
                        wrap.classList.add('invalid');
                        bad = true;
                    }
                    else if (v)
                        fields[k] = v;
                } if (bad)
                    return toast('Choose a value for each conflicting detail.'); if (!Object.keys(fields).length)
                    return toast('Review at least one detail.'); (_a = native === null || native === void 0 ? void 0 : native.saveProfile) === null || _a === void 0 ? void 0 : _a.call(native, JSON.stringify({ fields, meta })); if (!native) {
                    state.profile = fields;
                    closeSheet();
                    toast('Profile review preview saved.');
                } } }], 'review');
    }
    function preferences() {
        var _a;
        refresh();
        const body = el('div');
        info(body, 'Control your appearance, saved permissions and private workspace.');
        const row = (title, copy) => { const r = add(body, 'div', 'preference-row'), text = add(r, 'div'); add(text, 'b', '', title); add(text, 'small', '', copy); return r; };
        const appearance = row('Appearance', 'Choose the theme that feels right.'), themes = add(appearance, 'div', 'theme-choice');
        for (const mode of ['dark', 'light']) {
            const b = add(themes, 'button', document.body.classList.contains('theme-' + mode) ? 'active' : '', mode === 'dark' ? 'Dark' : 'Light');
            b.onclick = () => { storage.setItem('av_theme', mode); theme(mode); preferences(); };
        }
        const automation = row('Document & form automation', state.ai.automationConsent ? 'Permission saved. Extract, fill reviewed facts and attach uniquely matched saved files.' : 'Paused. Allow once when you start an application.');
        automation.append(button(state.ai.automationConsent ? 'Pause' : 'Allow', () => { var _a; if (state.ai.automationConsent) {
            (_a = native === null || native === void 0 ? void 0 : native.savePermissions) === null || _a === void 0 ? void 0 : _a.call(native, false);
            toast('Pausing automation…');
        }
        else
            permission(preferences); }));
        const plus = row(state.account.plus ? 'AvsarGo Plus' : 'Your plan', state.account.plus ? 'Plus is active.' : `${state.account.used || 0} AI requests used today.`);
        if (((_a = state.server.payment) === null || _a === void 0 ? void 0 : _a.ready) && !state.account.plus)
            plus.append(button('Get Plus', () => { var _a; return (_a = native === null || native === void 0 ? void 0 : native.createPayment) === null || _a === void 0 ? void 0 : _a.call(native); }));
        const support = row('Help & support', 'Questions about your application or workspace?');
        support.append(button('Get help', () => { var _a; return (_a = native === null || native === void 0 ? void 0 : native.openSupport) === null || _a === void 0 ? void 0 : _a.call(native); }));
        const privacy = row('Delete private workspace', 'Remove saved documents, reviewed details, conversations and website sessions from this phone.');
        privacy.append(button('Delete', () => { const box = el('div'); info(box, 'Delete everything saved in this app on this phone? This cannot be undone.', true); sheet('Delete private workspace', box, [{ text: 'Keep my data', action: preferences }, { text: 'Delete everything', primary: true, action: () => { var _a; closeSheet(); (_a = native === null || native === void 0 ? void 0 : native.eraseLocalData) === null || _a === void 0 ? void 0 : _a.call(native); } }]); }));
        sheet('Preferences & privacy', body, [{ text: 'Done', primary: true, action: closeSheet }], 'preferences');
    }
    window.AvsarGoEvent = (name, data) => { var _a; if (name === 'aiReply')
        return finishReply(data); if (name === 'permissionSaved') {
        refresh();
        remote();
        if (data.ok) {
            const done = afterPermission;
            afterPermission = null;
            done === null || done === void 0 ? void 0 : done();
            if (modalKind === 'preferences')
                preferences();
        }
        else
            toast(data.message);
    }
    else if (name === 'applicationResolved')
        applicationResolved(data);
    else if (name === 'documentAdded') {
        addedDuringImport = true;
        refresh();
        remote();
    }
    else if (name === 'scanProgress') {
        $('composerHint').textContent = `Scanning page ${data.done} / ${data.total}`;
        $('progressText').textContent = `${data.name} · page ${data.done} / ${data.total}`;
    }
    else if (name === 'ocrResult') {
        refresh();
        remote();
        if (!importing)
            toast(`${data.pages} pages scanned. Ready for AI extraction.`);
    }
    else if (name === 'ocrError' || name === 'documentError')
        toast(data.message);
    else if (name === 'importDone') {
        importing = false;
        $('composerHint').textContent = 'Ask. Upload. Apply.';
        refresh();
        remote();
        if (addedDuringImport && state.documents.some(d => d.scanned))
            analyse();
        else if (addedDuringImport)
            documentsPanel();
    }
    else if (name === 'documentAnalysis') {
        analysing = false;
        refresh();
        remote();
        if (data.ok) {
            message('assistant', `${((_a = data.candidates) === null || _a === void 0 ? void 0 : _a.length) || 0} printed facts extracted from your documents. Review them before autofill.`, { actions: [{ text: 'Review details', action: () => reviewProfile(true), primary: true }] });
            reviewProfile(true);
        }
        else {
            toast(data.message || 'Document analysis could not finish. Please retry.');
            documentsPanel();
        }
    }
    else if (name === 'profileSaved') {
        refresh();
        remote();
        if (data.ok) {
            closeSheet();
            message('assistant', 'Your reviewed details are saved. Ready to autofill.', { actions: application ? [{ text: 'Open & autofill', action: () => launchApplication(), primary: true }] : [{ text: 'Choose application', action: applicationPicker, primary: true }] });
            if (application)
                launchApplication();
        }
        else
            toast(data.message);
    }
    else if (name === 'documentRemoved' || name === 'documentTypeUpdated') {
        refresh();
        remote();
        documentsPanel();
    }
    else if (name === 'profileUpdated' || name === 'formFilled') {
        refresh();
        remote();
    }
    else if (name === 'configUpdated') {
        refresh();
        remote();
    }
    else if (name === 'paymentStatus') {
        toast(data.message);
    }
    else if (name === 'erased') {
        if (data.ok) {
            state = { profile: {}, profileMeta: {}, documents: [], application: {}, ai: {}, server: {}, account: {}, workspace: {} };
            messages = [];
            chats = [];
            application = null;
            closeSheet();
            newChat();
            refresh();
            remote();
        }
        toast(data.message);
    }
    else if (name === 'storageError')
        toast(data.message); };
    $('menuButton').onclick = () => menu(true);
    $('closeMenu').onclick = $('scrim').onclick = () => menu(false);
    $('closeSheet').onclick = closeSheet;
    $('modal').onclick = e => { if (e.target === $('modal') && modalKind !== 'consent')
        closeSheet(); };
    $('newChat').onclick = $('topNewChat').onclick = newChat;
    $('openDocs').onclick = documentsPanel;
    $('openProfile').onclick = () => reviewProfile(false);
    $('openBrowser').onclick = () => { menu(false); application ? launchApplication() : applicationPicker(); };
    $('openPreferences').onclick = preferences;
    $('attach').onclick = $('heroUpload').onclick = uploadDocuments;
    $('headerDocs').onclick = $('panelDocs').onclick = documentsPanel;
    $('panelProfile').onclick = () => reviewProfile(false);
    $('panelApply').onclick = () => application ? launchApplication() : applicationPicker();
    $('historySearch').oninput = history;
    document.querySelectorAll('[data-prompt]').forEach(b => b.onclick = () => answer(b.dataset.prompt));
    $('send').onclick = () => answer($('chatInput').value);
    $('chatInput').oninput = () => { grow(); persist(); };
    $('chatInput').onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        answer($('chatInput').value);
    } };
    window.avsargoHandleBack = () => { if (!$('modal').hidden) {
        closeSheet();
        return true;
    } if ($('drawer').classList.contains('open')) {
        menu(false);
        return true;
    } return false; };
    window.avsargoOnReturn = () => { var _a; refresh(); remote(); (_a = native === null || native === void 0 ? void 0 : native.fetchConfig) === null || _a === void 0 ? void 0 : _a.call(native); };
    refresh();
    const saved = state.workspace || {};
    $('chatInput').value = saved.draft || '';
    chats = Array.isArray(saved.chats) ? saved.chats : [];
    if (!chats.length && ((_a = saved.messages) === null || _a === void 0 ? void 0 : _a.length))
        chats = [{ id: 'legacy', title: 'Earlier conversation', messages: saved.messages, application: saved.application || null }];
    activeId = saved.activeId || ((_b = chats[chats.length - 1]) === null || _b === void 0 ? void 0 : _b.id) || '';
    if (chats.length) {
        const c = chats.find(c => c.id === activeId) || chats[chats.length - 1];
        activeId = c.id;
        messages = c.messages || [];
        application = c.application || null;
        renderMessages();
    }
    else
        newChat();
    remote();
    history();
    grow();
    syncChrome();
    (_c = native === null || native === void 0 ? void 0 : native.fetchConfig) === null || _c === void 0 ? void 0 : _c.call(native);
})();
