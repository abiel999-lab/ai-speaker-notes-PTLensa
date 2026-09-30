const translations = {
  id: {
    dashboard:'Dashboard', chatAI:'Chat AI', howTo:'Cara Pakai', legal:'Legal', logout:'Keluar',
    heroBadge:'Reliable PowerPoint AI', uploadTitle:'Buat speaker notes yang lebih cepat dan mudah',
    uploadLede:'Upload a PowerPoint, choose your preferred explanation style, and the system will analyze the slide structure, text, and visuals before generating notes.',
    qualityMode:'Quality mode', aiSlidesPerJob:'AI slides', visionSlidesPerJob:'Vision slides', autoBatching:'Batch otomatis', noFixedSlideLimit:'Tanpa batas jumlah slide tetap', uploadLimit:'Upload',
    packageSafeWriteBack:'Package-safe write-back', packageSafeDesc:'File asli tidak disentuh; hasil divalidasi sebelum download.',
    ready:'Ready', notConfigured:'Belum dikonfigurasi', disabled:'Dinonaktifkan', rendererMissing:'Renderer tidak ditemukan', perSlideRecovery:'pemulihan per slide', textOnlyFallback:'Fallback text-only tersedia',
    generateTitle:'Generate speaker notes', generateDesc:'Mulai dari file, lalu atur bahasa, audiens, kedalaman, dan cara sistem membaca visual.', stepUpload:'01 · Upload & configure',
    selectFile:'Pilih atau tarik file PowerPoint ke sini', fileHint:'Mendukung .ppt, .pptx, .pptm, .pps/.ppsx/.ppsm, dan .pot/.potx/.potm. Format dinormalisasi otomatis.',
    quickPresets:'Quick presets', presetHint:'Opsional — bisa diubah lagi setelah memilih.',
    studentPreset:'Mahasiswa', studentPresetDesc:'Bahasa mudah, runtut, dan enak dipresentasikan.',
    academicPreset:'Akademik', academicPresetDesc:'Lebih formal dan mempertahankan istilah penting.',
    concisePreset:'Ringkas', concisePresetDesc:'Notes singkat untuk presentasi cepat.',
    generationSettings:'Generation settings', boundedInput:'Model kuat dengan input yang dibatasi.',
    generatorLabel:'Generator', modelLabel:'Model AI', engineDummy:'MVP test · tanpa biaya AI', engineQuality:'OpenAI · model Luna', model6Recommended:'GPT-6 Luna · direkomendasikan', model56Compatibility:'GPT-5.6 Luna · kompatibilitas', modelHelp:'GPT-6 Luna menjadi default. GPT-5.6 Luna tetap tersedia untuk kompatibilitas.',
    languageLabel:'Bahasa', languageIndonesian:'Bahasa Indonesia', languageEnglish:'English',
    audienceLabel:'Audiens', audienceGeneral:'Umum', audienceManagement:'Manajemen', audienceTechnical:'Teknis', audienceRegulator:'Regulator', audienceAcademic:'Akademisi', audienceStudent:'Mahasiswa',
    depthLabel:'Kedalaman', depthLow:'Low', depthMedium:'Medium', depthHigh:'High', depthHelp:'Depth memengaruhi reasoning, bukan panjang notes.',
    lengthLabel:'Jumlah kata per slide', lengthUnder100:'<100 kata', length100250:'100–250 kata', length250500:'250–500 kata', lengthCustom:'Custom', lengthHelp:'Slide judul/transisi boleh lebih pendek.',
    customLimitLabel:'Maksimum kata custom', customLimitHelp:'Batas aman v1.0.0: 30–500 kata.',
    instructionsLabel:'Instruksi tambahan', instructionsPlaceholder:'Contoh: jelaskan untuk mahasiswa semester awal; pertahankan istilah teknis; jangan menambah data di luar slide.', characters:'karakter',
    analysisModeLabel:'AI Analysis Mode', textOnlyFast:'Text-only · fastest', visionRecommended:'Text + Vision · recommended', visionHelp:'Vision analyzes charts and images. If one slide fails to render, the remaining slides will continue processing.',
    existingNotesLabel:'Existing Speaker Notes', notesMissingOnly:'Fill missing notes only · safest', notesAppend:'Add to existing notes', notesReplace:'Replace all notes', notesHelp:'Existing notes are preserved by default.',
    replaceWarning:'Mode replace akan mengganti speaker notes pada file hasil. File asli tetap aman.',
    openaiNotConfigured:'OpenAI belum dikonfigurasi. Mode test tetap bisa dipakai. Isi OPENAI_API_KEY untuk mengaktifkan AI.',
    visionNotReady:'Vision belum siap karena renderer tidak ditemukan. Text-only tetap bisa digunakan.',
    termsPrefix:'By processing this file, you agree to the', reviewNeeded:'Review AI-generated results before using them.',
    startProcess:'Process PowerPoint', recentJobs:'Recent Jobs', noJobs:'No jobs yet.',
    download:'Download Result PPTX', openChat:'Open AI Chat', retry:'Try Again', delete:'Delete',
    processing:'Memproses', completed:'Selesai', failed:'Gagal', queued:'Menunggu', uploadingLabel:'MENGUNGGAH', retryingLabel:'MENCOBA LAGI',
    uploading:'Mengunggah dan memvalidasi file PowerPoint…', retrying:'Mencoba ulang job yang gagal dan menggunakan checkpoint yang aman…',
    notesGenerated:'Notes dibuat', existingPreserved:'Notes lama dipertahankan', visualCoverage:'Cakupan visual', hiddenSlides:'Hidden slides',
    usageTokens:'token', usageRequests:'request', usageEstimated:'estimasi', usagePreflight:'preflight',
    modelStrength:'Model Luna generasi terbaru', modelDesc:'Pilih GPT-6 Luna atau GPT-5.6 Luna dengan automatic batching, checkpoint, retry, dan pemulihan per slide.',
    visualSafety:'Vision tahan error', visualDesc:'Hidden slide dan kegagalan render diisolasi per slide.',
    privacySafety:'Kompatibilitas dokumen', privacyDesc:'Macro dan embedded object diterima sebagai data dokumen; active content tidak dijalankan saat pemrosesan.',
    selected:'Dipilih', humanReviewRequired:'Human review required',
    confirmReplace:'Replace All mode will overwrite existing speaker notes in the output file. Continue?',
    confirmAI:'Mode AI akan mengirim konten slide ke OpenAI API dan menggunakan kredit API. Lanjutkan?',
    authExpired:'Sesi login berakhir. Silakan login kembali.',
    choosePresentation:'Choose presentation mode / result', generalChat:'General Chat', generalChatDesc:'Without PowerPoint context', noCompletedJobs:'No completed jobs yet.', noPresentationSelected:'No presentation selected', selectCompletedJob:'Choose a completed job to get started.', clearChat:'Clear Chat', send:'Send', slideNumberPlaceholder:'Slide #', chatPlaceholder:'Type your question…', readyToChat:'Ready', chatReadyPrompt:'Ask about a slide, chart, speaker note, or presentation flow.', generatedNotesShort:'notes generated', slidesLabel:'Slide', clearChatConfirm:'Clear chat history for this presentation?', clearGeneralChatConfirm:'Clear this general chat history?', chatScope:'Chat tidak diberi akses ke secret, file job lain, atau seluruh deck tanpa batas. Bila informasi tidak didukung slide yang dikirim sebagai konteks, model diminta menyatakan keterbatasannya.', chatMessageTooLong:'Message is too long. Maximum {max} characters. Remove {over} characters before sending.'
  },
  en: {
    dashboard:'Dashboard', chatAI:'AI Chat', howTo:'How to Use', legal:'Legal', logout:'Sign out',
    heroBadge:'Reliable PowerPoint AI', uploadTitle:'Create fast and easy speaker notes',
    uploadLede:'Upload a PowerPoint, choose an explanation style, then the system reads slide structure, text, and visuals before writing notes.',
    qualityMode:'Quality mode', aiSlidesPerJob:'AI slides', visionSlidesPerJob:'Vision slides', autoBatching:'Automatic batching', noFixedSlideLimit:'No fixed slide-count cap', uploadLimit:'Upload',
    packageSafeWriteBack:'Package-safe write-back', packageSafeDesc:'The original file stays untouched; the output is validated before download.',
    ready:'Ready', notConfigured:'Not configured', disabled:'Disabled', rendererMissing:'Renderer missing', perSlideRecovery:'per-slide recovery', textOnlyFallback:'Text-only fallback available',
    generateTitle:'Generate speaker notes', generateDesc:'Start with a file, then choose the language, audience, depth, and how the system reads visuals.', stepUpload:'01 · Upload & configure',
    selectFile:'Choose or drop a PowerPoint file here', fileHint:'PowerPoint files (.ppt, .pptx, .pptm, .pps/.ppsx/.ppsm, .pot/.potx/.potm). Uploads are normalized automatically.',
    quickPresets:'Quick presets', presetHint:'Optional — you can change these settings after selecting a preset.',
    studentPreset:'Student', studentPresetDesc:'Easy language, clear flow, and presentation-friendly.',
    academicPreset:'Academic', academicPresetDesc:'More formal while preserving important terminology.',
    concisePreset:'Concise', concisePresetDesc:'Short notes for faster presentations.',
    generationSettings:'Generation settings', boundedInput:'Strong model with bounded input.',
    generatorLabel:'Generator', modelLabel:'AI Model', engineDummy:'MVP test · no AI cost', engineQuality:'OpenAI · Luna models', model6Recommended:'GPT-6 Luna · recommended', model56Compatibility:'GPT-5.6 Luna · compatibility', modelHelp:'GPT-6 Luna is the default. GPT-5.6 Luna remains available for compatibility.',
    languageLabel:'Language', languageIndonesian:'Indonesian', languageEnglish:'English',
    audienceLabel:'Audience', audienceGeneral:'General', audienceManagement:'Management', audienceTechnical:'Technical', audienceRegulator:'Regulator', audienceAcademic:'Academic', audienceStudent:'Student',
    depthLabel:'Depth', depthLow:'Low', depthMedium:'Medium', depthHigh:'High', depthHelp:'Depth affects reasoning, not note length.',
    lengthLabel:'Words per slide', lengthUnder100:'<100 words', length100250:'100–250 words', length250500:'250–500 words', lengthCustom:'Custom', lengthHelp:'Title and transition slides may be shorter.',
    customLimitLabel:'Custom maximum words', customLimitHelp:'Safe v1.0.0 range: 30–500 words.',
    instructionsLabel:'Additional instructions', instructionsPlaceholder:'Example: explain for first-year students; preserve technical terms; do not add facts that are not supported by the slide.', characters:'characters',
    analysisModeLabel:'AI analysis mode', textOnlyFast:'Text-only · fastest', visionRecommended:'Text + Vision · recommended', visionHelp:'Vision reads charts and images. If one slide fails to render, the other slides continue.',
    existingNotesLabel:'Existing speaker notes', notesMissingOnly:'Fill empty notes only · safest', notesAppend:'Append to existing notes', notesReplace:'Replace all notes', notesHelp:'The default preserves existing notes.',
    replaceWarning:'Replace mode will replace speaker notes in the output file. The original file remains safe.',
    openaiNotConfigured:'OpenAI is not configured. Test mode is still available. Set OPENAI_API_KEY to enable AI.',
    visionNotReady:'Vision is not ready because no renderer was found. Text-only mode is still available.',
    termsPrefix:'By processing a file, your use is subject to', reviewNeeded:'Always review AI output before use.',
    startProcess:'Process PowerPoint', recentJobs:'Recent jobs', noJobs:'No jobs yet.',
    download:'Download result PPTX', openChat:'Open AI Chat', retry:'Retry', delete:'Delete',
    processing:'Processing', completed:'Completed', failed:'Failed', queued:'Queued', uploadingLabel:'UPLOADING', retryingLabel:'RETRYING',
    uploading:'Uploading and validating the PowerPoint file…', retrying:'Retrying the failed job and reusing safe checkpoints…',
    notesGenerated:'Notes generated', existingPreserved:'Existing notes preserved', visualCoverage:'Visual coverage', hiddenSlides:'Hidden slides',
    usageTokens:'tokens', usageRequests:'request(s)', usageEstimated:'estimated', usagePreflight:'preflight',
    modelStrength:'Latest-generation Luna model', modelDesc:'Choose GPT-6 Luna or GPT-5.6 Luna with automatic batching, checkpoints, retries, and per-slide recovery.',
    visualSafety:'Fault-tolerant Vision', visualDesc:'Hidden slides and render failures are isolated per slide.',
    privacySafety:'Document compatibility', privacyDesc:'Macros and embedded objects are accepted as document data; active content is not executed during processing.',
    selected:'Selected', humanReviewRequired:'Human review required',
    confirmReplace:'“Replace all” will replace existing speaker notes in the output file. Continue?',
    confirmAI:'AI mode sends slide content to the OpenAI API and uses API credits. Continue?',
    authExpired:'Your login session has expired. Please sign in again.',
    choosePresentation:'Choose mode / presentation', generalChat:'General chat', generalChatDesc:'No PowerPoint context', noCompletedJobs:'No completed jobs yet.', noPresentationSelected:'No presentation selected', selectCompletedJob:'Select a completed job to start.', clearChat:'Clear chat', send:'Send', slideNumberPlaceholder:'Slide #', chatPlaceholder:'Type a message…', readyToChat:'Ready', chatReadyPrompt:'Ask about a slide, chart, speaker note, or presentation flow.', generatedNotesShort:'notes generated', slidesLabel:'Slides', clearChatConfirm:'Clear chat history for this presentation?', clearGeneralChatConfirm:'Clear this general chat history?', chatScope:'Chat cannot access secrets, other users’ job files, or an unlimited full deck. If the supplied slide context does not support an answer, the model is instructed to state that limitation.', chatMessageTooLong:'Message is too long. Maximum {max} characters. Remove {over} characters before sending.'
  }
};

