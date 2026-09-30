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

  function getLanguage() {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === 'id' || saved === 'en' ? saved : DEFAULT_LANGUAGE;
  }

  function translatePattern(value) {
    if (getLanguage() !== 'id' || !value) return value;
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
    if (getLanguage() !== 'id') return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) {
      if (!node.parentElement || ['SCRIPT', 'STYLE'].includes(node.parentElement.tagName)) continue;
      const raw = node.nodeValue || '';
      const trimmed = raw.trim();
      if (!trimmed) continue;
      const translated = translatePattern(trimmed);
      if (translated !== trimmed) node.nodeValue = raw.replace(trimmed, translated);
    }
    const elements = root.nodeType === 1 ? [root, ...root.querySelectorAll('*')] : [...document.querySelectorAll('*')];
    for (const element of elements) {
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
      if (getLanguage() !== 'id') return;
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node.nodeType === Node.TEXT_NODE) {
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
