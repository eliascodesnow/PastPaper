let supabaseClient = null;
let currentSession = null;

const supabaseReady = initializeSupabase();

async function initializeSupabase() {
  const response = await fetch("/api/config");
  const config = await response.json();
  if (!response.ok || !config.url || !config.anonKey) {
    throw new Error(config.error || "Supabase is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY in Vercel.");
  }

  if (!window.supabase) {
    await new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
      script.onload = resolve;
      script.onerror = () => reject(new Error("Could not load the Supabase client."));
      document.head.appendChild(script);
    });
  }

  supabaseClient = window.supabase.createClient(config.url, config.anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  const { data, error } = await supabaseClient.auth.getSession();
  if (error) throw error;
  currentSession = data.session;
  supabaseClient.auth.onAuthStateChange((_event, session) => { currentSession = session; });
  return supabaseClient;
}

const Auth = {
  getUser() { return currentSession?.user || null; },
  isLoggedIn() { return !!currentSession?.user; },
  async signOut() {
    await supabaseReady;
    const { error } = await supabaseClient.auth.signOut();
    if (error) throw error;
    currentSession = null;
  },
};

async function api(path, options = {}) {
  await supabaseReady;
  const url = new URL(path, location.origin);
  const pathname = url.pathname.replace(/^\/api/, "");

  if (pathname === "/papers" && (!options.method || options.method === "GET")) {
    const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit")) || 20));
    let query = supabaseClient.from("papers")
      .select("*, profiles!papers_uploader_id_fkey(name)", { count: "exact" })
      .eq("status", "APPROVED");
    const examType = url.searchParams.get("examType");
    const year = Number(url.searchParams.get("year"));
    const search = (url.searchParams.get("q") || "").replace(/[^a-zA-Z0-9\s-]/g, " ").trim();
    if (examType) query = query.eq("exam_type", examType);
    if (year) query = query.eq("year", year);
    if (search) query = query.or(`title.ilike.%${search}%,unit_name.ilike.%${search}%,unit_code.ilike.%${search}%`);
    const { data, error, count } = await query
      .order("created_at", { ascending: false })
      .range((page - 1) * limit, page * limit - 1);
    if (error) throw error;
    const papers = await Promise.all(data.map(async (paper) => {
      const { data: signed, error: signError } = await supabaseClient.storage
        .from("papers").createSignedUrl(paper.storage_path, 3600);
      if (signError) throw signError;
      return {
        ...paper,
        course: paper.course || "Faculty",
        examType: paper.exam_type,
        unitName: paper.unit_name,
        unitCode: paper.unit_code,
        uploaderName: paper.profiles?.name || "Student",
        downloadUrl: signed.signedUrl,
      };
    }));
    return { papers, total: count || 0 };
  }

  if (pathname === "/papers/mine" && (!options.method || options.method === "GET")) {
    const user = Auth.getUser();
    if (!user) throw new Error("Log in to view your uploads.");
    const { data, error } = await supabaseClient.from("papers")
      .select("*").eq("uploader_id", user.id).order("created_at", { ascending: false });
    if (error) throw error;
    return data.map((paper) => ({ ...paper, examType: paper.exam_type, unitName: paper.unit_name, unitCode: paper.unit_code }));
  }

  if (pathname === "/papers" && options.method === "POST") {
    const user = Auth.getUser();
    if (!user) throw new Error("Log in before uploading a paper.");
    const form = options.body;
    const file = form.get("file");
    if (!(file instanceof File) || !file.size) throw new Error("Choose a file first.");
    const title = String(form.get("title") || "").trim();
    if (!title) throw new Error("Give the paper a title.");
    if (!["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      throw new Error("Choose a PDF, JPG, PNG, or WEBP file.");
    }
    if (file.size > 20 * 1024 * 1024) throw new Error("Files must be 20 MB or smaller.");

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath = `${user.id}/${crypto.randomUUID()}-${safeName}`;
    const { error: uploadError } = await supabaseClient.storage.from("papers").upload(storagePath, file, {
      contentType: file.type,
      upsert: false,
    });
    if (uploadError) throw uploadError;

    const yearValue = Number(form.get("year")) || new Date().getFullYear();
    const { data, error } = await supabaseClient.from("papers").insert({
      title,
      unit_code: String(form.get("unitCode") || "").trim() || null,
      unit_name: String(form.get("unitName") || "").trim() || null,
      exam_type: String(form.get("examType") || "Uncategorized"),
      year: yearValue,
      file_name: file.name,
      file_type: file.type,
      storage_path: storagePath,
      uploader_id: user.id,
      status: "PENDING",
    }).select().single();
    if (error) {
      await supabaseClient.storage.from("papers").remove([storagePath]);
      throw error;
    }
    return { paper: { ...data, examType: data.exam_type, unitName: data.unit_name, unitCode: data.unit_code } };
  }

  throw new Error("This request is not supported.");
}

async function renderNav(activePage) {
  await supabaseReady;
  const el = document.getElementById("nav-links");
  if (!el) return;
  const links = [{ href: "index.html", label: "Browse" }];
  if (Auth.isLoggedIn()) {
    links.push({ href: "upload.html", label: "Upload" }, { href: "mine.html", label: "My uploads" });
  } else {
    links.push({ href: "login.html", label: "Log in" }, { href: "register.html", label: "Register" });
  }
  el.replaceChildren(...links.map(({ href, label }) => {
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.textContent = label;
    if (href === activePage) anchor.className = "active";
    return anchor;
  }));
  if (Auth.isLoggedIn()) {
    const logout = document.createElement("a");
    logout.href = "#";
    logout.textContent = "Log out";
    logout.className = "logout-link";
    logout.onclick = async (event) => {
      event.preventDefault();
      await Auth.signOut();
      window.location.href = "index.html";
    };
    el.appendChild(logout);
  }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}
