// Point this at your deployed backend URL when you host it.
// Preferred runtime override order:
// 1) window.API_BASE (set by a script or hosting environment)
// 2) <meta name="api-base" content="https://..."> (set per-deploy in Vercel)
// 3) fallback to same-origin /api so a proxy or same-host deployment works
const API_BASE = (function() {
  if (window.API_BASE) return window.API_BASE.replace(/\/$/, "");
  const meta = document.querySelector('meta[name="api-base"]');
  if (meta && meta.content && meta.content.trim()) return meta.content.replace(/\/$/, "");
  // default to same origin + /api (works when backend is mounted on same host or proxied)
  const origin = (location && location.origin) ? location.origin.replace(/\/$/, "") : "";
  return origin ? origin + "/api" : "";
})();

const Auth = {
  getToken() { return localStorage.getItem("fp_token"); },
  getUser() {
    const raw = localStorage.getItem("fp_user");
    return raw ? JSON.parse(raw) : null;
  },
  setSession(token, user) {
    localStorage.setItem("fp_token", token);
    localStorage.setItem("fp_user", JSON.stringify(user));
  },
  clear() {
    localStorage.removeItem("fp_token");
    localStorage.removeItem("fp_user");
  },
  isLoggedIn() { return !!this.getToken(); },
};

async function api(path, options = {}) {
  const headers = options.headers || {};
  if (!(options.body instanceof FormData) && options.body) {
    headers["Content-Type"] = "application/json";
  }
  const token = Auth.getToken();
  if (token) headers["Authorization"] = "Bearer " + token;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const isJson = res.headers.get("content-type")?.includes("application/json");
  const data = isJson ? await res.json() : null;

  if (!res.ok) {
    throw new Error((data && data.error) || `Request failed (${res.status})`);
  }
  return data;
}

function renderNav(activePage) {
  const user = Auth.getUser();
  const el = document.getElementById("nav-links");
  if (!el) return;

  const links = [{ href: "index.html", label: "Browse" }];

  if (Auth.isLoggedIn()) {
    links.push({ href: "upload.html", label: "Upload" });
    links.push({ href: "mine.html", label: "My uploads" });
  } else {
    links.push({ href: "login.html", label: "Log in" });
    links.push({ href: "register.html", label: "Register" });
  }

  el.innerHTML = links
    .map((l) => `<a href="${l.href}" class="${activePage === l.href ? "active" : ""}">${l.label}</a>`)
    .join("");

  if (Auth.isLoggedIn()) {
    const logout = document.createElement("a");
    logout.href = "#";
    // Avoid displaying raw registration numbers in the public nav.
    logout.textContent = "Log out (Account)";
    logout.title = "Click to sign out";
    logout.className = "logout-link";
    logout.onclick = (e) => { e.preventDefault(); Auth.clear(); window.location.href = "index.html"; };
    el.appendChild(logout);
  }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}