function getLanguage(){ return 'en'; }
function t(key){ return translations.en?.[key] || key; }
function applyLanguage(){
  const lang=getLanguage();
  document.documentElement.lang=lang;
  document.querySelectorAll('[data-i18n]').forEach(el=>{ const key=el.dataset.i18n; if(translations[lang]?.[key] !== undefined) el.textContent=translations[lang][key]; });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el=>{ const key=el.dataset.i18nPlaceholder; if(translations[lang]?.[key] !== undefined) el.setAttribute('placeholder',translations[lang][key]); });
  document.querySelectorAll('[data-lang-btn]').forEach(btn=>{ const active=btn.dataset.langBtn===lang; btn.classList.toggle('active',active); btn.setAttribute('aria-pressed',String(active)); });
  document.querySelectorAll('[data-lang]').forEach(el=>el.classList.toggle('hidden',el.dataset.lang!==lang));
  const page=document.body?.dataset?.page || '';
  const pageTitles={
  dashboard:{en:'NotePreso | AI Speaker Notes'},
  chat:{en:'AI Chat | NotePreso'},
  howto:{en:'How to Use | NotePreso'},
  legal:{en:'Legal & Privacy | NotePreso'}
};
  if(pageTitles[page]) document.title=pageTitles[page][lang];
  document.dispatchEvent(new CustomEvent('asn:languagechange',{detail:{lang}}));
}

