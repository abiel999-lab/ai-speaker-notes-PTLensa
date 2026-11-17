(() => {
  'use strict';

  const STORAGE_KEY = 'aiSpeakerAdminLanguage';
  const DEFAULT_LANGUAGE = 'en';

  const ID = {
    'Administration': 'Administrasi',
    'Workspace': 'Ruang kerja',
    'Overview': 'Ringkasan',
    'User management': 'Manajemen pengguna',
    'Presentations & chat': 'Presentasi & chat',
    'Application': 'Aplikasi',
    'Open user app': 'Buka aplikasi pengguna',
    'Administrator': 'Administrator',
    'Checking Keycloak': 'Memeriksa Keycloak',
    'Keycloak management ready': 'Manajemen Keycloak siap',
    'Keycloak management unavailable': 'Manajemen Keycloak tidak tersedia',
    'Sign out': 'Keluar',
    'Control center': 'Pusat kontrol',
    'Administration overview': 'Ringkasan administrasi',
    'Monitor identities, presentation processing, and saved AI conversations from one workspace.': 'Pantau identitas, pemrosesan presentasi, dan percakapan AI tersimpan dari satu ruang kerja.',
    'Access': 'Akses',
    'Total users': 'Total pengguna',
    'Known application accounts': 'Akun aplikasi yang dikenal',
    'Presentations': 'Presentasi',
    'PowerPoint processing records': 'Catatan pemrosesan PowerPoint',
    'Chat threads': 'Thread chat',
    'Saved AI conversations': 'Percakapan AI tersimpan',
    'Completed': 'Selesai',
    'Successfully processed jobs': 'Pekerjaan berhasil diproses',
    'Failed': 'Gagal',
    'Jobs requiring attention': 'Pekerjaan yang perlu diperiksa',
    'Restricted': 'Dibatasi',
    'Locally banned accounts': 'Akun yang diblokir secara lokal',
    'IDENTITY': 'IDENTITAS',
    'ACTIVITY': 'AKTIVITAS',
    'Inspect accounts, status, login activity, and user-owned data.': 'Periksa akun, status, aktivitas login, dan data milik pengguna.',
    'Review processing records and saved AI conversation threads.': 'Tinjau catatan pemrosesan dan thread percakapan AI tersimpan.',
    'Identity & access': 'Identitas & akses',
    "Manage Keycloak identities and inspect each user's application activity.": 'Kelola identitas Keycloak dan periksa aktivitas aplikasi setiap pengguna.',
    'Add user': 'Tambah pengguna',
    'User management service is not configured.': 'Layanan manajemen pengguna belum dikonfigurasi.',
    'Database activity remains available, but Keycloak user mutations require the admin service account.': 'Aktivitas database tetap tersedia, tetapi perubahan pengguna Keycloak memerlukan service account admin.',
    'Directory': 'Direktori',
    'Users': 'Pengguna',
    'Select an account to inspect identity data, presentation history, and saved AI chat activity.': 'Pilih akun untuk memeriksa data identitas, riwayat presentasi, dan aktivitas chat AI tersimpan.',
    'Live data from application database and Keycloak': 'Data langsung dari database aplikasi dan Keycloak',
    'User directory': 'Direktori pengguna',
    'Loading…': 'Memuat…',
    'Search users': 'Cari pengguna',
    'Search name, username, or email': 'Cari nama, username, atau email',
    'User': 'Pengguna',
    'Email': 'Email',
    'Status': 'Status',
    'Files': 'Berkas',
    'Last login': 'Login terakhir',
    'Loading users…': 'Memuat pengguna…',
    'Select a user': 'Pilih pengguna',
    'User profile, PowerPoint history, and saved chat activity will appear here.': 'Profil pengguna, riwayat PowerPoint, dan aktivitas chat tersimpan akan tampil di sini.',
    'Application activity': 'Aktivitas aplikasi',
    'Inspect user-owned presentation activity and chat metadata without exposing conversation content by default.': 'Periksa aktivitas presentasi milik pengguna dan metadata chat tanpa membuka isi percakapan secara default.',
    'User scope': 'Cakupan pengguna',
    'All users · metadata only': 'Semua pengguna · metadata saja',
    'Conversation content is protected.': 'Isi percakapan dilindungi.',
    'Admins see metadata only. Opening a conversation requires a stated support, bug, security, or compliance reason and creates an audit event.': 'Admin hanya melihat metadata. Membuka percakapan memerlukan alasan dukungan, bug, keamanan, atau kepatuhan dan akan membuat catatan audit.',
    'Audited access': 'Akses diaudit',
    'Application processing records': 'Catatan pemrosesan aplikasi',
    'Successful jobs': 'Pekerjaan berhasil',
    'Metadata-visible threads': 'Thread dengan metadata yang terlihat',
    'Current scope': 'Cakupan saat ini',
    'All users': 'Semua pengguna',
    'Showing metadata across the application database.': 'Menampilkan metadata dari seluruh database aplikasi.',
    'Content remains locked until explicitly opened': 'Isi tetap terkunci hingga dibuka secara eksplisit',
    'Processing metadata for the selected user scope': 'Metadata pemrosesan untuk cakupan pengguna yang dipilih',
    'Loading presentation activity…': 'Memuat aktivitas presentasi…',
    'AI conversations': 'Percakapan AI',
    'Thread metadata only. Content access is audited.': 'Hanya metadata thread. Akses isi percakapan diaudit.',
    'Loading chat activity…': 'Memuat aktivitas chat…',
    'ACCOUNT': 'AKUN',
    'Edit user': 'Edit pengguna',
    'Username': 'Username',
    'First name': 'Nama depan',
    'Last name': 'Nama belakang',
    'Email verified': 'Email terverifikasi',
    'Initial password': 'Kata sandi awal',
    'Require password change on first sign-in': 'Wajib ganti kata sandi saat login pertama',
    'Cancel': 'Batal',
    'Save user': 'Simpan pengguna',
    'PRIVACY CONTROL': 'KONTROL PRIVASI',
    'Open conversation': 'Buka percakapan',
    'Conversation contents are private user data.': 'Isi percakapan adalah data pribadi pengguna.',
    'Your access will be recorded in the audit log with the selected reason. Do not open a conversation unless it is necessary for an authorized operational purpose.': 'Akses Anda akan dicatat pada audit log beserta alasan yang dipilih. Jangan membuka percakapan kecuali diperlukan untuk tujuan operasional yang sah.',
    'Reason for access': 'Alasan akses',
    'Select a reason': 'Pilih alasan',
    'Customer support': 'Dukungan pelanggan',
    'Bug investigation': 'Investigasi bug',
    'Security review': 'Tinjauan keamanan',
    'Legal / compliance': 'Legal / kepatuhan',
    'Internal note (optional)': 'Catatan internal (opsional)',
    'Briefly explain why access is needed.': 'Jelaskan singkat mengapa akses diperlukan.',
    'Open & log access': 'Buka & catat akses',
    'Active': 'Aktif',
    'Banned': 'Diblokir',
    'No users found.': 'Pengguna tidak ditemukan.',
    'Could not load users.': 'Tidak dapat memuat pengguna.',
    'Loading user…': 'Memuat pengguna…',
    'Could not load user': 'Tidak dapat memuat pengguna',
    'Database record': 'Record database',
    'Keycloak ID': 'ID Keycloak',
    'Registered': 'Terdaftar',
    'Uploaded jobs': 'Pekerjaan terunggah',
    'Chat messages': 'Pesan chat',
    'Yes': 'Ya',
    'No': 'Tidak',
    'Edit': 'Edit',
    'Ban': 'Blokir',
    'Unban': 'Buka blokir',
    'Delete user & files': 'Hapus pengguna & berkas',
    'Uploaded presentations': 'Presentasi terunggah',
    'No uploaded PowerPoint files for this user.': 'Tidak ada berkas PowerPoint terunggah untuk pengguna ini.',
    'Saved chat activity': 'Aktivitas chat tersimpan',
    'Chat content is protected': 'Isi chat dilindungi',
    'This panel shows metadata only. Open Presentations & chat to request audited conversation access.': 'Panel ini hanya menampilkan metadata. Buka Presentasi & chat untuk meminta akses percakapan yang diaudit.',
    'No saved chat activity for this user.': 'Tidak ada aktivitas chat tersimpan untuk pengguna ini.',
    'Presentation chat': 'Chat presentasi',
    'General chat': 'Chat umum',
    'Open activity & privacy controls': 'Buka aktivitas & kontrol privasi',
    'No presentation records are available for this user scope.': 'Tidak ada record presentasi untuk cakupan pengguna ini.',
    'No saved chat threads are available for this user scope.': 'Tidak ada thread chat tersimpan untuk cakupan pengguna ini.',
    'Could not load presentation activity.': 'Tidak dapat memuat aktivitas presentasi.',
    'Could not load chat activity.': 'Tidak dapat memuat aktivitas chat.',
    'Request timed out. Check the database tunnel or Keycloak connection.': 'Permintaan melewati batas waktu. Periksa tunnel database atau koneksi Keycloak.',
    'Unknown user': 'Pengguna tidak dikenal',
    'Metadata only': 'Metadata saja',
    'Content hidden by default': 'Isi disembunyikan secara default',
    'View conversation': 'Lihat percakapan',
    'Thread': 'Thread',
    'Messages': 'Pesan',
    'Last activity': 'Aktivitas terakhir',
    'Access recorded': 'Akses tercatat',
    'Authorized access': 'Akses terotorisasi',
    'This view has been written to the audit log.': 'Tampilan ini telah dicatat ke audit log.',
    'AI assistant': 'Asisten AI',
    'This thread contains no messages.': 'Thread ini tidak memiliki pesan.',
    'Close conversation': 'Tutup percakapan',
    'Billing & access': 'Billing & akses',
    'Plan overview': 'Ringkasan paket',
    'Effective Free/Pro access is calculated from the NotePreso subscription database and paid-period expiry.': 'Akses efektif Free/Pro dihitung dari database subscription NotePreso dan masa berlaku periode berbayar.',
    'Read-only subscription visibility': 'Visibilitas subscription hanya-baca',
    'Pro users': 'Pengguna Pro',
    'Paid access currently active': 'Akses berbayar yang sedang aktif',
    'Free users': 'Pengguna Free',
    'Free access, including expired Pro': 'Akses Free, termasuk Pro yang sudah berakhir',
    'Expiring Pro': 'Pro akan berakhir',
    'Ending within 7 days or renewal canceled': 'Berakhir dalam 7 hari atau perpanjangan dibatalkan',
    'Expired Pro': 'Pro kedaluwarsa',
    'Previous Pro period has ended': 'Periode Pro sebelumnya telah berakhir',
    'Plan': 'Paket',
    'Billing': 'Billing',
    'FREE': 'FREE',
    'PRO': 'PRO',
    'Free': 'Free',
    'Paid · Active': 'Berbayar · Aktif',
    'Paid · Expiring': 'Berbayar · Akan berakhir',
    'Expired': 'Kedaluwarsa',
    'Payment pending': 'Pembayaran tertunda',
    'Past due': 'Terlambat bayar',
    'Inactive': 'Tidak aktif',
    'Valid until': 'Berlaku sampai',
    'No expiry': 'Tanpa tanggal berakhir',
    'Awaiting payment': 'Menunggu pembayaran',
    'ACCOUNT PLAN': 'PAKET AKUN',
    'Pro access': 'Akses Pro',
    'Free access': 'Akses Free',
    'No billing provider': 'Tanpa penyedia pembayaran',
    'Billing status': 'Status billing',
    'Billing provider': 'Penyedia pembayaran',
    'Auto renew': 'Perpanjangan otomatis',
    'Language': 'Bahasa'
  };

  // NotePreso revised copy; operational code is unchanged.
  const EN_COPY = {"AI Speaker Notes": "NotePreso", "Control center": "Administration", "Control Center": "Administration", "Open user app": "Open NotePreso", "Monitor identities, presentation processing, and saved AI conversations from one workspace.": "Manage accounts, review presentation activity, and monitor service usage.", "Known application accounts": "Accounts recorded in NotePreso", "Locally banned accounts": "Accounts restricted in this application", "Effective Free/Pro access is calculated from the NotePreso subscription database and paid-period expiry.": "Review Free and Pro access based on subscription status and the paid access period.", "Read-only subscription visibility": "Subscription information only", "Inspect accounts, plan status, login activity, and user-owned data.": "Review account details, plan access, sign-in activity, and associated records.", "Review GPT-6 Luna jobs, accounts, and estimated API usage.": "Monitor presentation generation, account activity, and estimated AI usage.", "Review processing records and saved AI conversation threads.": "Review presentation processing and saved conversation records.", "Manage Keycloak identities and inspect each user's application activity.": "Manage user accounts and review their application activity.", "Live data from application database and Keycloak": "Account data from NotePreso and Keycloak", "Database activity remains available, but Keycloak user mutations require the admin service account.": "Activity records remain available. Account changes require a configured Keycloak management connection.", "Thread metadata only. Content access is audited.": "Conversation details are hidden. Access to content is recorded in the audit log.", "Read-only generation activity, user usage and estimated GPT-6 Luna costs. Slide contents and prompts are never shown.": "Monitor generation activity, account usage, and estimated AI costs. Slide content and prompts are not displayed.", "Separate application": "Presentation generation", "Billing & access": "Subscriptions & access", "Billing status": "Payment status", "Billing provider": "Payment provider", "Billing": "Payments", "Search name, username, or email": "Search by name, username, or email", "Username": "Username", "Database record": "Account record", "Chat threads": "Conversations", "Saved AI conversations": "Saved conversations", "AI conversations": "AI conversations", "Keycloak management ready": "Account management connected", "Keycloak management unavailable": "Account management unavailable", "Checking Keycloak": "Checking account management", "Credit wallet not initialized for this account.": "Credit balance has not been initialized for this account.", "Credit balance temporarily unavailable.": "Credit balance is temporarily unavailable.", "No generation records yet.": "No generation records yet.", "No account activity yet.": "No account activity yet.", "Connection unavailable": "Connection unavailable", "Presentation AI data is temporarily unavailable. The existing Admin functions are unaffected.": "Presentation AI data is temporarily unavailable. Other administration tools remain available.", "Administrator permission is required.": "Administrator access required", "Sign in again with an administrator account.": "Sign in with an administrator account", "This sign-in was valid, but the account does not have access to the AI Speaker Notes administration workspace.": "You are signed in, but this account does not have access to NotePreso administration.", "The current Keycloak session can be ended safely. You will then be returned to the admin sign-in page and asked to authenticate again.": "Sign out of the current session, then sign in with an account that has administrator access.", "Continuing will clear the local application session and request logout from the current Keycloak SSO session before admin authentication starts again.": "Continuing ends the local session and requests sign-out from Keycloak before a new administrator sign-in.", "Return to AI Speaker Notes": "Return to NotePreso", "No administrator permission detected.": "This account does not have administrator access.", "Current session": "Current session", "Sign in with another admin account": "Use another administrator account", "ADMINISTRATIVE ACCESS": "ADMINISTRATOR ACCESS", "ACCESS NOT AUTHORIZED": "ACCESS RESTRICTED", "\u2014": "Not available", "Loading": "Loading"};
  Object.assign(ID, {"Presentation AI": "Presentation AI", "GENERATION": "PEMBUATAN", "Generations": "Pembuatan", "Ready": "Siap", "Accounts": "Akun", "All recorded jobs": "Seluruh proses tercatat", "Successful exports": "Ekspor berhasil", "Failed jobs": "Proses gagal", "Queued and processing": "Dalam antrean dan diproses", "Known Presentation accounts": "Akun Presentation yang tercatat", "Input + output tokens": "Token masukan + keluaran", "Estimated cost": "Perkiraan biaya", "Estimated API cost": "Perkiraan biaya API", "Recent generations": "Pembuatan terbaru", "Title": "Judul", "Owner": "Pemilik", "Model / engine": "Model / mesin", "Updated": "Diperbarui", "Error": "Kesalahan", "Unknown": "Tidak diketahui", "Open Presentation AI \u2197": "Buka Presentation AI \u2197", "Tokens": "Token", "Recorded input + output": "Masukan + keluaran tercatat", "USD estimate, not billing": "Perkiraan USD, bukan tagihan", "Latest 100 generation records, metadata only.": "100 catatan pembuatan terbaru, hanya metadata.", "Project": "Proyek", "Account": "Akun", "Last updated": "Terakhir diperbarui", "Error code": "Kode kesalahan", "Usage by account": "Penggunaan per akun", "Up to 100 active accounts by generation count.": "Hingga 100 akun aktif berdasarkan jumlah pembuatan.", "Access denied": "Akses ditolak", "AI Speaker Notes": "NotePreso", "NotePreso": "NotePreso", "Control center": "Administrasi", "Administration": "Administrasi", "Control Center": "Administrasi", "Open user app": "Buka NotePreso", "Open NotePreso": "Buka NotePreso", "Monitor identities, presentation processing, and saved AI conversations from one workspace.": "Kelola akun, tinjau aktivitas presentasi, dan pantau penggunaan layanan.", "Manage accounts, review presentation activity, and monitor service usage.": "Kelola akun, tinjau aktivitas presentasi, dan pantau penggunaan layanan.", "Known application accounts": "Akun yang tercatat di NotePreso", "Accounts recorded in NotePreso": "Akun yang tercatat di NotePreso", "Locally banned accounts": "Akun yang dibatasi di aplikasi ini", "Accounts restricted in this application": "Akun yang dibatasi di aplikasi ini", "Effective Free/Pro access is calculated from the NotePreso subscription database and paid-period expiry.": "Tinjau akses Free dan Pro berdasarkan status langganan dan masa akses berbayar.", "Review Free and Pro access based on subscription status and the paid access period.": "Tinjau akses Free dan Pro berdasarkan status langganan dan masa akses berbayar.", "Read-only subscription visibility": "Informasi langganan saja", "Subscription information only": "Informasi langganan saja", "Inspect accounts, plan status, login activity, and user-owned data.": "Tinjau detail akun, akses paket, aktivitas masuk, dan catatan terkait.", "Review account details, plan access, sign-in activity, and associated records.": "Tinjau detail akun, akses paket, aktivitas masuk, dan catatan terkait.", "Review GPT-6 Luna jobs, accounts, and estimated API usage.": "Pantau pembuatan presentasi, aktivitas akun, dan perkiraan penggunaan AI.", "Monitor presentation generation, account activity, and estimated AI usage.": "Pantau pembuatan presentasi, aktivitas akun, dan perkiraan penggunaan AI.", "Review processing records and saved AI conversation threads.": "Tinjau pemrosesan presentasi dan catatan percakapan tersimpan.", "Review presentation processing and saved conversation records.": "Tinjau pemrosesan presentasi dan catatan percakapan tersimpan.", "Manage Keycloak identities and inspect each user's application activity.": "Kelola akun pengguna dan tinjau aktivitas mereka di aplikasi.", "Manage user accounts and review their application activity.": "Kelola akun pengguna dan tinjau aktivitas mereka di aplikasi.", "Live data from application database and Keycloak": "Data akun dari NotePreso dan Keycloak", "Account data from NotePreso and Keycloak": "Data akun dari NotePreso dan Keycloak", "Database activity remains available, but Keycloak user mutations require the admin service account.": "Catatan aktivitas tetap tersedia. Perubahan akun memerlukan koneksi pengelolaan Keycloak yang telah dikonfigurasi.", "Activity records remain available. Account changes require a configured Keycloak management connection.": "Catatan aktivitas tetap tersedia. Perubahan akun memerlukan koneksi pengelolaan Keycloak yang telah dikonfigurasi.", "Thread metadata only. Content access is audited.": "Detail percakapan disembunyikan. Akses ke isinya dicatat dalam log audit.", "Conversation details are hidden. Access to content is recorded in the audit log.": "Detail percakapan disembunyikan. Akses ke isinya dicatat dalam log audit.", "Read-only generation activity, user usage and estimated GPT-6 Luna costs. Slide contents and prompts are never shown.": "Pantau aktivitas pembuatan, penggunaan akun, dan perkiraan biaya AI. Isi slide dan prompt tidak ditampilkan.", "Monitor generation activity, account usage, and estimated AI costs. Slide content and prompts are not displayed.": "Pantau aktivitas pembuatan, penggunaan akun, dan perkiraan biaya AI. Isi slide dan prompt tidak ditampilkan.", "Separate application": "Pembuatan presentasi", "Presentation generation": "Pembuatan presentasi", "Billing & access": "Langganan & akses", "Subscriptions & access": "Langganan & akses", "Billing status": "Status pembayaran", "Payment status": "Status pembayaran", "Billing provider": "Penyedia pembayaran", "Payment provider": "Penyedia pembayaran", "Billing": "Pembayaran", "Payments": "Pembayaran", "Search name, username, or email": "Cari berdasarkan nama, nama pengguna, atau email", "Search by name, username, or email": "Cari berdasarkan nama, nama pengguna, atau email", "Username": "Nama pengguna", "Database record": "Catatan akun", "Account record": "Catatan akun", "Chat threads": "Percakapan", "Conversations": "Percakapan", "Saved AI conversations": "Percakapan tersimpan", "Saved conversations": "Percakapan tersimpan", "AI conversations": "Percakapan AI", "Keycloak management ready": "Pengelolaan akun terhubung", "Account management connected": "Pengelolaan akun terhubung", "Keycloak management unavailable": "Pengelolaan akun tidak tersedia", "Account management unavailable": "Pengelolaan akun tidak tersedia", "Checking Keycloak": "Memeriksa pengelolaan akun", "Checking account management": "Memeriksa pengelolaan akun", "Credit wallet not initialized for this account.": "Saldo kredit akun ini belum diinisialisasi.", "Credit balance has not been initialized for this account.": "Saldo kredit akun ini belum diinisialisasi.", "Credit balance temporarily unavailable.": "Saldo kredit untuk sementara tidak tersedia.", "Credit balance is temporarily unavailable.": "Saldo kredit untuk sementara tidak tersedia.", "No generation records yet.": "Belum ada catatan pembuatan presentasi.", "No account activity yet.": "Belum ada aktivitas akun.", "Connection unavailable": "Koneksi tidak tersedia", "Presentation AI data is temporarily unavailable. The existing Admin functions are unaffected.": "Data Presentation AI untuk sementara tidak tersedia. Fitur administrasi lainnya tetap tersedia.", "Presentation AI data is temporarily unavailable. Other administration tools remain available.": "Data Presentation AI untuk sementara tidak tersedia. Fitur administrasi lainnya tetap tersedia.", "Administrator permission is required.": "Akses administrator diperlukan", "Administrator access required": "Akses administrator diperlukan", "Sign in again with an administrator account.": "Masuk dengan akun administrator", "Sign in with an administrator account": "Masuk dengan akun administrator", "This sign-in was valid, but the account does not have access to the AI Speaker Notes administration workspace.": "Anda telah masuk, tetapi akun ini tidak memiliki akses ke administrasi NotePreso.", "You are signed in, but this account does not have access to NotePreso administration.": "Anda telah masuk, tetapi akun ini tidak memiliki akses ke administrasi NotePreso.", "The current Keycloak session can be ended safely. You will then be returned to the admin sign-in page and asked to authenticate again.": "Keluar dari sesi saat ini, lalu masuk menggunakan akun yang memiliki akses administrator.", "Sign out of the current session, then sign in with an account that has administrator access.": "Keluar dari sesi saat ini, lalu masuk menggunakan akun yang memiliki akses administrator.", "Continuing will clear the local application session and request logout from the current Keycloak SSO session before admin authentication starts again.": "Melanjutkan akan mengakhiri sesi lokal dan meminta keluar dari Keycloak sebelum memulai proses masuk administrator kembali.", "Continuing ends the local session and requests sign-out from Keycloak before a new administrator sign-in.": "Melanjutkan akan mengakhiri sesi lokal dan meminta keluar dari Keycloak sebelum memulai proses masuk administrator kembali.", "Return to AI Speaker Notes": "Kembali ke NotePreso", "Return to NotePreso": "Kembali ke NotePreso", "No administrator permission detected.": "Akun ini tidak memiliki akses administrator.", "This account does not have administrator access.": "Akun ini tidak memiliki akses administrator.", "Current session": "Sesi saat ini", "Sign in with another admin account": "Gunakan akun administrator lain", "Use another administrator account": "Gunakan akun administrator lain", "ADMINISTRATIVE ACCESS": "AKSES ADMINISTRATOR", "ADMINISTRATOR ACCESS": "AKSES ADMINISTRATOR", "ACCESS NOT AUTHORIZED": "AKSES DIBATASI", "ACCESS RESTRICTED": "AKSES DIBATASI", "\u2014": "Tidak tersedia", "Not available": "Tidak tersedia", "Loading": "Memuat"});

  function getLanguage() {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === 'id' || saved === 'en' ? saved : DEFAULT_LANGUAGE;
  }

  function translatePattern(value) {
    if (!value) return value;
    if (getLanguage() !== 'id') return EN_COPY[value] || value;
    let match = value.match(/^(\d+) of (\d+) users$/);
    if (match) return `${match[1]} dari ${match[2]} pengguna`;
    match = value.match(/^(\d+) thread(?:s)? · (\d+) messages$/);
    if (match) return `${match[1]} thread · ${match[2]} pesan`;
    match = value.match(/^(\d+) messages$/);
    if (match) return `${match[1]} pesan`;
    match = value.match(/^Ban (.+)\?$/);
    if (match) return `Blokir ${match[1]}?`;
    match = value.match(/^Unban (.+)\?$/);
    if (match) return `Buka blokir ${match[1]}?`;
    match = value.match(/^Delete (.+) from Keycloak and remove this user's stored jobs\/files\? This cannot be undone\.$/);
    if (match) return `Hapus ${match[1]} dari Keycloak dan hapus pekerjaan/berkas tersimpan milik pengguna ini? Tindakan ini tidak dapat dibatalkan.`;
    return ID[value] || value;
  }

  function translateElement(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) {
      if (!node.parentElement || ['SCRIPT', 'STYLE'].includes(node.parentElement.tagName)) continue;
      if (node.parentElement?.closest('.audited-message p,.user-cell,.admin-account-name,.admin-side-user strong')) continue;
      const raw = node.nodeValue || '';
      const trimmed = raw.trim();
      if (!trimmed) continue;
      const translated = translatePattern(trimmed);
      if (translated !== trimmed) node.nodeValue = raw.replace(trimmed, translated);
    }
    const elements = root.nodeType === 1 ? [root, ...root.querySelectorAll('*')] : [...document.querySelectorAll('*')];
    for (const element of elements) {
      if (element.closest?.('.audited-message p,.user-cell,.admin-account-chip,.admin-side-user')) continue;
      for (const attr of ['placeholder', 'aria-label', 'title']) {
        const value = element.getAttribute?.(attr);
        if (value) element.setAttribute(attr, translatePattern(value));
      }
    }
  }

  function syncControls() {
    const lang = getLanguage();
    document.documentElement.lang = lang === 'id' ? 'id' : 'en';
    document.querySelectorAll('[data-admin-lang]').forEach(button => {
      const active = button.dataset.adminLang === lang;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  window.getAdminLocale = getLanguage;
  window.adminT = translatePattern;
  window.ADMIN_LOCALE_TAG = getLanguage() === 'id' ? 'id-ID' : 'en-US';

  document.addEventListener('DOMContentLoaded', () => {
    syncControls();
    translateElement(document.body);
    document.querySelectorAll('[data-admin-lang]').forEach(button => {
      button.addEventListener('click', () => {
        const next = button.dataset.adminLang;
        if (next !== 'id' && next !== 'en') return;
        localStorage.setItem(STORAGE_KEY, next);
        window.location.reload();
      });
    });

    const observer = new MutationObserver(records => {
        for (const record of records) {
        for (const node of record.addedNodes) {
          if (node.nodeType === Node.TEXT_NODE) {
            if (node.parentElement?.closest('.audited-message p,.user-cell,.admin-account-name,.admin-side-user strong')) continue;
            const raw = node.nodeValue || '';
            const trimmed = raw.trim();
            if (trimmed) {
              const translated = translatePattern(trimmed);
              if (translated !== trimmed) node.nodeValue = raw.replace(trimmed, translated);
            }
          } else if (node.nodeType === Node.ELEMENT_NODE) {
            translateElement(node);
          }
        }
      }
    });
    observer.observe(document.body, {subtree:true, childList:true});
  });
})();
