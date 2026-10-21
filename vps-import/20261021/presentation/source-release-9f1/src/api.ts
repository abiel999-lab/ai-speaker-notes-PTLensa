let csrf: string | undefined;
export class ApiError extends Error {
  constructor(
    public code: string,
    public status = 0,
    public requestId?: string,
  ) {
    super(code);
    this.name = "ApiError";
  }
}
export async function api<T = any>(
  url: string,
  method = "GET",
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch("/api" + url, {
      method,
      credentials: "same-origin",
      signal,
      headers: {
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(csrf && !["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase()) ? { "X-CSRF-Token": csrf } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new ApiError("NETWORK_ERROR");
  }
  if (
    !(response.headers.get("content-type") || "").includes("application/json")
  )
    throw new ApiError("INVALID_RESPONSE", response.status);
  const data = await response.json().catch(() => {
    throw new ApiError("INVALID_RESPONSE", response.status);
  });
  if (url === "/session") {
    csrf = typeof data.csrfToken === "string" && /^[a-f0-9]{64}$/.test(data.csrfToken)
      ? data.csrfToken : undefined;
  }
  if (response.status === 401 && typeof window !== "undefined") {
    csrf = undefined;
    window.dispatchEvent(new Event("verbatim-auth-expired"));
  }
  if (!response.ok)
    throw new ApiError(
      typeof data.error === "string" ? data.error : "REQUEST_FAILED",
      response.status,
      data.requestId,
    );
  if (method !== "GET" && (url === "/prompt-drafts" || url.endsWith("/slide-suggestion")) && typeof window !== "undefined")
    window.dispatchEvent(new window.Event("verbatim-token-usage"));
  return data as T;
}
export function errorMessage(error: unknown, lang: "en" | "id") {
  const code =
    error instanceof ApiError
      ? error.code
      : error instanceof Error
        ? error.message
        : "REQUEST_FAILED";
  const messages: Record<string, [string, string]> = {
    CREATIVE_ASSET_LIMIT: ["Select up to 12 images for one Creative generation.", "Select up to 12 images."],
    CREATIVE_SLIDE_COUNT: ["Use 1–40 slides and provide at least one source block per slide. Add content or lower the target; no AI call was started.", "Check the slide count and source."],
    CREATIVE_INVALID_SCENE: ["The composition could not be repaired safely. No incomplete PPTX was published. Revise the brief before another paid attempt; reported tokens remain visible.", "Creative AI returned an invalid composition."],
    CREATIVE_SOURCE_LIMIT: ["This source is too large for Creative AI. Use a shorter source or Template mode.", "Source too large."],
    CREATIVE_READ_ONLY: ["Creative AI versions support preview and download only. Choose Template mode to edit.", "Download only."],
    CREATIVE_PROMPT_REQUIRED: ["Describe the visual direction for Creative AI.", "A creative brief is required."],
    AUTH_REQUIRED: ["Sign in to continue.", "Masuk untuk melanjutkan."],
    CSRF_REJECTED: ["Reload the page before trying again.", "Muat ulang halaman sebelum mencoba lagi."],
    QUOTA_EXCEEDED: ["Your daily usage limit has been reached. It resets at 00:00 UTC.", "Batas pemakaian harian tercapai. Kuota direset pukul 07.00 WIB."],
    NETWORK_ERROR: [
      "Cannot reach the server. Check that the app is running, then retry.",
      "Server tidak terjangkau. Periksa aplikasi, lalu coba kembali.",
    ],
    INVALID_RESPONSE: [
      "The server returned an unexpected response. Reload the page.",
      "Respons server tidak sesuai. Muat ulang halaman.",
    ],
    QUEUE_UNAVAILABLE: [
      "The generation queue is unavailable. Check the local worker and Redis.",
      "Antrean tidak tersedia. Periksa worker dan Redis lokal.",
    ],
    GENERATION_ACTIVE: [
      "A generation is already running for this project.",
      "Proyek ini masih sedang diproses.",
    ],
    TOO_MANY_ACTIVE_JOBS: [
      "Two projects are already processing. Wait for one to finish.",
      "Dua proyek masih diproses. Tunggu salah satunya selesai.",
    ],
    RATE_LIMITED: [
      "Too many requests. Wait before trying again. Design previews do not consume AI generation quota.",
      "Terlalu banyak permintaan. Tunggu sebelum mencoba lagi. Preview desain tidak memakai kuota generation AI.",
    ],
    PROJECT_CONFLICT: [
      "This project changed in another tab. Reopen it before editing. Your unsaved text is still here.",
      "Proyek berubah di tab lain. Buka ulang sebelum mengedit. Teks yang belum tersimpan masih ada di sini.",
    ],
    SOURCE_CHANGED: [
      "This version uses an older source. Generate from the current source to change its design.",
      "Versi ini memakai sumber lama. Generate dari sumber sekarang untuk mengubah desainnya.",
    ],
    EMPTY_SOURCE: [
      "Add your source text first.",
      "Masukkan teks sumber terlebih dahulu.",
    ],
    SOURCE_TOO_LARGE: [
      "Choose a file smaller than 2 MB.",
      "Pilih berkas di bawah 2 MB.",
    ],
    SOURCE_WORD_LIMIT: [
      "The limit is 20,000 words. No text was truncated.",
      "Batasnya 20.000 kata. Teks tidak dipotong.",
    ],
    FILE_TYPE: [
      "Choose a TXT or Markdown file.",
      "Pilih berkas TXT atau Markdown.",
    ],
    IMAGE_TYPE: [
      "Choose a JPEG or PNG image up to 2 MB and 16 megapixels.",
      "Pilih JPEG atau PNG hingga 2 MB dan 16 megapiksel.",
    ],
    IMAGE_NOT_FOUND: [
      "The selected image is unavailable. Upload it again.",
      "Gambar tidak tersedia. Unggah kembali.",
    ],
    PLAN_COVERAGE: [
      "This layout would change source coverage. The change was rejected.",
      "Layout ini mengubah cakupan sumber. Perubahan ditolak.",
    ],
    SLIDE_NOT_FOUND: [
      "The selected slide no longer exists. Reload the current version.",
      "Slide yang dipilih sudah tidak tersedia. Muat ulang versi saat ini.",
    ],
    TABLE_TOO_WIDE: [
      "Tables support up to six columns. The source was preserved.",
      "Tabel mendukung hingga enam kolom. Sumber tetap tersimpan.",
    ],
    TABLE_CELL_TOO_LONG: [
      "A table cell is too long to fit safely. Choose literal reading mode for this source.",
      "Sel tabel terlalu panjang. Gunakan mode teks literal untuk sumber ini.",
    ],
    SLIDE_LIMIT: [
      "This design exceeds the 80-slide limit. Try compact spacing.",
      "Desain melebihi batas 80 slide. Coba jarak compact.",
    ],
    AI_NOT_CONFIGURED: [
      "AI content drafting is not available. Configure your local OpenAI API key securely.",
      "Penyusunan konten AI belum tersedia. Konfigurasikan OpenAI API key lokal secara aman.",
    ],
    AI_DRAFT_UNAVAILABLE: [
      "AI content drafting is temporarily unavailable. Nothing was replaced; please retry later.",
      "AI untuk menyusun konten sedang tidak tersedia. Teks belum diganti; coba lagi nanti.",
    ],
    AI_DRAFT_INVALID: [
      "AI returned an incomplete draft. Your existing text is safe. Try another topic.",
      "AI mengembalikan draf yang tidak lengkap. Teks lama aman. Coba topik lain.",
    ],
    AI_DRAFT_TIMEOUT: [
      "AI took too long. No project was changed. Try again shortly.",
      "AI terlalu lama merespons. Proyek tidak berubah. Coba beberapa saat lagi.",
    ],
    AI_RATE_LIMITED: [
      "The AI provider is busy or rate-limited. Wait and try again.",
      "Penyedia AI sedang sibuk atau membatasi permintaan. Tunggu lalu coba lagi.",
    ],
    INVALID_INPUT: ["Please check the input fields.", "Periksa kolom input."],
    HOST_REJECTED: [
      "Open this local application through localhost or 127.0.0.1.",
      "Buka aplikasi lokal melalui localhost atau 127.0.0.1.",
    ],
    ORIGIN_REJECTED: [
      "This address does not match APP_ORIGIN. Open the configured local URL.",
      "Alamat tidak sesuai APP_ORIGIN. Buka URL lokal yang dikonfigurasi.",
    ],
    EXPORT_NOT_READY: [
      "The PowerPoint file is not available. Generate the presentation again.",
      "Berkas PowerPoint tidak tersedia. Buat kembali presentasi.",
    ],
    EXPORT_CORRUPTED: [
      "The exported PowerPoint file failed validation and cannot be downloaded. Please generate it again.",
      "Berkas PowerPoint gagal diverifikasi dan tidak dapat diunduh. Buat ulang presentasi.",
    ],
    PDF_NOT_READY: [
      "PDF requires a rendered, completed presentation.",
      "PDF memerlukan presentasi yang selesai dirender.",
    ],
    DRAFT_CHANGED: [
      "The project changed while saving. Try again from the current project.",
      "Proyek berubah saat penyimpanan. Coba dari proyek sekarang.",
    ],
  };
  const message =
    messages[code]?.[lang === "en" ? 0 : 1] ||
    (lang === "en"
      ? "The request failed. Your source was preserved."
      : "Permintaan gagal. Teks sumber tetap tersimpan.");
  return {
    message,
    code,
    requestId: error instanceof ApiError ? error.requestId : undefined,
  };
}
