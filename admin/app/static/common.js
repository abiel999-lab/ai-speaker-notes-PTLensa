const translations = {
  id: {
    dashboard:'Dashboard', chatAI:'Chat AI', howTo:'Cara Pakai', legal:'Legal', logout:'Keluar',
    heroBadge:'Reliable PowerPoint AI', uploadTitle:'Buat speaker notes yang lebih cepat dan mudah',
    uploadLede:'Upload PowerPoint, pilih gaya penjelasan, lalu sistem membaca struktur, teks, dan visual slide sebelum menulis notes.',
    qualityMode:'Quality mode', aiSlidesPerJob:'AI slides', visionSlidesPerJob:'Vision slides', autoBatching:'Batch otomatis', noFixedSlideLimit:'Tanpa batas jumlah slide tetap', uploadLimit:'Upload',
    packageSafeWriteBack:'Package-safe write-back', packageSafeDesc:'File asli tidak disentuh; hasil divalidasi sebelum download.',
    ready:'Ready', notConfigured:'Belum dikonfigurasi', disabled:'Dinonaktifkan', rendererMissing:'Renderer tidak ditemukan', perSlideRecovery:'pemulihan per slide', textOnlyFallback:'Fallback text-only tersedia',
    generateTitle:'Generate speaker notes', generateDesc:'Mulai dari file, lalu atur bahasa, audiens, kedalaman, dan cara sistem membaca visual.', stepUpload:'01 · Upload & configure',
    selectFile:'Pilih atau tarik file PowerPoint ke sini', fileHint:'File .pptx saja. File asli tidak diubah.',
    quickPresets:'Quick presets', presetHint:'Opsional — bisa diubah lagi setelah memilih.',
    studentPreset:'Mahasiswa', studentPresetDesc:'Bahasa mudah, runtut, dan enak dipresentasikan.',
    academicPreset:'Akademik', academicPresetDesc:'Lebih formal dan mempertahankan istilah penting.',
    concisePreset:'Ringkas', concisePresetDesc:'Notes singkat untuk presentasi cepat.',
    generationSettings:'Generation settings', boundedInput:'Model kuat dengan input yang dibatasi.',
    generatorLabel:'Generator', engineDummy:'MVP test · tanpa biaya AI', engineQuality:'GPT-5.6 · kualitas tinggi',
    languageLabel:'Bahasa', languageIndonesian:'Bahasa Indonesia', languageEnglish:'English',
    audienceLabel:'Audiens', audienceGeneral:'Umum', audienceManagement:'Manajemen', audienceTechnical:'Teknis', audienceRegulator:'Regulator', audienceAcademic:'Akademisi', audienceStudent:'Mahasiswa',
    depthLabel:'Kedalaman', depthLow:'Low', depthMedium:'Medium', depthHigh:'High', depthHelp:'Depth memengaruhi reasoning, bukan panjang notes.',
    lengthLabel:'Jumlah kata per slide', lengthUnder100:'<100 kata', length100250:'100–250 kata', length250500:'250–500 kata', lengthCustom:'Custom', lengthHelp:'Slide judul/transisi boleh lebih pendek.',
    customLimitLabel:'Maksimum kata custom', customLimitHelp:'Batas aman v1.0.0: 30–500 kata.',
    instructionsLabel:'Instruksi tambahan', instructionsPlaceholder:'Contoh: jelaskan untuk mahasiswa semester awal; pertahankan istilah teknis; jangan menambah data di luar slide.', characters:'karakter',
    analysisModeLabel:'Mode analisis AI', textOnlyFast:'Text-only · tercepat', visionRecommended:'Text + Vision · direkomendasikan', visionHelp:'Vision membaca grafik/gambar. Jika satu slide gagal render, slide lain tetap lanjut.',
    existingNotesLabel:'Speaker notes yang sudah ada', notesMissingOnly:'Isi yang kosong saja · paling aman', notesAppend:'Tambahkan ke notes lama', notesReplace:'Ganti semua notes', notesHelp:'Default menjaga notes yang sudah ada.',
    replaceWarning:'Mode replace akan mengganti speaker notes pada file hasil. File asli tetap aman.',
    openaiNotConfigured:'OpenAI belum dikonfigurasi. Mode test tetap bisa dipakai. Isi OPENAI_API_KEY untuk mengaktifkan AI.',
    visionNotReady:'Vision belum siap karena renderer tidak ditemukan. Text-only tetap bisa digunakan.',
    termsPrefix:'Dengan memproses file, penggunaan mengikuti', reviewNeeded:'Tetap review hasil AI sebelum digunakan.',
    startProcess:'Proses PowerPoint', recentJobs:'Riwayat terbaru', noJobs:'Belum ada pekerjaan.',
    download:'Unduh PPTX hasil', openChat:'Buka Chat AI', retry:'Coba lagi', delete:'Hapus',
    processing:'Memproses', completed:'Selesai', failed:'Gagal', queued:'Menunggu', uploadingLabel:'MENGUNGGAH', retryingLabel:'MENCOBA LAGI',
    uploading:'Mengunggah dan memvalidasi file PowerPoint…', retrying:'Mencoba ulang job yang gagal dan menggunakan checkpoint yang aman…',
    notesGenerated:'Notes dibuat', existingPreserved:'Notes lama dipertahankan', visualCoverage:'Cakupan visual', hiddenSlides:'Hidden slides',
    usageTokens:'token', usageRequests:'request', usageEstimated:'estimasi', usagePreflight:'preflight',
    modelStrength:'Model kualitas tinggi', modelDesc:'GPT-5.6 dengan automatic batching; batas biaya dan keamanan tetap berlaku.',
    visualSafety:'Vision tahan error', visualDesc:'Hidden slide dan kegagalan render diisolasi per slide.',
    privacySafety:'Privasi & keamanan', privacyDesc:'Macro/embedded object berisiko diblokir dan job otomatis kedaluwarsa.',
    selected:'Dipilih', humanReviewRequired:'Human review required',
    confirmReplace:'Mode “Ganti semua” akan mengganti speaker notes yang sudah ada pada file hasil. Lanjutkan?',
    confirmAI:'Mode AI akan mengirim konten slide ke OpenAI API dan menggunakan kredit API. Lanjutkan?',
    authExpired:'Sesi login berakhir. Silakan login kembali.',
    choosePresentation:'Pilih mode / hasil presentasi', generalChat:'Chat umum', generalChatDesc:'Tanpa konteks PowerPoint', noCompletedJobs:'Belum ada job yang selesai.', noPresentationSelected:'Belum ada presentasi dipilih', selectCompletedJob:'Pilih job yang sudah selesai untuk memulai.', clearChat:'Hapus chat', send:'Kirim', slideNumberPlaceholder:'Slide #', chatPlaceholder:'Tulis pertanyaan…', readyToChat:'Siap', chatReadyPrompt:'Tanyakan slide, grafik, speaker note, atau alur presentasi.', generatedNotesShort:'notes dibuat', slidesLabel:'Slide', clearChatConfirm:'Hapus riwayat chat untuk presentasi ini?', clearGeneralChatConfirm:'Hapus riwayat chat umum ini?', chatScope:'Chat tidak diberi akses ke secret, file job lain, atau seluruh deck tanpa batas. Bila informasi tidak didukung slide yang dikirim sebagai konteks, model diminta menyatakan keterbatasannya.', chatMessageTooLong:'Pesan terlalu panjang. Maksimum {max} karakter. Kurangi {over} karakter sebelum mengirim.'
  },
  en: {
    dashboard:'Dashboard', chatAI:'AI Chat', howTo:'How to Use', legal:'Legal', logout:'Sign out',
    heroBadge:'Reliable PowerPoint AI', uploadTitle:'Create fast and easy speaker notes',
    uploadLede:'Upload a PowerPoint, choose an explanation style, then the system reads slide structure, text, and visuals before writing notes.',
    qualityMode:'Quality mode', aiSlidesPerJob:'AI slides', visionSlidesPerJob:'Vision slides', autoBatching:'Automatic batching', noFixedSlideLimit:'No fixed slide-count cap', uploadLimit:'Upload',
    packageSafeWriteBack:'Package-safe write-back', packageSafeDesc:'The original file stays untouched; the output is validated before download.',
    ready:'Ready', notConfigured:'Not configured', disabled:'Disabled', rendererMissing:'Renderer missing', perSlideRecovery:'per-slide recovery', textOnlyFallback:'Text-only fallback available',
    generateTitle:'Generate speaker notes', generateDesc:'Start with a file, then choose the language, audience, depth, and how the system reads visuals.', stepUpload:'01 · Upload & configure',
    selectFile:'Choose or drop a PowerPoint file here', fileHint:'Only .pptx files. The original file is never modified.',
    quickPresets:'Quick presets', presetHint:'Optional — you can change these settings after selecting a preset.',
    studentPreset:'Student', studentPresetDesc:'Easy language, clear flow, and presentation-friendly.',
    academicPreset:'Academic', academicPresetDesc:'More formal while preserving important terminology.',
    concisePreset:'Concise', concisePresetDesc:'Short notes for faster presentations.',
    generationSettings:'Generation settings', boundedInput:'Strong model with bounded input.',
    generatorLabel:'Generator', engineDummy:'MVP test · no AI cost', engineQuality:'GPT-5.6 · quality',
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
    modelStrength:'High-quality model', modelDesc:'GPT-5.6 with automatic batching; cost and safety guardrails still apply.',
    visualSafety:'Fault-tolerant Vision', visualDesc:'Hidden slides and render failures are isolated per slide.',
    privacySafety:'Privacy & security', privacyDesc:'Risky macros/embedded objects are blocked and jobs expire automatically.',
    selected:'Selected', humanReviewRequired:'Human review required',
    confirmReplace:'“Replace all” will replace existing speaker notes in the output file. Continue?',
    confirmAI:'AI mode sends slide content to the OpenAI API and uses API credits. Continue?',
    authExpired:'Your login session has expired. Please sign in again.',
    choosePresentation:'Choose mode / presentation', generalChat:'General chat', generalChatDesc:'No PowerPoint context', noCompletedJobs:'No completed jobs yet.', noPresentationSelected:'No presentation selected', selectCompletedJob:'Select a completed job to start.', clearChat:'Clear chat', send:'Send', slideNumberPlaceholder:'Slide #', chatPlaceholder:'Type a message…', readyToChat:'Ready', chatReadyPrompt:'Ask about a slide, chart, speaker note, or presentation flow.', generatedNotesShort:'notes generated', slidesLabel:'Slides', clearChatConfirm:'Clear chat history for this presentation?', clearGeneralChatConfirm:'Clear this general chat history?', chatScope:'Chat cannot access secrets, other users’ job files, or an unlimited full deck. If the supplied slide context does not support an answer, the model is instructed to state that limitation.', chatMessageTooLong:'Message is too long. Maximum {max} characters. Remove {over} characters before sending.'
  }
};