document.addEventListener('DOMContentLoaded',()=>{
  localStorage.setItem('asn_lang','en');
  document.querySelectorAll('.lang-toggle').forEach(el=>el.remove());
  applyLanguage();
});

let csrfToken = null;
async function authState(){
  const res=await fetch('/api/v1/auth/me',{headers:{Accept:'application/json'}});
  if(!res.ok) return {authenticated:false};
  const data=await res.json(); csrfToken=data.csrf_token || null; return data;
}
function apiHeaders(extra={}){ const h={...extra}; if(csrfToken) h['X-CSRF-Token']=csrfToken; return h; }
async function ensureAuth(){ const state=await authState(); if(state.auth_enabled && !state.authenticated){ window.location.href='/login'; return false; } return true; }
async function logout(){
  const res=await fetch('/api/v1/auth/logout',{method:'POST',headers:apiHeaders({'X-Requested-With':'fetch'})});
  let target='/login';
  try{ const data=await res.json(); if(data && data.redirect_url) target=data.redirect_url; }catch(_){ }
  window.location.href=target;
}
document.addEventListener('click',e=>{ if(e.target.closest('[data-logout]')){ e.preventDefault(); logout(); }});

/* Public model label normalizer v2 */
(function () {
  const normalizeModelLabel = (value) => {
    if (typeof value !== 'string') return value;

    return value
      .replace(/\bgpt-6-luna\b/gi, 'GPT-6 Luna')
      .replace(/\bgpt-5\.6-luna\b/gi, 'GPT-5.6 Luna')
      .replace(/ChatGPT\s*5\.6\s*Sol/gi, 'Legacy GPT-5.6')
      .replace(/GPT-5\.6\s*Sol/gi, 'Legacy GPT-5.6')
      .replace(/GPT-5\.6-Sol/gi, 'Legacy GPT-5.6')
      .replace(/gpt-5\.6-sol/gi, 'Legacy GPT-5.6');
  };

  const normalizeTextNode = (node) => {
    if (!node || node.nodeType !== Node.TEXT_NODE) return;

    const current = node.nodeValue || '';
    const normalized = normalizeModelLabel(current);

    if (normalized !== current) {
      node.nodeValue = normalized;
    }
  };

  const normalizeTree = (root) => {
    if (!root) return;

    if (root.nodeType === Node.TEXT_NODE) {
      normalizeTextNode(root);
      return;
    }

    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT
    );

    let node;
    while ((node = walker.nextNode())) {
      normalizeTextNode(node);
    }
  };

  const startModelLabelNormalizer = () => {
    normalizeTree(document.body);

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'characterData') {
          normalizeTextNode(mutation.target);
          continue;
        }

        for (const node of mutation.addedNodes) {
          normalizeTree(node);
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener(
      'DOMContentLoaded',
      startModelLabelNormalizer,
      { once: true }
    );
  } else {
    startModelLabelNormalizer();
  }

  window.normalizeModelLabel = normalizeModelLabel;
})();

