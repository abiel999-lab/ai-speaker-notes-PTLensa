const translations = {
  id: {
    dashboard: 'Dashboard', chatAI: 'Chat AI', howTo: 'Cara Pakai', legal: 'Legal', logout: 'Keluar',
    uploadTitle: 'Buat speaker notes yang lebih aman dan mudah direview',
    uploadLede: 'Upload PowerPoint, pilih gaya penjelasan, lalu sistem membaca struktur, teks, dan visual slide sebelum menulis notes.',
    startProcess: 'Proses presentasi', recentJobs: 'Riwayat terbaru', noJobs: 'Belum ada pekerjaan.',
    download: 'Unduh PPTX hasil', openChat: 'Buka Chat AI', retry: 'Coba lagi', delete: 'Hapus',
    processing: 'Memproses', completed: 'Selesai', failed: 'Gagal', queued: 'Menunggu',
    uploading: 'Mengunggah dan memvalidasi file PowerPoint…',
    selectFile: 'Pilih atau tarik file PowerPoint ke sini', fileHint: 'File .pptx saja. File asli tidak diubah.',
    studentPreset: 'Mahasiswa', studentPresetDesc: 'Bahasa mudah, runtut, dan enak dipresentasikan.',
    academicPreset: 'Akademik', academicPresetDesc: 'Lebih formal dan mempertahankan istilah penting.',
    concisePreset: 'Ringkas', concisePresetDesc: 'Notes singkat untuk presentasi cepat.',
    modelStrength: 'Model kualitas tinggi', modelDesc: 'GPT‑5.6 Sol dengan batas input dan biaya per job.',
    visualSafety: 'Vision tahan error', visualDesc: 'Hidden slide dan kegagalan render diisolasi per slide.',
    privacySafety: 'Privasi & keamanan', privacyDesc: 'Macro/embedded object berisiko diblokir dan job otomatis kedaluwarsa.',
    selected: 'Dipilih', reviewNeeded: 'Tetap review hasil AI sebelum digunakan.',
    confirmReplace: 'Mode “Ganti semua” akan mengganti speaker notes yang sudah ada pada file hasil. Lanjutkan?',
    confirmAI: 'Mode AI akan mengirim konten slide ke OpenAI API dan menggunakan kredit API. Lanjutkan?',
    authExpired: 'Sesi login berakhir. Silakan login kembali.'
  },
  en: {
    dashboard: 'Dashboard', chatAI: 'AI Chat', howTo: 'How to Use', legal: 'Legal', logout: 'Sign out',
    uploadTitle: 'Create safer speaker notes that are easy to review',
    uploadLede: 'Upload a PowerPoint, choose an explanation style, then the system reads slide structure, text, and visuals before writing notes.',
    startProcess: 'Process presentation', recentJobs: 'Recent jobs', noJobs: 'No jobs yet.',
    download: 'Download result PPTX', openChat: 'Open AI Chat', retry: 'Retry', delete: 'Delete',
    processing: 'Processing', completed: 'Completed', failed: 'Failed', queued: 'Queued',
    uploading: 'Uploading and validating the PowerPoint file…',
    selectFile: 'Choose or drop a PowerPoint file here', fileHint: 'Only .pptx. The original file is never modified.',
    studentPreset: 'Student', studentPresetDesc: 'Easy language, clear flow, and presentation-friendly.',
    academicPreset: 'Academic', academicPresetDesc: 'More formal while preserving important terminology.',
    concisePreset: 'Concise', concisePresetDesc: 'Short notes for faster presentations.',
    modelStrength: 'High-quality model', modelDesc: 'GPT‑5.6 Sol with per-job input and cost limits.',
    visualSafety: 'Fault-tolerant Vision', visualDesc: 'Hidden slides and render failures are isolated per slide.',
    privacySafety: 'Privacy & security', privacyDesc: 'Risky macros/embedded objects are blocked and jobs expire automatically.',
    selected: 'Selected', reviewNeeded: 'Always review AI output before use.',
    confirmReplace: '“Replace all” will replace existing speaker notes in the output file. Continue?',
    confirmAI: 'AI mode sends slide content to the OpenAI API and uses API credits. Continue?',
    authExpired: 'Your login session has expired. Please sign in again.'
  }
};

function getLanguage(){ return localStorage.getItem('asn_lang') || 'id'; }
function t(key){ const lang=getLanguage(); return translations[lang]?.[key] || translations.id[key] || key; }
function applyLanguage(){
  const lang=getLanguage();
  document.documentElement.lang=lang;
  document.querySelectorAll('[data-i18n]').forEach(el=>{ const key=el.dataset.i18n; if(translations[lang]?.[key]) el.textContent=translations[lang][key]; });
  document.querySelectorAll('[data-lang-btn]').forEach(btn=>btn.classList.toggle('active',btn.dataset.langBtn===lang));
  document.querySelectorAll('[data-lang]').forEach(el=>el.classList.toggle('hidden',el.dataset.lang!==lang));
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
  await fetch('/api/v1/auth/logout',{method:'POST',headers:apiHeaders({'X-Requested-With':'fetch'})});
  window.location.href='/login';
}
document.addEventListener('click',e=>{ if(e.target.closest('[data-logout]')){ e.preventDefault(); logout(); }});