function getLanguage(){ return localStorage.getItem('asn_lang') || 'id'; }
function t(key){ const lang=getLanguage(); return translations[lang]?.[key] || translations.id[key] || key; }
function applyLanguage(){
  const lang=getLanguage();
  document.documentElement.lang=lang;
  document.querySelectorAll('[data-i18n]').forEach(el=>{ const key=el.dataset.i18n; if(translations[lang]?.[key] !== undefined) el.textContent=translations[lang][key]; });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el=>{ const key=el.dataset.i18nPlaceholder; if(translations[lang]?.[key] !== undefined) el.setAttribute('placeholder',translations[lang][key]); });
  document.querySelectorAll('[data-lang-btn]').forEach(btn=>{ const active=btn.dataset.langBtn===lang; btn.classList.toggle('active',active); btn.setAttribute('aria-pressed',String(active)); });
  document.querySelectorAll('[data-lang]').forEach(el=>el.classList.toggle('hidden',el.dataset.lang!==lang));
  const page=document.body?.dataset?.page || '';
  const pageTitles={dashboard:{id:'AI Speaker Notes | Lensa Lingkungan',en:'AI Speaker Notes | Lensa Lingkungan'},chat:{id:'Chat AI | AI Speaker Notes',en:'AI Chat | AI Speaker Notes'},howto:{id:'Cara Pakai | AI Speaker Notes',en:'How to Use | AI Speaker Notes'},legal:{id:'Legal | AI Speaker Notes',en:'Legal | AI Speaker Notes'}};
  if(pageTitles[page]) document.title=pageTitles[page][lang];
  document.dispatchEvent(new CustomEvent('asn:languagechange',{detail:{lang}}));
}

document.addEventListener('DOMContentLoaded',()=>{
  document.querySelectorAll('[data-lang-btn]').forEach(btn=>btn.addEventListener('click',()=>{localStorage.setItem('asn_lang',btn.dataset.langBtn);applyLanguage();}));
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

/* GPT-5.6 public display normalizer v1 */
(function () {
  const normalizeModelLabel = (value) => {
    if (typeof value !== 'string') return value;

    return value
      .replace(/ChatGPT\s*5\.6\s*Sol/gi, 'GPT-5.6')
      .replace(/GPT-5\.6\s*Sol/gi, 'GPT-5.6')
      .replace(/GPT-5\.6-Sol/gi, 'GPT-5.6')
      .replace(/gpt-5\.6-sol/gi, 'GPT-5.6');
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