/* AI Speaker Notes mojibake sanitizer v1 */
(function () {
  function cleanMojibake(value) {
    if (typeof value !== "string") return value;

    return value
      .replace(/ Â· /g, " | ")
      .replace(/Â·/g, "|")
      .replace(/âš ï¸/g, "Warning:")
      .replace(/âš /g, "Warning:")
      .replace(/âš/g, "Warning:");
  }

  function cleanTextNode(node) {
    if (!node || node.nodeType !== Node.TEXT_NODE) return;

    const before = node.nodeValue || "";
    const after = cleanMojibake(before);

    if (before !== after) {
      node.nodeValue = after;
    }
  }

  function cleanTree(root) {
    if (!root) return;

    if (root.nodeType === Node.TEXT_NODE) {
      cleanTextNode(root);
      return;
    }

    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT
    );

    let node;
    while ((node = walker.nextNode())) {
      cleanTextNode(node);
    }
  }

  function startMojibakeSanitizer() {
    cleanTree(document.body);

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "characterData") {
          cleanTextNode(mutation.target);
          continue;
        }

        for (const node of mutation.addedNodes) {
          cleanTree(node);
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }

  window.cleanMojibake = cleanMojibake;

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      startMojibakeSanitizer,
      { once: true }
    );
  } else {
    startMojibakeSanitizer();
  }
})();

/* NotePreso Free/Pro account plan - Phase 1 */
let accountPlanState = null;

function quotaLabel(used, limit){
  if(Number(limit) <= 0) return `${Number(used||0).toLocaleString()} / Unlimited`;
  return `${Number(used||0).toLocaleString()} / ${Number(limit).toLocaleString()}`;
}

function quotaPercent(used, limit){
  if(Number(limit) <= 0) return 0;
  return Math.max(0, Math.min(100, (Number(used||0) / Number(limit)) * 100));
}

function paintQuotaBar(node, used, limit){
  if(!node) return;
  const pct=quotaPercent(used,limit);
  node.style.width=`${pct}%`;
  node.classList.toggle('near-limit',pct>=75&&pct<100);
  node.classList.toggle('at-limit',pct>=100);
}

function billingProviderLabel(item){
  const provider=String(item?.provider||'').toLowerCase();
  const currency=String(item?.currency||'').toUpperCase();
  const price=Number(item?.price||0);
  const displayPrice=item?.price_minor_units?price/100:price;
  const locale=currency==='IDR'?'id-ID':'en-US';
  const digits=currency==='IDR'?0:2;
  const amount=currency&&price>0
    ? new Intl.NumberFormat(locale,{style:'currency',currency,maximumFractionDigits:digits}).format(displayPrice)
    : '';
  const names={xendit:'Xendit',paddle:'Paddle',stripe:'Stripe'};
  const name=names[provider]||provider;
  return amount?`${name} · ${amount}`:name;
}

function availableBillingProviders(plan){
  const list=Array.isArray(plan?.billing?.providers)?plan.billing.providers:[];
  return list.filter(item=>Boolean(item?.checkout_enabled));
}

function closeProviderChooser(){
  document.querySelector('#payment-provider-modal')?.classList.add('hidden');
}

function openProviderChooser(){
  const modal=document.querySelector('#payment-provider-modal');
  const options=document.querySelector('#payment-provider-options');
  if(!modal||!options) return;
  const providers=availableBillingProviders(accountPlanState);
  options.innerHTML='';
  for(const item of providers){
    const button=document.createElement('button');
    button.type='button';
    button.className='payment-provider-option';
    button.dataset.provider=String(item.provider||'');
    const subtitle=item.provider==='xendit'
      ? 'QRIS, e-wallet, virtual account, cards'
      : item.provider==='paddle'
        ? 'International checkout'
        : 'Card checkout';
    button.innerHTML=`<strong>${billingProviderLabel(item)}</strong><span>${subtitle}</span>`;
    button.addEventListener('click',()=>startProCheckout(String(item.provider||'')));
    options.appendChild(button);
  }
  modal.classList.remove('hidden');
}

function renderAccountPlan(plan){
  accountPlanState=plan;
  document.querySelectorAll('[data-plan-chip]').forEach(node=>{
    node.textContent=plan.plan_name||String(plan.plan||'Free');
    node.classList.toggle('pro',plan.plan==='pro');
  });

  const planName=document.querySelector('#account-plan-name');
  if(planName) planName.textContent=plan.plan_name||'Free';
  const status=document.querySelector('#account-plan-status');
  if(status) status.textContent=plan.subscription_status||'active';

  const reset=document.querySelector('#account-plan-reset');
  if(reset){
    const resetDate=plan.usage_period_end?new Date(plan.usage_period_end):null;
    reset.textContent=resetDate&&!Number.isNaN(resetDate.getTime())
      ? `Monthly usage resets ${resetDate.toLocaleDateString(undefined,{dateStyle:'medium'})}.`
      : 'Monthly usage resets automatically.';
  }

  const presentations=Number(plan.usage?.presentations||0);
  const presentationLimit=Number(plan.limits?.presentations||0);
  const chat=Number(plan.usage?.chat_messages||0);
  const chatLimit=Number(plan.limits?.chat_messages||0);
  const presentationText=document.querySelector('#plan-presentations');
  if(presentationText) presentationText.textContent=quotaLabel(presentations,presentationLimit);
  const chatText=document.querySelector('#plan-chat');
  if(chatText) chatText.textContent=quotaLabel(chat,chatLimit);
  paintQuotaBar(document.querySelector('#plan-presentations-bar'),presentations,presentationLimit);
  paintQuotaBar(document.querySelector('#plan-chat-bar'),chat,chatLimit);

  const visionAllowed=Boolean(plan.entitlements?.vision);
  const vision=document.querySelector('#plan-vision');
  if(vision) vision.textContent=visionAllowed?'Included':'Pro only';
  const provider=document.querySelector('#plan-provider');
  if(provider){
    const providers=availableBillingProviders(plan);
    const active=plan.billing?.active_provider||plan.provider;
    const ending=plan.cancel_at_period_end&&plan.current_period_end
      ? ` · Renewal canceled; access until ${new Date(plan.current_period_end).toLocaleDateString(undefined,{dateStyle:'medium'})}`
      : '';
    if(plan.plan==='pro'&&active){
      const label=String(active).charAt(0).toUpperCase()+String(active).slice(1);
      provider.textContent=`Paid via ${label}${ending}`;
    }else if(providers.length){
      provider.textContent=`Payment options: ${providers.map(item=>billingProviderLabel(item)).join(' · ')}`;
    }else{
      provider.textContent='Payment provider: not configured';
    }
  }

  const upgrade=document.querySelector('#upgrade-plan');
  if(upgrade){
    upgrade.classList.toggle('hidden',plan.plan==='pro');
    const providers=availableBillingProviders(plan);
    const accessDays=Number(providers[0]?.access_days||30);
    upgrade.disabled=providers.length===0;
    upgrade.textContent=`Buy Pro · ${accessDays} days`;
    upgrade.title=providers.length
      ? 'Choose a secure payment provider for NotePreso Pro.'
      : 'Payment checkout is not configured yet.';
  }

  const cancel=document.querySelector('#cancel-plan');
  if(cancel){
    const enabled=Boolean(plan.billing?.cancel_enabled);
    cancel.classList.toggle('hidden',!enabled);
    cancel.disabled=!enabled;
  }

  const visionSelect=document.querySelector('#use-vision');
  if(visionSelect){
    const option=visionSelect.querySelector('option[value="true"]');
    const serverReady=option?.dataset.serverReady!=='false';
    if(option) option.disabled=!serverReady||!visionAllowed;
    if(!visionAllowed&&visionSelect.value==='true') visionSelect.value='false';
  }

  document.dispatchEvent(new CustomEvent('notepreso:planchange',{detail:plan}));
}

async function loadAccountPlan(){
  try{
    const res=await fetch('/api/v1/account/plan',{headers:apiHeaders({Accept:'application/json'})});
    if(res.status===401) return null;
    if(!res.ok) return null;
    const plan=await res.json();
    renderAccountPlan(plan);
    return plan;
  }catch(_){
    return null;
  }
}

async function startProCheckout(providerName){
  const button=document.querySelector('#upgrade-plan');
  const provider=String(providerName||'').trim().toLowerCase();
  if(!provider){
    const providers=availableBillingProviders(accountPlanState);
    if(providers.length===1) return startProCheckout(String(providers[0].provider||''));
    openProviderChooser();
    return;
  }
  closeProviderChooser();
  if(button) button.disabled=true;
  try{
    if(!csrfToken) await authState();
    const res=await fetch('/api/v1/billing/checkout',{
      method:'POST',
      headers:apiHeaders({'Accept':'application/json','Content-Type':'application/json','X-Requested-With':'fetch'}),
      body:JSON.stringify({provider})
    });
    const raw=await res.text();
    let data={};
    try{data=raw?JSON.parse(raw):{};}catch(_){data={detail:raw||'Unable to start checkout.'};}
    if(res.status===401){window.location.href='/login';return;}
    if(!res.ok) throw new Error(data.detail||'Unable to start checkout.');
    if(!data.checkout_url) throw new Error('Checkout URL is unavailable.');
    window.location.href=data.checkout_url;
  }catch(err){
    window.alert(err.message||'Unable to start checkout.');
    if(button) button.disabled=false;
  }
}

async function cancelProRenewal(){
  if(!window.confirm('Cancel automatic renewal? Your current Pro access will remain available until the paid period ends.')) return;
  const button=document.querySelector('#cancel-plan');
  if(button) button.disabled=true;
  try{
    if(!csrfToken) await authState();
    const res=await fetch('/api/v1/billing/cancel',{
      method:'POST',
      headers:apiHeaders({'Accept':'application/json','X-Requested-With':'fetch'})
    });
    const raw=await res.text();
    let data={};
    try{data=raw?JSON.parse(raw):{};}catch(_){data={detail:raw||'Unable to cancel renewal.'};}
    if(!res.ok) throw new Error(data.detail||'Unable to cancel renewal.');
    await loadAccountPlan();
  }catch(err){
    window.alert(err.message||'Unable to cancel renewal.');
    if(button) button.disabled=false;
  }
}

function showBillingReturnNotice(kind){
  const card=document.querySelector('#account-plan-card');
  if(!card) return;
  let notice=document.querySelector('#billing-return-notice');
  if(!notice){
    notice=document.createElement('div');
    notice.id='billing-return-notice';
    notice.className='billing-return-notice';
    card.parentNode.insertBefore(notice,card);
  }
  if(kind==='success'){
    notice.className='billing-return-notice success';
    notice.textContent='Payment submitted. NotePreso will activate Pro automatically after the payment provider confirms the successful payment.';
  }else{
    notice.className='billing-return-notice';
    notice.textContent='Checkout was canceled. Your current plan has not been changed.';
  }
}

async function handleBillingReturn(){
  const url=new URL(window.location.href);
  const result=url.searchParams.get('billing');
  if(result!=='success'&&result!=='cancelled') return;
  showBillingReturnNotice(result);
  url.searchParams.delete('billing');
  window.history.replaceState({},'',url.pathname+url.search+url.hash);
  if(result==='success'){
    for(let i=0;i<10;i++){
      const plan=await loadAccountPlan();
      if(plan?.plan==='pro') break;
      await new Promise(resolve=>setTimeout(resolve,2000));
    }
  }
}

window.loadAccountPlan=loadAccountPlan;
window.getAccountPlan=()=>accountPlanState;

document.addEventListener('DOMContentLoaded',async()=>{
  const state=await authState();
  if(!state.auth_enabled||state.authenticated){
    await loadAccountPlan();
    document.querySelector('#upgrade-plan')?.addEventListener('click',()=>startProCheckout());
    document.querySelector('#payment-provider-close')?.addEventListener('click',closeProviderChooser);
    document.querySelector('#payment-provider-modal')?.addEventListener('click',(event)=>{if(event.target?.id==='payment-provider-modal') closeProviderChooser();});
    document.querySelector('#cancel-plan')?.addEventListener('click',cancelProRenewal);
    await handleBillingReturn();
  }
});
