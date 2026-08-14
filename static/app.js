const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

const state = {
  tab: "pedir",
  online: navigator.onLine !== false,
  token: localStorage.getItem("ctoken") || "",
  user: null,
  negocio: null,
  categorias: [],
  menu: [],
  ingredientes: [],
  opciones: [],
  carrito: [],           // {producto, opciones:{grupoId:opcionId}, extras:[ids], cantidad}
  pedido: { tipo: "salon", cliente_id: null, cliente_nombre: "", mesa: "", direccion: "", telefono: "", nota: "", metodo_pago: "efectivo" },
  clientes: [],
  historial: [],
  kitchenTimer: null,
  umbralMin: 20,         // minutos para alerta roja
  umbralWarn: 12,
  audio: null,
  precioCombinado: 15,
};

const guardarToken = t => { state.token = t; t ? localStorage.setItem("ctoken", t) : localStorage.removeItem("ctoken"); };

/* ============ OFFLINE (cola + banner) ============ */
const COLA_KEY = "cola_offline";
const leerCola = () => { try { return JSON.parse(localStorage.getItem(COLA_KEY) || "[]"); } catch (e) { return []; } };
const guardarCola = c => localStorage.setItem(COLA_KEY, JSON.stringify(c));
function encolarAccion(acc) { const c = leerCola(); c.push(acc); guardarCola(c); actualizarBannerOffline(); }
function actualizarBannerOffline() {
  const banner = $("#offline-banner"), txt = $("#offline-text", banner);
  const pendientes = leerCola().length;
  if (state.online && pendientes === 0) { banner.classList.add("hidden"); return; }
  banner.classList.remove("hidden");
  if (txt) txt.textContent = state.online
    ? `Pendiente por enviar: ${pendientes} acción(es)…`
    : `Sin conexión — tus cambios se guardarán y se enviarán al reconectar (${pendientes} pendiente(s))`;
}
function setOnline(on) {
  state.online = !!on;
  actualizarBannerOffline();
  if (state.online) flushCola();
}
window.addEventListener("offline", () => setOnline(false));
window.addEventListener("online", () => { setOnline(true); loadCocina(); renderCocina(); updateBadge(); });
async function flushCola() {
  let cola = leerCola();
  if (!cola.length) return;
  actualizarBannerOffline();
  const tempMap = {};
  while (cola.length) {
    const acc = cola[0];
    try {
      if (acc.tipo === "pedido") {
        const r = await api("/pedidos", "POST", acc.payload);
        tempMap[acc.tempId] = r.id;
        toast(`Comanda ${r.folio} registrada (estaba pendiente)`, "ok");
        if (typeof acc.callback === "function") acc.callback(r);
      } else if (acc.tipo === "estado") {
        const ref = tempMap[acc.ref] || acc.ref;
        await api(`/pedidos/${ref}/estado?estado=${acc.nuevo}`, "POST", {});
      } else if (acc.tipo === "cancelar") {
        const ref = tempMap[acc.ref] || acc.ref;
        await api(`/pedidos/${ref}/cancelar?motivo=${encodeURIComponent(acc.motivo || "")}`, "POST", {});
      }
    } catch (e) { actualizarBannerOffline(); break; }  // sin red aun: se reenvia en el proximo online
    cola.shift();
    guardarCola(cola);
  }
  actualizarBannerOffline();
  loadCocina(); renderCocina(); updateBadge();
  if (state.tab === "historial") loadHistorial();
  if (state.tab === "reportes") loadReportes();
}
setOnline(navigator.onLine !== false);

const PARAMS = new URLSearchParams(location.search);
if (PARAMS.get("umbral")) state.umbralMin = +PARAMS.get("umbral");
if (PARAMS.get("warn")) state.umbralWarn = +PARAMS.get("warn");

/* ============ FETCH HELPERS ============ */
async function api(path, method = "GET", data) {
  const opts = { method, headers: {} };
  if (state.token) opts.headers["Authorization"] = "Bearer " + state.token;
  if (data !== undefined) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(data);
  }
  let res;
  try {
    res = await fetch("/api" + path, { ...opts, cache: "no-store" });
  } catch (e) {
    // Sin red: se marca offline para que la UI lo avise y la cola lo capture.
    setOnline(false);
    throw new Error("Sin conexión a internet");
  }
  if (res.status === 401 && state.token) {
    guardarToken("");
    location.reload();
    throw new Error("Sesión expirada");
  }
  if (res.status === 502 || res.status === 504 || res.status === 503) { setOnline(false); }
  if (!res.ok) {
    let msg = res.statusText;
    try { const j = await res.json(); msg = j.detail || msg; } catch (e) {}
    if (res.status >= 500) setOnline(false);
    throw new Error(msg);
  }
  setOnline(true);
  return res.json();
}

/* ============ UTILS ============ */
function money(n) {
  return "$" + (Math.round((n + Number.EPSILON) * 100) / 100).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtTime(seg) {
  const h = Math.floor(seg / 3600), m = Math.floor((seg % 3600) / 60), s = seg % 60;
  const pad = n => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}
function esc(s) { return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function toast(msg, tipo = "ok") {
  const div = document.createElement("div");
  div.className = `toast ${tipo === "ok" ? "success" : tipo}`;
  div.innerHTML = `${icon(tipo === "ok" ? "check" : tipo === "error" ? "warning" : "alert")}<span>${esc(msg)}</span>`;
  $("#toasts").appendChild(div);
  setTimeout(() => div.remove(), 3200);
}
function formatoDatos(n) {
  return n + " " + (n >= 2 ? "pzas" : "pza");
}

/* ============ SONIDO (WebAudio, sin archivos) ============ */
function beep(freq = 880, dur = 0.18, when = 0) {
  try {
    const ctx = state.audio;
    if (!ctx) return;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = freq; o.type = "sine";
    g.gain.setValueAtTime(0.001, ctx.currentTime + when);
    g.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + when + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + when + dur);
    o.connect(g).connect(ctx.destination);
    o.start(ctx.currentTime + when);
    o.stop(ctx.currentTime + when + dur + 0.05);
  } catch (e) {}
}
function alertaCritica() {
  beep(660, 0.25); beep(880, 0.25, 0.3); beep(990, 0.3, 0.6);
}

/* ============ NAVEGACIÓN ============ */
const VIEWS = ["pedir", "cocina", "historial", "menu", "ingredientes", "clientes", "reportes"];
function setTab(tab) {
  state.tab = tab;
  $$(".nav-btn").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
  VIEWS.forEach(v => $("#view-" + v).classList.toggle("active", v === tab));
  if (tab === "pedir") renderCategoriasGrid();
  if (tab === "cocina") startKitchenLoop();
  if (tab === "historial") loadHistorial();
  if (tab === "menu") loadMenu();
  if (tab === "ingredientes") loadIngredientes();
  if (tab === "clientes") loadClientes("");
  if (tab === "reportes") loadReportes();
}
$("#nav").addEventListener("click", e => {
  const btn = e.target.closest(".nav-btn");
  if (btn) setTab(btn.dataset.tab);
});

/* ============ RELOJ ============ */
setInterval(() => {
  const d = new Date();
  const el = $("#clock");
  if (el) el.textContent = d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
}, 1000);

/* ============ AUTH GATEWAY ============ */
function renderNavIcons() {
  $$("[data-icon]").forEach(el => { el.innerHTML = icon(el.dataset.icon, 22); });
}
async function cargarApp() {
  state.usaAvanzado = (state.negocio && state.negocio.usa_avanzado) === 1;
  $$(".nav-btn[data-tab='ingredientes']").forEach(b => b.classList.remove("hidden"));
  $("#app").classList.remove("hidden");
  $("#auth-screen").classList.add("hidden");
  $("#onboarding-screen").classList.add("hidden");
  renderNavIcons();
  $("#brand-icon").innerHTML = icon("favicon");
  $("#brand-name").textContent = state.negocio ? state.negocio.nombre : "Comandas";
  $("#brand-sub").textContent = state.negocio ? "Sistema multinegocio" : "";
  solicitarWakeLock();
  bootstrap();
}
let authMode = "login";
function mostrarAuth() {
  $("#app").classList.add("hidden");
  $("#onboarding-screen").classList.add("hidden");
  $("#auth-screen").classList.remove("hidden");
  $("#auth-brand-icon").innerHTML = icon("favicon");
  renderNavIcons();
}
function mostrarOnboarding() {
  $("#app").classList.add("hidden");
  $("#auth-screen").classList.add("hidden");
  $("#onboarding-screen").classList.remove("hidden");
}
function setAuthMode(m) {
  authMode = m;
  $$(".auth-tab").forEach(t => t.classList.toggle("active", t.dataset.mode === m));
  $("#auth-password").placeholder = "Mínimo 6 caracteres";
  const btn = $("#auth-submit");
  if (btn) btn.innerHTML = (m === "login" ? "Entrar" : "Crear cuenta");
  $("#auth-error").classList.add("hidden");
}
async function manejarAuth(e) {
  e.preventDefault();
  const email = $("#auth-email").value.trim();
  const password = $("#auth-password").value;
  if (!email || !password) { mostrarErrorAuth("Completa el correo y la contraseña"); return; }
  $("#auth-submit").disabled = true;
  try {
    const r = await fetch("/api/auth/" + (authMode === "login" ? "login" : "signup"), {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.detail || "No se pudo iniciar sesión");
    guardarToken(j.session);
    const me = await api("/me", "GET");
    cargarApp();
    if (!me.negocio) { estadoOnboarding(); return; }
    state.negocio = me.negocio;
    $("#brand-name").textContent = state.negocio.nombre;
  } catch (err) {
    mostrarErrorAuth(err.message);
  } finally {
    $("#auth-submit").disabled = false;
  }
}
async function crearNegocio(e) {
  e.preventDefault();
  const nombre = $("#on-nombre").value.trim();
  if (!nombre) { mostrarErrorOn("\u00bfCómo se llama tu negocio?"); return; }
  $("#on-submit").disabled = true;
  try {
    const negocio = await api("/restaurantes", "POST", {
      nombre, telefono: $("#on-telefono").value.trim(), direccion: $("#on-direccion").value.trim(),
    });
    state.negocio = negocio;
    toast("¡Negocio creado!");
    cargarApp();
  } catch (err) {
    const msg = String(err.message || "");
    if (/duplicate|ya existe|negocio/i.test(msg)) {
      const me = await api("/me", "GET").catch(() => null);
      if (me && me.negocio) { state.negocio = me.negocio; cargarApp(); return; }
    }
    mostrarErrorOn(err.message);
  } finally {
    $("#on-submit").disabled = false;
  }
}
function mostrarErrorAuth(msg) {
  const el = $("#auth-error");
  el.textContent = msg; el.classList.remove("hidden");
}
function mostrarErrorOn(msg) {
  const el = $("#on-error");
  el.textContent = msg; el.classList.remove("hidden");
}
$("#auth-form").addEventListener("submit", manejarAuth);
$("#onboarding-form").addEventListener("submit", crearNegocio);
$("#btn-logout").addEventListener("click", () => { guardarToken(""); location.reload(); });
$("#btn-config").addEventListener("click", modalConfigNegocio);
$$(".auth-tab").forEach(t => t.addEventListener("click", () => setAuthMode(t.dataset.mode)));

/* ============ CONFIGURACIÓN DEL NEGOCIO ============ */
function modalConfigNegocio() {
  const n = state.negocio || {};
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.innerHTML = `
    <div class="modal">
      <div class="modal-head"><h3>Configuración del negocio</h3><button class="modal-close" id="cnf-close">${icon("close")}</button></div>
      <div class="field"><label>Nombre del negocio</label><input id="cnf-nombre" value="${esc(n.nombre)}"></div>
      <div class="field"><label>Teléfono</label><input id="cnf-telefono" value="${esc(n.telefono || "")}" placeholder="612 ••• ••••"></div>
      <div class="field"><label>Dirección</label><input id="cnf-direccion" value="${esc(n.direccion || "")}" placeholder="Calle, número, colonia"></div>
      <div class="modal-foot">
        <button class="btn ghost" id="cnf-cancel">Cancelar</button>
        <button class="btn btn-primary" id="cnf-save">${icon("check")}Guardar</button>
      </div>
    </div>`;
  $("#modal-root").appendChild(modal);
  $("#cnf-close", modal).onclick = $("#cnf-cancel", modal).onclick = () => modal.remove();
  $("#cnf-save", modal).onclick = async () => {
    const nombre = $("#cnf-nombre", modal).value.trim();
    const telefono = $("#cnf-telefono", modal).value.trim();
    const direccion = $("#cnf-direccion", modal).value.trim();
    if (!nombre) return toast("Escribe el nombre del negocio", "warn");
    try {
      await api("/restaurantes/" + state.negocio.id, "PUT", { nombre, telefono, direccion });
      state.negocio = { ...state.negocio, nombre, telefono, direccion };
      $("#brand-name").textContent = state.negocio.nombre;
      toast("Negocio actualizado");
      modal.remove();
    } catch (e) { toast("Error: " + e.message, "error"); }
  };
}

/* ============ CARGA INICIAL ============ */
function bootstrap() {
  const menuP = api("/menu");
  const ingsP = api("/menu/ingredientes");
  const opcP = api("/menu/opciones");
  Promise.all([menuP, ingsP, opcP]).then(async ([menu, ings, opc]) => {
    state.menu = menu;
    state.ingredientes = ings;
    state.opciones = opc;
    state.precioCombinado = parseFloat((await api("/menu/config/precio_combinado").catch(() => ({ valor: "15" }))).valor || 15);
    renderCategorias();
    setTab("pedir");
  }).catch(e => toast("Error al cargar: " + e.message, "error"));
}
function estadoOnboarding() {
  if (state.user) $("#onboarding-screen .auth-brand-text strong").textContent = "¡Hola!";
}
async function boot() {
  if (!state.token) { mostrarAuth(); return; }
  try {
    const me = await api("/me", "GET");
    state.user = me.user;
    state.negocio = me.negocio || null;
    if (!me.negocio) {
      mostrarOnboarding();
      $("#on-nombre").focus();
    } else {
      cargarApp();
    }
  } catch (e) {
    mostrarAuth();
  }
}
boot();

/* ============ VISTA: TOMAR PEDIDO ============ */
function renderCategorias() {
  const v = $("#view-pedir");
  v.innerHTML = `
    <div class="view-header">
      <div>
        <div class="view-title">Tomar pedido</div>
        <div class="view-sub">Nueva orden · varios productos por comanda</div>
      </div>
      <div class="btn ghost" id="cliente-btn">${icon("people")}${state.pedido.cliente_nombre ? esc(state.pedido.cliente_nombre) : "Cliente"}</div>
    </div>
    <div class="pedir-layout">
      <div class="pedir-left" id="pedir-izq"></div>
      <div class="pedir-right card">${renderCarritoHTML()}</div>
    </div>`;
  $("#cliente-btn").addEventListener("click", () => abrirModalCliente());
  renderCategoriasGrid();
}
function renderCategoriasGrid() {
  const izq = $("#pedir-izq");
  izq.innerHTML = `<div class="cat-grid">
    ${state.menu.map(c => `
      <button class="cat-btn" data-cat="${c.categoria.id}">
        ${icon(c.categoria.icono, 52)}
        <span>${esc(c.categoria.nombre)}</span>
      </button>`).join("")}
  </div>`;
  $$(".cat-btn", izq).forEach(b => b.addEventListener("click", () => renderProductos(+b.dataset.cat)));
}
function renderProductos(catId) {
  const cat = state.menu.find(c => c.categoria.id === catId);
  if (!cat) return;
  const esPizza = /pizza/i.test(cat.categoria.nombre);
  const izq = $("#pedir-izq");
  izq.innerHTML = `
    <div class="config-head">
      <button class="btn ghost btn-sm" id="back-cats">${icon("arrowLeft")}Categorías</button>
      <h2>${esc(cat.categoria.nombre)}</h2>
    </div>
    ${cat.productos.length === 0 ? `
      <div class="card kitchen-empty" style="margin-top:18px">${icon("plate", 48)}<div style="font-size:15px;font-weight:700">Aún sin productos</div>
      <div style="margin-top:4px;color:var(--gris-400)">Agrégalos desde el Catálogo y aparecerán aquí al instante</div></div>` : `
    <div class="product-grid">
      ${cat.productos.map(p => `
        <button class="product-btn" data-pid="${p.id}">
          ${icon(p.icono, 40)}
          <div class="name">${esc(p.nombre)}</div>
          <div class="price">${precioMostrar(p)}</div>
        </button>`).join("")}
    </div>`}`;
  $("#back-cats").addEventListener("click", renderCategoriasGrid);
  $$(".product-btn", izq).forEach(b => b.addEventListener("click", () => {
    const pid = +b.dataset.pid;
    const p = cat.productos.find(x => x.id === pid);
    const tieneOpciones = (cat.opciones || []).length > 0;
    if (esPizza || esProductoPizza(p)) abrirPizzaBuilder(pid);
    else tieneOpciones ? abrirConfigurador(pid) : agregarDirecto(pid);
  }));
}
function esProductoPizza(p) {
  return p && (p.personalizable === 1 || (p.precios && Object.keys(p.precios).length > 0));
}
function precioMostrar(p) {
  const precios = p.precios || {};
  if (precios.mediana != null) return `Mediana ${money(precios.mediana)}`;
  return money(p.precio_base);
}

/* Producto sin opciones (Boneeles, Hot dogs, etc.): agregar directo con cantidad */
function agregarDirecto(productoId) {
  const p = state.menu.flatMap(c => c.productos).find(x => x.id === productoId);
  if (!p) return;
  let qty = 1;
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.innerHTML = `
    <div class="modal">
      <div class="modal-head">
        ${icon(p.icono)}
        <h3>${esc(p.nombre)}</h3>
        <div class="price-tag" style="margin-left:auto;font-size:22px;font-weight:900;color:var(--rojo)">${money(p.precio_base * qty)}</div>
        <button class="modal-close" id="dir-close">${icon("close")}</button>
      </div>
      <div class="opt-group">
        <div class="opt-label">Cantidad</div>
        <div class="amt" style="margin-top:0">
          <button class="amt-btn" id="dir-minus">${icon("minus")}</button>
          <span class="qty" id="dir-qty">1</span>
          <button class="amt-btn" id="dir-plus">${icon("plus")}</button>
        </div>
      </div>
      <div class="modal-foot">
        <button class="btn ghost" id="dir-cancel">Cancelar</button>
        <button class="btn btn-primary" id="dir-add">${icon("plus")}Agregar al pedido</button>
      </div>
    </div>`;
  $("#modal-root").appendChild(modal);
  const refs = { q: $("#dir-qty", modal), t: $(".price-tag", modal) };
  function setQty(n) {
    qty = Math.max(1, n);
    refs.q.textContent = qty;
    refs.t.textContent = money(p.precio_base * qty);
  }
  $("#dir-minus", modal).onclick = () => setQty(qty - 1);
  $("#dir-plus", modal).onclick = () => setQty(qty + 1);
  $("#dir-close", modal).onclick = $("#dir-cancel", modal).onclick = () => modal.remove();
  $("#dir-add", modal).onclick = () => {
    state.carrito.push({ producto: p, opciones: {}, extras: [], cantidad: qty });
    modal.remove();
    renderCarrito();
    renderCategoriasGrid();
    toast(`${p.nombre} agregado al pedido`);
  };
}

/* ---------- CONFIGURADOR DE PRODUCTO ---------- */
function abrirConfigurador(productoId) {
  const p = state.menu.flatMap(c => c.productos).find(x => x.id === productoId);
  const grupos = state.menu.find(c => c.productos.some(x => x.id === productoId)).opciones;
  const esPersonalizada = p.personalizable === 1;
  const ingsPizza = state.ingredientes;

  const optsSel = {}; // grupoId -> opcionId
  grupos.forEach(g => {
    const def = g.opciones.find(o => o.nombre.toLowerCase().includes("mediana")) || g.opciones[0];
    if (g.seleccion_texto === "elegir_una") optsSel[g.id] = def.id;
  });
  const extrasSel = new Set();
  let distribucion = "combinado";
  const mitad1 = new Set();
  const mitad2 = new Set();

  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.innerHTML = `
    <div class="modal wide">
      <div class="modal-head">
        ${icon(p.icono)}
        <h3>${esc(p.nombre)}</h3>
        <div class="price-tag" style="margin-left:auto;font-size:22px;font-weight:900;color:var(--rojo)">${money(p.precio_base)}</div>
        <button class="modal-close" id="cfg-close">${icon("close")}</button>
      </div>
      <div id="cfg-body"></div>
      <div class="modal-foot">
        <button class="btn ghost" id="cfg-cancel">Cancelar</button>
        <button class="btn btn-primary btn-lg" id="cfg-add">${icon("plus")}Agregar al pedido</button>
      </div>
    </div>`;
  $("#modal-root").appendChild(modal);

  const body = $("#cfg-body", modal);
  let qty = 1;
  function totalIngredientes() {
    if (esPersonalizada) return distribucion === "combinado" ? mitad1.size : mitad1.size + mitad2.size;
    return extrasSel.size;
  }
  function renderCfg() {
    body.innerHTML = grupos.map(g => `
      <div class="opt-group">
        <div class="opt-label">${esc(g.nombre)}${g.seleccion_texto === "opcional_unica" ? " · opcional" : ""}</div>
        <div class="opt-chips">
          ${g.opciones.map(o => `
            <button class="chip ${optsSel[g.id] === o.id ? "selected" : ""}" data-g="${g.id}" data-o="${o.id}">
              <span>${esc(o.nombre)}</span>
              ${o.recargo ? `<span class="rec">${o.recargo > 0 ? "+" : ""}${money(o.recargo)}</span>` : ""}
            </button>`).join("")}
        </div>
      </div>`).join("") + (esPersonalizada ? `
      <div class="opt-group">
        <div class="opt-label">Distribución</div>
        <div class="opt-chips">
          <button class="chip ${distribucion === "combinado" ? "selected" : ""}" data-dist="combinado"><span>Combinado</span></button>
          <button class="chip ${distribucion === "mitad" ? "selected" : ""}" data-dist="mitad"><span>Mitad y mitad</span></button>
        </div>
      </div>` : "") + (esPersonalizada && distribucion === "mitad" ? `
      <div class="opt-group">
        <div class="opt-label">Mitad 1</div>
        <div class="opt-chips">
          ${ingsPizza.map(i => `
            <button class="ing-check ${mitad1.has(i.id) ? "selected" : ""}" data-ing1="${i.id}">
              <span class="checkbox">${icon("check")}</span>
              <span>${esc(i.nombre)}</span>
            </button>`).join("")}
        </div>
      </div>
      <div class="opt-group">
        <div class="opt-label">Mitad 2</div>
        <div class="opt-chips">
          ${ingsPizza.map(i => `
            <button class="ing-check ${mitad2.has(i.id) ? "selected" : ""}" data-ing2="${i.id}">
              <span class="checkbox">${icon("check")}</span>
              <span>${esc(i.nombre)}</span>
            </button>`).join("")}
        </div>
      </div>` : esPersonalizada ? `
      <div class="opt-group">
        <div class="opt-label">Ingredientes (combinado)</div>
        <div class="opt-chips">
          ${ingsPizza.map(i => `
            <button class="ing-check ${mitad1.has(i.id) ? "selected" : ""}" data-ing1="${i.id}">
              <span class="checkbox">${icon("check")}</span>
              <span>${esc(i.nombre)}</span>
              ${i.recargo ? `<span class="rec">+${money(i.recargo)}</span>` : ""}
            </button>`).join("")}
        </div>
      </div>` : state.usaAvanzado ? `
      <div class="opt-group">
        <div class="opt-label">Ingredientes adicionales</div>
        <div class="opt-chips">
          ${ingsPizza.map(i => `
            <button class="ing-check ${extrasSel.has(i.id) ? "selected" : ""}" data-i="${i.id}" style="min-width:200px">
              <span class="checkbox">${icon("check")}</span>
              <span>${esc(i.nombre)}</span>
              ${i.recargo ? `<span class="rec">+${money(i.recargo)}</span>` : ""}
            </button>`).join("")}
        </div>
      </div>` : "") + `
      <div class="opt-group">
        <div class="opt-label">Cantidad</div>
        <div class="amt" style="margin-top:0">
          <button class="amt-btn" id="cfg-minus">${icon("minus")}</button>
          <span class="qty" id="cfg-qty">1</span>
          <button class="amt-btn" id="cfg-plus">${icon("plus")}</button>
        </div>
      </div>`;
    $("#cfg-qty", modal).textContent = qty;
    $("#cfg-minus", modal).onclick = () => { qty = Math.max(1, qty - 1); $("#cfg-qty", modal).textContent = qty; updatePrecio(); };
    $("#cfg-plus", modal).onclick = () => { qty++; $("#cfg-qty", modal).textContent = qty; updatePrecio(); };

    $$("[data-g]", body).forEach(ch => ch.addEventListener("click", () => {
      const g = +ch.dataset.g, o = +ch.dataset.o;
      optsSel[g] = o;
      renderCfg();
    }));
    $$("[data-dist]", body).forEach(ch => ch.addEventListener("click", () => {
      distribucion = ch.dataset.dist;
      renderCfg();
    }));
    $$("[data-ing1]", body).forEach(ch => ch.addEventListener("click", () => {
      const i = +ch.dataset.ing1;
      mitad1.has(i) ? mitad1.delete(i) : mitad1.add(i);
      renderCfg();
    }));
    $$("[data-ing2]", body).forEach(ch => ch.addEventListener("click", () => {
      const i = +ch.dataset.ing2;
      mitad2.has(i) ? mitad2.delete(i) : mitad2.add(i);
      renderCfg();
    }));
    $$("[data-i]", body).forEach(ch => ch.addEventListener("click", () => {
      const i = +ch.dataset.i;
      extrasSel.has(i) ? extrasSel.delete(i) : extrasSel.add(i);
      renderCfg();
    }));
    updatePrecio();
  }
  function updatePrecio() {
    let total = 0;
    const q = +($("#cfg-qty", modal)?.textContent || "1");
    total = calcPrecio(p, optsSel, [...extrasSel], esPersonalizada ? { distribucion, mitad1: [...mitad1], mitad2: [...mitad2] } : null) * q;
    $(".price-tag", modal).textContent = money(total);
  }
  renderCfg();

  $("#cfg-close", modal).onclick = () => modal.remove();
  $("#cfg-cancel", modal).onclick = () => modal.remove();
  $("#cfg-add", modal).onclick = () => {
    const q = +$("#cfg-qty", modal)?.textContent || 1;
    if (esPersonalizada) {
      state.carrito.push({
        producto: p, opciones: { ...optsSel }, extras: [],
        personalizada: { distribucion, mitad1: [...mitad1], mitad2: distribucion === "mitad" ? [...mitad2] : [] },
        cantidad: q,
      });
    } else {
      state.carrito.push({ producto: p, opciones: { ...optsSel }, extras: [...extrasSel], cantidad: q });
    }
    modal.remove();
    renderCarrito();
    renderCategoriasGrid();
    toast(`${p.nombre} agregado al pedido`);
  };
}

/* ---------- CONSTRUCTOR DE PIZZA (estilo Domino's) ---------- */
function abrirPizzaBuilder(productoId) {
  const p = state.menu.flatMap(c => c.productos).find(x => x.id === productoId);
  const cat = state.menu.find(c => c.productos.some(x => x.id === productoId));
  if (!p || !cat) return;
  // El tamaño es nativo del constructor: se ignoran grupos llamados "Tamaño".
  const grupos = (cat.opciones || []).filter(g => !/tamaño|tamanio/i.test(g.nombre));
  const ingredientes = state.ingredientes;
  const precios = p.precios || {};
  const TAMANOS = ["individual", "chica", "mediana", "grande"];

  const sel = {
    tamano: precios.mediana != null ? "mediana" : (precios.individual != null ? "individual" : (precios.chica != null ? "chica" : "grande")),
    optsSel: {},       // grupoId -> opcionId
    ingMode: {},       // ingredienteId -> "entera" | "izq" | "der"  (ausente = sin)
  };
  grupos.forEach(g => {
    const def = g.opciones.find(o => o.nombre.toLowerCase().includes("mediana")) || g.opciones[0];
    if (g.seleccion_texto === "elegir_una" && def) sel.optsSel[g.id] = def.id;
  });
  // Receta base: pre-marcar como entera
  (p.receta || []).forEach(iid => { if (!sel.ingMode[iid]) sel.ingMode[iid] = "entera"; });
  let paso = 0, qty = 1, nota = "";

  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.innerHTML = `
    <div class="modal wide">
      <div class="modal-head">
        ${icon(p.icono)}
        <h3>${esc(p.nombre)}</h3>
        <div class="price-tag" style="margin-left:auto;font-size:22px;font-weight:900;color:var(--rojo)"></div>
        <button class="modal-close" id="pz-close">${icon("close")}</button>
      </div>
      <div class="pizza-steps">
        ${["Tamaño", "Orilla", "Ingredientes", "Revisar"].map((n, i) => `
          <div class="pz-step" data-step="${i}"><span class="dot">${i + 1}</span><span>${n}</span></div>`).join("")}
      </div>
      <div id="pz-body"></div>
      <div class="modal-foot">
        <button class="btn ghost" id="pz-back">${icon("arrowLeft")}Atrás</button>
        <button class="btn btn-primary btn-lg" id="pz-next">Siguiente ${icon("arrowRight")}</button>
      </div>
    </div>`;
  $("#modal-root").appendChild(modal);

  const body = $("#pz-body", modal);
  function precioBase() { return (sel.tamano && precios[sel.tamano] != null) ? +precios[sel.tamano] : p.precio_base; }
  function precioUnit() {
    let t = precioBase();
    for (const gid in sel.optsSel) {
      const g = grupos.find(x => x.id == gid);
      const o = g?.opciones.find(x => x.id == sel.optsSel[gid]);
      if (o) t += o.recargo;
    }
    return Math.round(t * 100) / 100;
  }
  function updateTotal() { $(".price-tag", modal).textContent = money(precioUnit() * qty); }
  function personalizadaFinal() {
    const mitad1 = [], mitad2 = [];
    for (const iid in sel.ingMode) {
      const m = sel.ingMode[iid];
      if (m === "entera") { mitad1.push(+iid); mitad2.push(+iid); }
      else if (m === "izq") mitad1.push(+iid);
      else if (m === "der") mitad2.push(+iid);
    }
    if (!mitad1.length && !mitad2.length) return null;
    const esMitad = mitad2.some(i => !mitad1.includes(i)) || mitad1.some(i => !mitad2.includes(i));
    return { distribucion: esMitad ? "mitad" : "combinado", mitad1, mitad2 };
  }
  function renderPaso() {
    $$(".pz-step", modal).forEach(s => {
      const i = +s.dataset.step;
      s.classList.toggle("active", i === paso);
      s.classList.toggle("done", i < paso);
    });
    $("#pz-back", modal).disabled = paso === 0;
    if (paso === 3) {
      $("#pz-next", modal).innerHTML = `${icon("plus")}Agregar al pedido · ${money(precioUnit() * qty)}`;
    } else {
      $("#pz-next", modal).innerHTML = `Siguiente ${icon("arrowRight")}`;
    }
    if (paso === 0) {
      body.innerHTML = `
        <div class="pizza-sec">
          <div class="opt-label">Elige el tamaño</div>
          <div class="tam-grid">
            ${TAMANOS.map(t => {
              const pr = precios[t] != null ? +precios[t] : p.precio_base;
              return `<button class="tam-card ${sel.tamano === t ? "selected" : ""}" data-t="${t}">
                <span class="tam-name">${t[0].toUpperCase() + t.slice(1)}</span>
                <span class="tam-price">${money(pr)}</span>
              </button>`;
            }).join("")}
          </div>
        </div>`;
      $$("[data-t]", body).forEach(b => b.addEventListener("click", () => {
        sel.tamano = b.dataset.t;
        renderPaso();
      }));
    } else if (paso === 1) {
      body.innerHTML = grupos.length ? grupos.map(g => `
        <div class="opt-group">
          <div class="opt-label">${esc(g.nombre)}${g.seleccion_texto === "opcional_unica" ? " · opcional" : ""}</div>
          <div class="opt-chips">
            ${g.opciones.map(o => `
              <button class="chip ${sel.optsSel[g.id] === o.id ? "selected" : ""}" data-g="${g.id}" data-o="${o.id}">
                <span>${esc(o.nombre)}</span>
                ${o.recargo ? `<span class="rec">${o.recargo > 0 ? "+" : ""}${money(o.recargo)}</span>` : ""}
              </button>`).join("")}
          </div>
        </div>`).join("") : `<div class="pizza-empty">${icon("pizza", 44)}<div>No hay grupos de opciones en esta categoría.<br>Agrega "Orilla" desde el Catálogo si quieres cobrar extras.</div></div>`;
      $$("[data-g]", body).forEach(ch => ch.addEventListener("click", () => {
        sel.optsSel[+ch.dataset.g] = +ch.dataset.o;
        renderPaso();
      }));
    } else if (paso === 2) {
      const porTamano = Object.keys(precios).length > 0;
      body.innerHTML = `
        <div class="opt-label" style="margin-bottom:6px">Ingredientes — toca para cambiar</div>
        <div class="ing-list">
          ${ingredientes.length ? ingredientes.map(i => `
            <div class="ing-row">
              <span class="ing-name">${esc(i.nombre)}${i.recargo && !porTamano ? `<span class="rec">+${money(i.recargo)}</span>` : ""}</span>
              <div class="ing-modes">
                ${[["", "Sin"], ["entera", "Entera"], ["izq", "½ Izq"], ["der", "½ Der"]].map(([v, lbl]) => `
                  <button class="mode ${(sel.ingMode[i.id] || "") === v ? "selected" : ""}" data-i="${i.id}" data-v="${v}">${lbl}</button>`).join("")}
              </div>
            </div>`).join("") : `<div class="pizza-empty">${icon("egg", 44)}<div>Aún no hay ingredientes. Créalos desde Ingredientes (activa "Es topping de pizza").</div></div>`}
        </div>`;
      $$("[data-i]", body).forEach(b => b.addEventListener("click", () => {
        const iid = +b.dataset.i, v = b.dataset.v;
        if (v === "") delete sel.ingMode[iid]; else sel.ingMode[iid] = v;
        renderPaso();
      }));
    } else {
      const pers = personalizadaFinal();
      const persNombres = () => {
        const n = id => (state.ingredientes.find(x => x.id === id) || {}).nombre;
        if (!pers) return "Sin ingredientes extra";
        const todos = [...pers.mitad1, ...pers.mitad2];
        const uniq = [...new Set(todos)];
        if (pers.distribucion === "mitad") {
          const izq = [...new Set(pers.mitad1)].map(n).filter(Boolean).join(", ");
          const der = [...new Set(pers.mitad2)].map(n).filter(Boolean).join(", ");
          return izq === der ? "Entera: " + izq : `Izquierda: ${izq || "—"} · Derecha: ${der || "—"}`;
        }
        return uniq.map(n).filter(Boolean).join(", ");
      };
      body.innerHTML = `
        <div class="pizza-sec">
          <div class="resumen-row"><span>${icon("pizza")}Tamaño</span><strong>${sel.tamano[0].toUpperCase() + sel.tamano.slice(1)} · ${money(precioBase())}</strong></div>
          ${grupos.map(g => {
            const o = g.opciones.find(x => x.id == sel.optsSel[g.id]);
            return o ? `<div class="resumen-row"><span>${esc(g.nombre)}</span><strong>${esc(o.nombre)}${o.recargo ? ` · ${money(o.recargo)}` : ""}</strong></div>` : "";
          }).join("")}
          <div class="resumen-row"><span>${icon("egg")}Ingredientes</span><strong style="text-align:right">${esc(persNombres())}</strong></div>
          <div class="opt-group">
            <div class="opt-label">Cantidad</div>
            <div class="amt" style="margin-top:0">
              <button class="amt-btn" id="pz-minus">${icon("minus")}</button>
              <span class="qty" id="pz-qty">1</span>
              <button class="amt-btn" id="pz-plus">${icon("plus")}</button>
            </div>
          </div>
          <div class="opt-group">
            <div class="opt-label">Nota (opcional)</div>
            <input id="pz-nota" maxlength="120" placeholder="Ej: sin cebolla, cortada en 8…" style="width:100%;border:1.5px solid var(--gris-200);border-radius:10px;padding:9px 12px;font-size:13px">
          </div>
        </div>`;
      $("#pz-minus", modal).onclick = () => { qty = Math.max(1, qty - 1); $("#pz-qty", modal).textContent = qty; updateTotal(); };
      $("#pz-plus", modal).onclick = () => { qty++; $("#pz-qty", modal).textContent = qty; updateTotal(); };
      $("#pz-nota", modal).addEventListener("change", () => { nota = $("#pz-nota", modal).value.trim(); });
    }
    updateTotal();
  }

  $("#pz-close", modal).onclick = () => modal.remove();
  $("#pz-back", modal).onclick = () => { if (paso > 0) { paso--; renderPaso(); } };
  $("#pz-next", modal).onclick = () => {
    if (paso < 3) { paso++; renderPaso(); return; }
    state.carrito.push({
      producto: p, tamano: sel.tamano, opciones: { ...sel.optsSel }, extras: [],
      personalizada: personalizadaFinal() || undefined,
      cantidad: qty, nota,
    });
    modal.remove();
    renderCarrito();
    renderCategoriasGrid();
    toast(`${p.nombre} agregado al pedido`);
  };
  renderPaso();
}

function calcPrecio(p, opciones, extras, personalizada, tamano) {
  const precios = p.precios || {};
  const porTamano = Object.keys(precios).length > 0;
  let t = (tamano && precios[tamano] != null) ? +precios[tamano] : p.precio_base;
  for (const gid in opciones) {
    const g = state.opciones.find(x => x.id == gid);
    const o = g?.opciones.find(x => x.id == opciones[gid]);
    if (o) t += o.recargo;
  }
  if (personalizada) {
    const lista = [...(personalizada.mitad1 || []), ...(personalizada.mitad2 || [])];
    // En pizzas con precio por tamaño los ingredientes ya están incluidos.
    if (!porTamano && personalizada.distribucion === "combinado" && lista.length >= 2) t += (state.precioCombinado ?? 15);
  } else {
    extras.forEach(iid => {
      const i = state.ingredientes.find(x => x.id == iid);
      if (i) t += i.recargo;
    });
  }
  return Math.round(t * 100) / 100;
}
function descripcionItem(item) {
  const partes = [];
  const { opciones, producto } = item;
  if (item.tamano && producto.precios && producto.precios[item.tamano] != null) {
    partes.push(item.tamano[0].toUpperCase() + item.tamano.slice(1));
  }
  for (const gid in opciones) {
    const g = state.opciones.find(x => x.id == gid);
    const o = g?.opciones.find(x => x.id == opciones[gid]);
    if (o) partes.push(o.nombre);
  }
  if (item.personalizada) {
    const n = id => (state.ingredientes.find(x => x.id == id) || {}).nombre;
    if (item.personalizada.distribucion === "combinado") {
      const todos = [...(item.personalizada.mitad1 || []), ...(item.personalizada.mitad2 || [])].map(n).filter(Boolean);
      partes.push("Personalizada: Combinado (" + todos.join(", ") + ")");
    } else {
      const m1 = (item.personalizada.mitad1 || []).map(n).filter(Boolean).join(", ");
      const m2 = (item.personalizada.mitad2 || []).map(n).filter(Boolean).join(", ");
      partes.push(`Personalizada: Mitad y mitad — Mitad 1 (${m1}) · Mitad 2 (${m2})`);
    }
  } else if (item.extras && item.extras.length) {
    const docs = item.extras.map(iid => (state.ingredientes.find(x => x.id == iid) || {}).nombre).filter(Boolean).join(", ");
    partes.push("+ " + docs);
  }
  return partes.join(" · ");
}

/* ---------- CARRITO ---------- */
function renderCarritoHTML() {
  const cart = state.carrito;
  return `
    <div class="view-title" style="font-size:18px;display:flex;align-items:center;gap:8px">${icon("cart")}Pedido actual</div>
    ${cart.length === 0 ? `
      <div class="cart-empty">
        ${icon("cart", 52)}
        <div>Selecciona productos del menú</div>
      </div>` : `
      <div class="cart">
        ${cart.map((it, idx) => `
          <div class="cart-item" data-idx="${idx}">
            <div class="row1">
              <span class="name">${esc(it.producto.nombre)}</span>
              <span class="subtotal">${money(precioItem(it))}</span>
            </div>
            <div class="config-txt">${esc(descripcionItem(it))}</div>
            <input class="nota-item" data-nota="${idx}" value="${esc(it.nota || "")}" placeholder="Nota del producto (ej: sin cebolla)" maxlength="120" style="width:100%;margin-top:6px;border:1.5px dashed var(--gris-300);border-radius:8px;padding:7px 10px;font-size:12.5px">
            <div class="amt">
              <button class="amt-btn" data-dec="${idx}">${icon("minus")}</button>
              <span class="qty">${it.cantidad}</span>
              <button class="amt-btn" data-inc="${idx}">${icon("plus")}</button>
              <button class="btn btn-sm btn-danger-outline" data-del="${idx}" style="margin-left:auto">${icon("trash")}</button>
            </div>
          </div>`).join("")}
      </div>
      <div class="cart-footer">
        <div class="cart-total"><span class="lbl">Total</span><span class="val" id="cart-total">${money(totalCarrito())}</span></div>
      </div>`}
    <div class="mod-foot">
      <button class="btn btn-green btn-block btn-lg" id="btn-confirmar" ${cart.length ? "" : "disabled"}>${icon("check")}Confirmar comanda</button>
    </div>`;
}
function renderCarrito() {
  const v = $("#view-pedir");
  if (!v) return;
  const right = $(".pedir-right", v);
  if (right) { right.outerHTML = `<div class="pedir-right card">${renderCarritoHTML()}</div>`; }
  bindCart();
}
function precioItem(it) {
  return calcPrecio(it.producto, it.opciones, it.extras, it.personalizada || null, it.tamano) * it.cantidad;
}
function totalCarrito() {
  return Math.round(state.carrito.reduce((s, it) => s + precioItem(it), 0) * 100) / 100;
}
function bindCart() {
  $$("[data-inc]").forEach(b => b.onclick = () => { state.carrito[+b.dataset.inc].cantidad++; renderCarrito(); });
  $$("[data-dec]").forEach(b => b.onclick = () => {
    const it = state.carrito[+b.dataset.dec];
    it.cantidad--;
    if (it.cantidad <= 0) state.carrito.splice(+b.dataset.dec, 1);
    renderCarrito();
  });
  $$("[data-del]").forEach(b => b.onclick = () => { state.carrito.splice(+b.dataset.del, 1); renderCarrito(); });
  $$("[data-nota]").forEach(inp => inp.addEventListener("change", () => {
    const it = state.carrito[+inp.dataset.nota];
    if (it) it.nota = inp.value.trim();
  }));
  const btn = $("#btn-confirmar");
  if (btn) btn.onclick = abrirModalConfirmar;
}

/* ---------- MODAL CONFIRMAR PEDIDO ---------- */
function abrirModalConfirmar() {
  if (!state.carrito.length) return;
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.innerHTML = `
    <div class="modal">
      <div class="modal-head">
        ${icon("check")}
        <h3>Confirmar comanda</h3>
        <button class="modal-close" id="mc-close">${icon("close")}</button>
      </div>
      <div class="field">
        <label>Tipo</label>
        <div class="seg-row">
          ${["salon", "llevar", "domicilio"].map(t => `
            <button class="seg ${state.pedido.tipo === t ? "selected" : ""}" data-t="${t}">
              ${icon(t === "salon" ? "store" : t === "llevar" ? "home" : "home")}${t === "salon" ? "En salón" : t === "llevar" ? "Para llevar" : "A domicilio"}
            </button>`).join("")}
        </div>
      </div>
      <div id="campos-dinamicos">
        <div class="field"><label>Nombre del cliente</label>
          <input id="mc-nombre" placeholder="${state.pedido.cliente_nombre ? "" : "O escríbelo aquí…"}" value="${esc(state.pedido.cliente_nombre)}">
        </div>
      </div>
      <div class="field"><label>Método de pago</label>
        <div class="seg-row">
          ${[["efectivo", "Efectivo", "cash"], ["tarjeta", "Tarjeta", "card"], ["transferencia", "Transferencia", "transfer"]].map(m => `
            <button class="seg ${state.pedido.metodo_pago === m[0] ? "selected" : ""}" data-mp="${m[0]}">${icon(m[2])}${m[1]}</button>`).join("")}
        </div>
      </div>
      <div class="field"><label>Nota (opcional)</label>
        <textarea id="mc-nota" rows="2" placeholder="Ej: sin cebolla, bien cocida…"></textarea>
      </div>
      <div class="cart-total"><span class="lbl">Total a pagar</span><span class="val" style="color:var(--rojo)">${money(totalCarrito())}</span></div>
      <div class="modal-foot">
        <button class="btn ghost" id="mc-cancel">Cancelar</button>
        <button class="btn btn-primary btn-lg" id="mc-confirm">${icon("check")}Registrar pedido</button>
      </div>
    </div>`;
  $("#modal-root").appendChild(modal);

  function renderCampos() {
    const cont = $("#campos-dinamicos", modal);
    if (state.pedido.tipo === "salon") {
      cont.innerHTML = `<div class="field"><label>Nombre del cliente</label><input id="mc-nombre" value="${esc(state.pedido.cliente_nombre)}" placeholder="Cliente"></div>
        <div class="field"><label>Mesa</label><input id="mc-mesa" value="${esc(state.pedido.mesa)}" placeholder="Ej: 5"></div>`;
    } else if (state.pedido.tipo === "domicilio") {
      cont.innerHTML = `<div class="field"><label>Nombre del cliente</label><input id="mc-nombre" value="${esc(state.pedido.cliente_nombre)}" placeholder="Cliente"></div>
        <div class="field"><label>Dirección</label><input id="mc-dir" value="${esc(state.pedido.direccion)}" placeholder="Calle, número, colonia"></div>
        <div class="field"><label>Teléfono</label><input id="mc-tel" value="${esc(state.pedido.telefono)}" placeholder="612 ••• ••••"></div>`;
    } else {
      cont.innerHTML = `<div class="field"><label>Nombre del cliente</label><input id="mc-nombre" value="${esc(state.pedido.cliente_nombre)}" placeholder="Cliente"></div>`;
    }
  }
  renderCampos();
  $$(".seg[data-t]", modal).forEach(b => b.onclick = () => {
    state.pedido.tipo = b.dataset.t;
    $$(".seg[data-t]", modal).forEach(x => x.classList.toggle("selected", x === b));
    renderCampos();
  });
  $$(".seg[data-mp]", modal).forEach(b => b.onclick = () => {
    state.pedido.metodo_pago = b.dataset.mp;
    $$(".seg[data-mp]", modal).forEach(x => x.classList.toggle("selected", x === b));
  });

  $("#mc-close", modal).onclick = () => modal.remove();
  $("#mc-cancel", modal).onclick = () => modal.remove();
  $("#mc-confirm", modal).onclick = async () => {
    const payload = { ...state.pedido, items: state.carrito.map(it => ({
      producto_id: it.producto.id, cantidad: it.cantidad,
      ...(it.tamano ? { tamano: it.tamano } : {}),
      opciones: Object.fromEntries(Object.entries(it.opciones).map(([k, v]) => [k, v])),
      ingredientes_extra: it.extras,
      ...(it.personalizada ? { personalizada: it.personalizada } : {}),
      ...((it.nota || "").trim() ? { nota: it.nota.trim() } : {}),
    })) };
    const leer = id => ($("#" + id, modal)?.value || "").trim();
    if (state.pedido.tipo === "salon") { payload.mesa = leer("mc-mesa"); payload.cliente_nombre = leer("mc-nombre") || "Mesa " + (payload.mesa || "—"); }
    if (state.pedido.tipo === "domicilio") { payload.direccion = leer("mc-dir"); payload.telefono = leer("mc-tel"); payload.cliente_nombre = leer("mc-nombre") || "Domicilio"; }
    if (state.pedido.tipo === "llevar") { payload.cliente_nombre = leer("mc-nombre") || "Para llevar"; }
    payload.nota = leer("mc-nota");
    const confirmar = async r => {
      toast(`Comanda ${r.folio} registrada`);
      beep(660, 0.12); beep(880, 0.15, 0.15);
      state.carrito = [];
      state.pedido = { tipo: "salon", metodo_pago: "efectivo", cliente_nombre: "", mesa: "", direccion: "", telefono: "", nota: "" };
      modal.remove();
      setTab("cocina");
      updateBadge();
    };
    if (!state.online) {
      // Sin red: se encola y se mostrará localmente como pendiente.
      const cola = leerCola().filter(c => c.tipo === "pedido");
      const folio = "PEN-" + String(cola.length + 1).padStart(3, "0");
      const tempId = "temp-" + Date.now();
      encolarAccion({ tipo: "pedido", tempId, folio, payload, callback: confirmar });
      // El card local aparecerá tras el próximo flush; por ahora avisamos.
      toast(`Sin conexión: pedido ${folio} guardado para enviar`, "warn");
      modal.remove();
      setTab("cocina");
      return;
    }
    try {
      const r = await api("/pedidos", "POST", payload);
      confirmar(r);
    } catch (e) {
      toast("Error: " + e.message, "error");
    }
  };
}

/* ============ VISTA: COCINA (loop de contadores) ============ */
let cocinaData = [];
function startKitchenLoop() {
  renderCocina();
  if (state.kitchenTimer) clearInterval(state.kitchenTimer);
  // LOOP de polling: cada 3s trae pedidos activos + LOOP 1s para contadores
  state.kitchenTimer = setInterval(async () => {
    await loadCocina();
    renderCocina();
    updateBadge();
  }, 3000);
  loadCocina().then(() => { renderCocina(); updateBadge(); });
}
async function loadCocina() {
  try {
    const lista = await api("/pedidos?activos=true");
    // LOOP de edad (local): si el servidor no devuelve edad exacta la calculamos
    cocinaData = lista.map(p => ({ ...p, edad_local: p.edad_seg ?? 0 }));
    updateBadge();
  } catch (e) {}
}
function renderCocina() {
  const v = $("#view-cocina");
  const counts = { recibido: 0, preparacion: 0, entregado: 0 };
  cocinaData.forEach(p => { if (counts[p.estado] !== undefined) counts[p.estado]++; });
  const orden = { recibido: 0, preparacion: 1, entregado: 2 };
  const items = [...cocinaData].sort((a, b) => orden[a.estado] - orden[b.estado] || b.id - a.id);
  v.innerHTML = `
    <div class="view-header">
      <div>
        <div class="view-title">Cocina</div>
        <div class="view-sub">${items.filter(p => p.estado !== "entregado" && p.estado !== "cancelado").length} comandas activas · umbral ${state.umbralMin} min</div>
      </div>
    </div>
    ${items.length === 0 ? `
      <div class="kitchen-empty card">
        ${icon("fire", 70)}
        <div style="font-size:17px;font-weight:700">No hay comandas activas</div>
        <div style="margin-top:4px;color:var(--gris-400)">Los pedidos nuevos aparecen aquí con su contador</div>
      </div>` : `
      <div class="kitchen-grid">
        ${items.map(p => tarjetaComanda(p)).join("")}
      </div>`}`;
  bindTarjetas();
}
function tarjetaComanda(p) {
  const edad = p.edad_local;
  const clase = edad > state.umbralMin * 60 ? "crit" : edad > state.umbralWarn * 60 ? "warn" : "ok";
  const tipoTxt = { salon: "En salón", llevar: "Para llevar", domicilio: "A domicilio" }[p.tipo] || p.tipo;
  return `
    <div class="order-card ${clase} ${p.estado === "entregado" ? "entregado" : ""}" data-id="${p.id}">
      <div class="order-head">
        <div>
          <div class="order-folio">${esc(p.folio)}</div>
          <div class="order-meta">
            ${p.mesa ? `<span class="table-chip">${icon("store")}Mesa ${esc(p.mesa)}</span>` : ""}
            ${esc(tipoTxt)} · ${esc(p.cliente_nombre)}${p.direccion ? " · " + icon("home") + esc(p.direccion) : ""}
          </div>
          ${p.nota ? `<div class="order-meta" style="color:var(--rojo)">${icon("edit")} ${esc(p.nota)}</div>` : ""}
        </div>
        <div class="timer-wrap">
          <div class="timer" data-timer="${p.id}" data-base="${Math.floor(Date.now() / 1000) - edad}">--</div>
          <div><span class="status-pill ${p.estado}">${estadoTxt(p.estado)}</span></div>
        </div>
      </div>
      <div class="order-items">
        ${p.items.map(it => `
          <div class="order-item">
            <div class="ln1">
              <span style="color:var(--rojo);font-weight:900">${it.cantidad}×</span>
              <span>${esc(it.producto_nombre)}</span>
              <span style="margin-left:auto;font-weight:800">${money(it.subtotal)}</span>
            </div>
            ${it.configuracion ? `<div class="cfg">${esc(it.configuracion)}</div>` : ""}
          </div>`).join("")}
      </div>
      <div class="order-actions">
        ${accionesEstado(p)}
      </div>
    </div>`;
}
function estadoTxt(e) {
  const m = { recibido: "Recibido", preparacion: "En preparación", entregado: "Entregado", cancelado: "Cancelado" };
  return m[e] || e;
}
function accionesEstado(p) {
  const ids = {
    recibido: [["preparacion", "Iniciar", "btn-blue"], ["cancelado", "Cancelar", "btn-ghost"]],
    preparacion: [["entregado", "Entregar", "btn-green"], ["cancelado", "Cancelar", "btn-ghost"]],
    entregado: [],
    cancelado: [],
  }[p.estado] || [];
  return ids.map(([nuevo, txt, cls]) => `
    <button class="btn ${cls} btn-sm" data-est="${p.id}" data-nuevo="${nuevo}">${icon(nuevo === "cancelado" ? "trash" : nuevo === "entregado" ? "cash" : "check")}${txt}</button>`).join("");
}
function bindTarjetas() {
  $$("[data-est]").forEach(b => b.onclick = async () => {
    const pid = b.dataset.est, nuevo = b.dataset.nuevo;
    if (!state.online) {
      if (nuevo === "cancelado") {
        const motivo = prompt("Motivo de cancelación (opcional):") ?? "";
        encolarAccion({ tipo: "cancelar", ref: pid, motivo });
      } else {
        encolarAccion({ tipo: "estado", ref: pid, nuevo });
        if (nuevo === "entregado") beep(990, 0.18);
      }
      await loadCocina(); renderCocina(); updateBadge();
      toast("Sin conexión: cambio guardado para enviar", "warn");
      return;
    }
    try {
      if (nuevo === "cancelado") {
        const motivo = prompt("Motivo de cancelación (opcional):") ?? "";
        await api(`/pedidos/${pid}/cancelar?motivo=${encodeURIComponent(motivo)}`, "POST", {});
      } else {
        await api(`/pedidos/${pid}/estado?estado=${nuevo}`, "POST", {});
        if (nuevo === "entregado") { beep(990, 0.18); }
      }
      await loadCocina(); renderCocina(); updateBadge();
    } catch (e) { toast("Error: " + e.message, "error"); }
  });
}

// LOOP principal de contadores: cada 1s actualiza los timer en pantalla (solo cocina visible)
setInterval(() => {
  if (state.tab !== "cocina") return;
  recipeTimerLoop();
}, 1000);
const alertados = new Set();
function recipeTimerLoop() {
  const now = Math.floor(Date.now() / 1000);
  $$("[data-timer]").forEach(el => {
    const pid = +el.dataset.timer;
    const base = +el.dataset.base;
    const edad = now - base;
    el.textContent = fmtTime(edad);
    const card = el.closest(".order-card");
    const ped = cocinaData.find(x => x.id === pid);
    if (!ped) return;
    const clase = edad > state.umbralMin * 60 ? "crit" : edad > state.umbralWarn * 60 ? "warn" : "ok";
    card.classList.remove("ok", "warn", "crit");
    card.classList.add(clase);
    if (clase === "crit" && ped.estado !== "entregado" && ped.estado !== "cancelado") {
      if (!alertados.has(pid)) {
        alertados.add(pid);
        alertaCritica();
        toast(`${icon("warning")}Comanda ${ped.folio} lleva más de ${state.umbralMin} min`, "warn");
      }
    } else {
      alertados.delete(pid);
    }
  });
}

document.addEventListener("click", e => {
  const del = e.target.closest(".client-del");
  if (del) {
    const id = del.dataset.id;
    if (confirm("¿Eliminar este cliente?")) {
      // TODO: borrar cliente (no hay lógica dedicada aún; se marca inactivo)
      toast("Funcionalidad de borrado: próximamente", "warn");
    }
  }
});

/* ============ BADGE COCINA ============ */
function updateBadge() {
  const activos = cocinaData.filter(p => !["entregado", "cancelado"].includes(p.estado)).length;
  const b = $("#badge-cocina");
  if (b) {
    b.textContent = activos;
    b.classList.toggle("hidden", activos === 0);
  }
}

/* ============ VISTA: HISTORIAL ============ */
async function loadHistorial() {
  try {
    const pedidos = await api("/pedidos?activos=false");
    const v = $("#view-historial");
    const filtro = ($("#filtro-hist")?.value) || "todos";
    const fechas = {};
    const lista = pedidos.filter(p => {
      if (filtro === "hoy") return p.creado_en.slice(0, 10) === new Date().toISOString().slice(0, 10);
      return true;
    });
    lista.forEach(p => { fechas[p.creado_en.slice(0, 10)] = (fechas[p.creado_en.slice(0, 10)] || 0) + 1; });
    v.innerHTML = `
      <div class="view-header">
        <div><div class="view-title">Historial</div><div class="view-sub">Todas las comandas registradas</div></div>
        <select id="filtro-hist" class="status-select">
          <option value="todos">Todas</option>
          <option value="hoy">Hoy</option>
        </select>
      </div>
      <div class="table-wrap">
        <table class="data">
          <thead><tr><th>Folio</th><th>Cliente</th><th>Tipo</th><th>Fecha</th><th>Estado</th><th>Total</th></tr></thead>
          <tbody>
            ${lista.map(p => `
              <tr data-id="${p.id}" class="row-pedido">
                <td style="font-weight:800">${esc(p.folio)}</td>
                <td>${esc(p.cliente_nombre)}</td>
                <td>${esc(p.tipo)}${p.mesa ? " · Mesa " + esc(p.mesa) : ""}</td>
                <td>${esc(p.creado_en)}</td>
                <td><span class="status-pill ${p.estado}">${estadoTxt(p.estado)}</span></td>
                <td class="money">${money(p.total)}</td>
              </tr>`).join("") || `<tr><td colspan="6" style="text-align:center;color:var(--gris-400)">Sin resultados</td></tr>`}
          </tbody>
        </table>
      </div>`;
    $$(".row-pedido", v).forEach(r => r.addEventListener("click", () => verDetallePedido(+r.dataset.id)));
    $("#filtro-hist").addEventListener("change", loadHistorial);
  } catch (e) { toast("Error: " + e.message, "error"); }
}
async function verDetallePedido(id) {
  try {
    const p = await api("/pedidos/" + id);
    const modal = document.createElement("div");
    modal.className = "modal-backdrop";
    modal.innerHTML = `
      <div class="modal">
        <div class="modal-head"><h3>Comanda ${esc(p.folio)}</h3><button class="modal-close" id="det-close">${icon("close")}</button></div>
        <div class="field"><div><strong>Cliente:</strong> ${esc(p.cliente_nombre)}</div>
          <div style="color:var(--gris-500);font-size:13px">${estadoTxt(p.estado)} · ${esc(p.tipo)}${p.mesa ? " · Mesa " + esc(p.mesa) : ""}</div>
          <div style="color:var(--gris-500);font-size:13px">${esc(p.creado_en)}</div>${p.nota ? `<div style="color:var(--rojo);font-size:13px">Nota: ${esc(p.nota)}</div>` : ""}</div>
        ${p.items.map(it => `
          <div class="cart-item" style="margin-bottom:6px">
            <div class="row1"><span class="name">${it.cantidad}× ${esc(it.producto_nombre)}</span><span class="subtotal">${money(it.subtotal)}</span></div>
            <div class="config-txt">${esc(it.configuracion)}</div>
          </div>`).join("")}
        <div class="cart-total" style="margin-top:8px"><span class="lbl">Total</span><span class="val">${money(p.total)}</span></div>
        ${p.estado === "entregado" ? `<div style="margin-top:8px"><span class="status-pill entregado">Entregado · ${esc(p.metodo_pago)}</span></div>` : ""}
      </div>`;
    $("#modal-root").appendChild(modal);
    $("#det-close", modal).onclick = () => modal.remove();
  } catch (e) { toast("Error: " + e.message, "error"); }
}

/* ============ VISTA: CATÁLOGO ============ */
async function loadMenu() {
  try {
    const catalogo = await api("/menu/catalogo");
    state.categorias = catalogo.map(c => c.categoria).filter(c => c.activa !== 0);
    state.menu = catalogo
      .map(c => ({ ...c, productos: (c.productos || []).filter(p => p.activo !== 0) }))
      .filter(c => c.categoria.activa !== 0);
    renderCategoriasGrid();
    const v = $("#view-menu");
    v.innerHTML = `
      <div class="view-header">
        <div><div class="view-title">Catálogo y precios</div><div class="view-sub">Edita productos, opciones y precios — se reflejan al instante</div></div>
        <div style="display:flex;gap:10px">
          <button class="btn btn-ghost" id="btn-nueva-cat">${icon("plus")}Nueva categoría</button>
          <button class="btn btn-primary" id="btn-nuevo-prod">${icon("plus")}Nuevo producto</button>
        </div>
      </div>
      ${catalogo.length === 0 ? `
        <div class="card kitchen-empty">${icon("menu", 56)}<div style="font-size:16px;font-weight:700">Aún no tienes categorías</div>
        <div style="margin-top:4px;color:var(--gris-400)">Crea tu primera categoría para empezar a armar tu menú</div></div>` : catalogo.map(c => `
        <div class="card ${c.categoria.activa === 0 ? "cat-oculta" : ""}" style="margin-bottom:16px" data-catcard="${c.categoria.id}">
          <div class="modal-head">
            <h3>${esc(c.categoria.nombre)} (${c.productos.length})${c.categoria.activa === 0 ? ` <span class="status-pill cancelado" style="background:#fde8e8;color:var(--rojo);font-size:11px">Oculta</span>` : ""}</h3>
            <div style="display:flex;gap:6px">
              <button class="btn btn-sm btn-ghost" data-editcat="${c.categoria.id}">${icon("edit")}Editar</button>
              ${c.categoria.activa === 0
                ? `<button class="btn btn-sm" data-actcat="${c.categoria.id}">Reactivar</button>`
                : `<button class="btn btn-sm btn-danger-outline" data-hidecat="${c.categoria.id}">${icon("eyeOff")}Ocultar</button>`}
            </div>
          </div>
          <div class="table-wrap">
            <table class="data">
              <thead><tr><th>Producto</th><th>Precio base</th><th>Ingredientes base</th><th></th></tr></thead>
              <tbody>${c.productos.map(p => `
                <tr class="${p.activo === 0 ? "inactivo" : ""}">
                  <td style="font-weight:700">${esc(p.nombre)}${p.personalizable === 1 ? ` <span class="status-pill" style="background:#fff3cd;color:#8a6d1a;font-size:11px">Pizza personalizable</span>` : ""}${p.activo === 0 ? ` <span class="status-pill cancelado" style="background:#fde8e8;color:var(--rojo);font-size:11px">Oculto</span>` : ""}</td>
                  <td><input class="precio-input" data-id="${p.id}" value="${p.precio_base}" style="width:110px;border:1.5px solid var(--gris-200);border-radius:8px;padding:8px 10px;font-weight:800">${(p.precios && Object.keys(p.precios).length) ? `<div style="font-size:11.5px;color:var(--gris-500);margin-top:4px">${Object.entries(p.precios).map(([t, v]) => `${t[0].toUpperCase() + t.slice(1)} ${money(v)}`).join(" · ")}</div>` : ""}</td>
                  <td style="color:var(--gris-500);font-size:12.5px">${esc(p.descripcion)}</td>
                  <td style="white-space:nowrap">
                    <button class="btn btn-sm btn-ghost" data-editprod="${p.id}">${icon("edit")}</button>
                    ${p.activo === 0
                      ? `<button class="btn btn-sm" data-actprod="${p.id}">Reactivar</button>`
                      : `<button class="btn btn-sm btn-danger-outline" data-hideprod="${p.id}">${icon("eyeOff")}Ocultar</button>`}
                  </td>
                </tr>`).join("")}</tbody>
            </table>
          </div>
          <div style="margin-top:14px;display:flex;align-items:center;gap:10px;flex-wrap:wrap">
            <span class="opt-label" style="margin:0">Grupos de opciones</span>
            <button class="btn btn-sm btn-ghost" data-nuevogrupo="${c.categoria.id}">${icon("plus")}Agregar grupo</button>
            ${!c.opciones.length ? `<button class="btn btn-sm" data-plantilla="${c.categoria.id}">${icon("wand")}Crear plantilla Tamaño + Orilla</button>` : ""}
          </div>
          ${c.opciones.map(g => `
            <div style="margin-top:10px" class="grupo-opciones">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
                <span class="opt-label" style="margin:0">${esc(g.nombre)}</span>
                <button class="btn btn-sm btn-ghost" data-borragrupo="${g.id}">${icon("trash")}</button>
              </div>
              <div class="opt-chips" style="flex-wrap:wrap">
                ${g.opciones.map(o => `
                  <div class="chip" style="cursor:default">
                    <span>${esc(o.nombre)}</span>
                    <input type="number" step="0.5" value="${o.recargo}" class="opcion-rec" data-g="${g.id}" data-o="${o.id}" style="width:74px;border:1.5px solid var(--gris-200);border-radius:8px;padding:6px 8px;font-weight:700;text-align:right">
                    <button class="btn btn-sm btn-ghost" data-borraop="${o.id}" title="Quitar">${icon("x")}</button>
                  </div>`).join("")}
                <div class="chip" style="cursor:default;background:var(--gris-100)">
                  <input data-nuevaop="${g.id}" placeholder="Nueva opción" style="width:110px;border:0;background:transparent;outline:none;font-weight:700">
                  <button class="btn btn-sm btn-ghost" data-agregaop="${g.id}">${icon("plus")}</button>
                </div>
              </div>
            </div>`).join("")}
          ${state.usaAvanzado && c.productos.some(p => p.personalizable === 1) ? `
            <div style="margin-top:14px;display:flex;align-items:center;gap:10px">
              <span class="opt-label" style="margin:0">Recargo combinado $</span>
              <input type="number" step="0.5" value="${state.precioCombinado ?? 15}" data-recargocomb style="width:90px;border:1.5px solid var(--gris-200);border-radius:8px;padding:6px 8px;font-weight:700;text-align:right">
              <span style="color:var(--gris-500);font-size:12px">Se suma cuando una pizza personalizable es "Combinado" con 2+ ingredientes</span>
            </div>` : ""}
        </div>`).join("")}`;
    $$(".precio-input", v).forEach(inp => inp.addEventListener("change", async () => {
      const v2 = parseFloat(inp.value);
      if (isNaN(v2)) return;
      await api("/menu/productos/" + inp.dataset.id, "PUT", { precio_base: v2 });
      toast("Precio actualizado", "ok");
    }));
    $$(".opcion-rec", v).forEach(inp => inp.addEventListener("change", async () => {
      const rec = parseFloat(inp.value) || 0;
      await api("/menu/opciones/" + inp.dataset.o + "/recargo", "PUT", { recargo: rec }).catch(() => toast("Opción no disponible en API", "warn"));
    }));
    $$("[data-recargocomb]", v).forEach(inp => inp.addEventListener("change", async () => {
      const val = parseFloat(inp.value) || 0;
      await api("/menu/config/precio_combinado", "PUT", { valor: String(val) });
      state.precioCombinado = val;
      toast("Recargo combinado actualizado", "ok");
    }));
    $$("[data-editprod]", v).forEach(b => b.addEventListener("click", () => {
      const pid = +b.dataset.editprod;
      const p = catalogo.flatMap(c => c.productos).find(x => x.id === pid);
      if (p) modalEditarProducto(p);
    }));
    $$("[data-hideprod]", v).forEach(b => b.addEventListener("click", async () => {
      const pid = +b.dataset.hideprod;
      if (!confirm("¿Ocultar este producto del menú? Podrás reactivarlo desde aquí.")) return;
      await api("/menu/productos/" + pid, "PUT", { activo: 0 });
      toast("Producto ocultado", "ok");
      loadMenu();
    }));
    $$("[data-actprod]", v).forEach(b => b.addEventListener("click", async () => {
      const pid = +b.dataset.actprod;
      await api("/menu/productos/" + pid, "PUT", { activo: 1 });
      toast("Producto reactivado", "ok");
      loadMenu();
    }));
    $$("[data-editcat]", v).forEach(b => b.addEventListener("click", () => {
      const c = catalogo.find(x => x.categoria.id === +b.dataset.editcat);
      if (c) modalFormCategoria(c.categoria);
    }));
    $$("[data-hidecat]", v).forEach(b => b.addEventListener("click", async () => {
      const c = catalogo.find(x => x.categoria.id === +b.dataset.hidecat);
      const tot = c.productos.length;
      if (!confirm(`¿Ocultar la categoría "${c.categoria.nombre}"?${tot ? ` También se ocultarán sus ${tot} producto(s) del menú de pedir.` : ""} Puedes reactivarla cuando quieras.`)) return;
      await api("/menu/categorias/" + c.categoria.id, "PUT", { activa: 0 });
      toast("Categoría ocultada", "ok");
      loadMenu();
    }));
    $$("[data-actcat]", v).forEach(b => b.addEventListener("click", async () => {
      await api("/menu/categorias/" + b.dataset.actcat, "PUT", { activa: 1 });
      toast("Categoría reactivada", "ok");
      loadMenu();
    }));
    $$("[data-nuevogrupo]", v).forEach(b => b.addEventListener("click", () => {
      modalNuevoGrupo(+b.dataset.nuevogrupo);
    }));
    $$("[data-plantilla]", v).forEach(b => b.addEventListener("click", async () => {
      const cid = +b.dataset.plantilla;
      if (!confirm("¿Crear la plantilla 'Tamaño' y 'Orilla' con opciones de recargo que puedes editar? Se usará en el configurador de pizzas.")) return;
      try {
        const gT = (await api("/menu/grupos", "POST", { nombre: "Tamaño", categoria_id: cid, seleccion_texto: "elegir_una", orden: 0 })).id;
        const gO = (await api("/menu/grupos", "POST", { nombre: "Orilla", categoria_id: cid, seleccion_texto: "elegir_una", orden: 1 })).id;
        await Promise.all([
          api("/menu/opciones", "POST", { grupo_id: gT, nombre: "Chica", recargo: -5, orden: 0 }),
          api("/menu/opciones", "POST", { grupo_id: gT, nombre: "Mediana", recargo: 0, orden: 1 }),
          api("/menu/opciones", "POST", { grupo_id: gT, nombre: "Grande", recargo: 25, orden: 2 }),
          api("/menu/opciones", "POST", { grupo_id: gO, nombre: "Normal", recargo: 0, orden: 0 }),
          api("/menu/opciones", "POST", { grupo_id: gO, nombre: "Queso", recargo: 15, orden: 1 }),
          api("/menu/opciones", "POST", { grupo_id: gO, nombre: "Philadelphia", recargo: 20, orden: 2 }),
        ]);
        toast("Plantilla creada", "ok");
        loadMenu();
      } catch (e) { toast("Error: " + e.message, "error"); }
    }));
    $$("[data-borragrupo]", v).forEach(b => b.addEventListener("click", async () => {
      if (!confirm("¿Borrar este grupo y todas sus opciones?")) return;
      await api("/menu/grupos/" + b.dataset.borragrupo, "DELETE");
      toast("Grupo borrado", "ok");
      loadMenu();
    }));
    $$("[data-borraop]", v).forEach(b => b.addEventListener("click", async () => {
      if (!confirm("¿Quitar esta opción?")) return;
      await api("/menu/opciones/" + b.dataset.borraop, "DELETE");
      toast("Opción quitada", "ok");
      loadMenu();
    }));
    $$("[data-agregaop]", v).forEach(b => b.addEventListener("click", async () => {
      const gid = +b.dataset.agregaop;
      const inp = v.querySelector(`[data-nuevaop="${gid}"]`);
      const nombre = (inp?.value || "").trim();
      if (!nombre) return toast("Escribe el nombre de la opción", "warn");
      await api("/menu/opciones", "POST", { grupo_id: gid, nombre, recargo: 0, orden: 99 });
      toast("Opción agregada", "ok");
      loadMenu();
    }));
    $("#btn-nueva-cat").onclick = () => modalFormCategoria();
    $("#btn-nuevo-prod").onclick = modalNuevoProducto;
  } catch (e) { toast("Error: " + e.message, "error"); }
}

function modalFormCategoria(cat) {
  const esEdicion = !!cat;
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.innerHTML = `
    <div class="modal">
      <div class="modal-head"><h3>${esEdicion ? "Editar categoría" : "Nueva categoría"}</h3><button class="modal-close" id="nc2-close">${icon("close")}</button></div>
      <div class="field"><label>Nombre</label><input id="nc2-nombre" value="${esEdicion ? esc(cat.nombre) : ""}" placeholder="Ej: Hamburguesas"></div>
      <div class="field"><label>Ícono</label><div id="nc2-icons" class="prod-icon-grid"></div></div>
      <div class="modal-foot">
        <button class="btn ghost" id="nc2-cancel">Cancelar</button>
        <button class="btn btn-primary" id="nc2-save">${esEdicion ? "Guardar" : `${icon("check")}Crear`}</button>
      </div>
    </div>`;
  $("#modal-root").appendChild(modal);
  let icono = esEdicion ? cat.icono : "burger";
  renderIconPicker("nc2-icons", modal, n => { icono = n; }, esEdicion ? cat.icono : undefined);
  $("#nc2-close", modal).onclick = $("#nc2-cancel", modal).onclick = () => modal.remove();
  $("#nc2-save", modal).onclick = async () => {
    const nombre = $("#nc2-nombre", modal).value.trim();
    if (!nombre) return toast("Escribe el nombre de la categoría", "warn");
    try {
      if (esEdicion) {
        await api("/menu/categorias/" + cat.id, "PUT", { nombre, icono });
        toast(`Categoría "${nombre}" actualizada`);
      } else {
        const orden = (state.menu.length + 1);
        await api("/menu/categorias", "POST", { nombre, icono, orden });
        toast(`Categoría "${nombre}" creada`);
      }
      modal.remove();
      loadMenu();
    } catch (e) { toast("Error: " + e.message, "error"); }
  };
}

function modalNuevoGrupo(categoriaId) {
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.innerHTML = `
    <div class="modal">
      <div class="modal-head"><h3>Nuevo grupo de opciones</h3><button class="modal-close" id="ng-close">${icon("close")}</button></div>
      <div class="field"><label>Nombre</label><input id="ng-nombre" placeholder="Ej: Tamaño, Orilla, Masa"></div>
      <div class="field"><label>Tipo de selección</label>
        <select id="ng-tipo">
          <option value="elegir_una">Elegir una (obligatoria)</option>
          <option value="opcional_unica">Opcional (puede no elegirse)</option>
        </select>
      </div>
      <div class="modal-foot">
        <button class="btn ghost" id="ng-cancel">Cancelar</button>
        <button class="btn btn-primary" id="ng-save">${icon("check")}Crear</button>
      </div>
    </div>`;
  $("#modal-root").appendChild(modal);
  $("#ng-close", modal).onclick = $("#ng-cancel", modal).onclick = () => modal.remove();
  $("#ng-save", modal).onclick = async () => {
    const nombre = $("#ng-nombre", modal).value.trim();
    if (!nombre) return toast("Escribe el nombre del grupo", "warn");
    try {
      await api("/menu/grupos", "POST", { nombre, categoria_id: categoriaId, seleccion_texto: $("#ng-tipo", modal).value, orden: 99 });
      toast("Grupo creado", "ok");
      modal.remove();
      loadMenu();
    } catch (e) { toast("Error: " + e.message, "error"); }
  };
}

function modalEditarProducto(p) {
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  const precios = p.precios || {};
  const TAMANOS = ["individual", "chica", "mediana", "grande"];
  const esPizza = /pizza/i.test((state.categorias.find(c => c.id === p.categoria_id) || {}).nombre || "");
  modal.innerHTML = `
    <div class="modal">
      <div class="modal-head"><h3>Editar producto</h3><button class="modal-close" id="ep-close">${icon("close")}</button></div>
      <div class="field"><label>Nombre</label><input id="ep-nombre" value="${esc(p.nombre)}"></div>
      <div class="field"><label>Descripción</label><input id="ep-desc" value="${esc(p.descripcion)}"></div>
      <div class="field"><label>Precio base</label><input id="ep-precio" type="number" step="0.5" value="${p.precio_base}"></div>
      <div class="field">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
          <input type="checkbox" id="ep-pers" ${p.personalizable === 1 ? "checked" : ""} style="width:18px;height:18px">
          Pizza personalizable (mitad y mitad / combinado)
        </label>
        <div style="color:var(--gris-500);font-size:12px;margin-top:4px">Permite elegir ingredientes por mitad y la categoría debe tener grupos como Tamaño u Orilla.</div>
      </div>
      <div class="field" id="ep-precios-field" ${esPizza ? "" : 'style="display:none"'}>
        <label>Precios por tamaño (constructor Domino's)</label>
        <div class="tam-grid">
          ${TAMANOS.map(t => `<div><span style="font-size:12px;font-weight:700;color:var(--gris-500)">${t[0].toUpperCase() + t.slice(1)}</span><input class="ep-precio-t" data-t="${t}" type="number" step="0.5" value="${precios[t] != null ? precios[t] : ""}" placeholder="${p.precio_base}" style="width:100%;margin-top:4px;border:1.5px solid var(--gris-200);border-radius:8px;padding:8px 10px;font-weight:700"></div>`).join("")}
        </div>
        <div style="color:var(--gris-500);font-size:12px;margin-top:6px">Vacío usa el precio base. Solo se usa en el constructor de pizza.</div>
      </div>
      <div class="field" id="ep-receta-field" ${esPizza ? "" : 'style="display:none"'}>
        <label>Receta base (ingredientes que vienen incluidos)</label>
        <div class="opt-chips">
          ${state.ingredientes.length ? state.ingredientes.map(i => `
            <button class="ing-check ${(p.receta || []).includes(i.id) ? "selected" : ""}" data-reci="${i.id}">
              <span class="checkbox">${icon("check")}</span>
              <span>${esc(i.nombre)}</span>
            </button>`).join("") : `<span style="color:var(--gris-500);font-size:12px">Crea ingredientes desde la pestaña Ingredientes</span>`}
        </div>
      </div>
      <div class="modal-foot">
        <button class="btn ghost" id="ep-cancel">Cancelar</button>
        <button class="btn btn-primary" id="ep-save">Guardar</button>
      </div>
    </div>`;
  $("#modal-root").appendChild(modal);
  function togglePizzaFields() {
    const show = $("#ep-pers", modal).checked || esPizza;
    $("#ep-precios-field", modal).style.display = show ? "" : "none";
    $("#ep-receta-field", modal).style.display = show ? "" : "none";
  }
  $("#ep-pers", modal).addEventListener("change", togglePizzaFields);
  $$("[data-reci]", modal).forEach(b => b.addEventListener("click", () => {
    const id = +b.dataset.reci;
    b.classList.toggle("selected");
  }));
  $("#ep-close", modal).onclick = $("#ep-cancel", modal).onclick = () => modal.remove();
  $("#ep-save", modal).onclick = async () => {
    const nombre = $("#ep-nombre", modal).value.trim();
    const descripcion = $("#ep-desc", modal).value.trim();
    const precio_base = parseFloat($("#ep-precio", modal).value) || 0;
    const personalizable = $("#ep-pers", modal).checked ? 1 : 0;
    if (!nombre) return toast("Escribe el nombre", "warn");
    const show = $("#ep-pers", modal).checked || esPizza;
    const precios = {};
    if (show) {
      TAMANOS.forEach(t => {
        const v = parseFloat($(`[data-t="${t}"]`, modal).value);
        if (!isNaN(v)) precios[t] = v;
      });
    }
    const receta = $$("[data-reci].selected", modal).map(b => +b.dataset.reci);
    try {
      const body = { nombre, descripcion, precio_base, personalizable };
      if (show) { body.precios = precios; body.receta = receta; }
      await api("/menu/productos/" + p.id, "PUT", body);
      toast("Producto actualizado");
      modal.remove();
      loadMenu();
    } catch (e) { toast("Error: " + e.message, "error"); }
  };
}
function modalNuevoProducto() {
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  const TAMANOS = ["individual", "chica", "mediana", "grande"];
  let catId = state.categorias[0]?.id;
  const esPizza = () => /pizza/i.test((state.categorias.find(c => c.id === +$("#np-cat", modal)?.value) || {}).nombre || "");
  modal.innerHTML = `
    <div class="modal">
      <div class="modal-head"><h3>Nuevo producto</h3><button class="modal-close" id="np-close">${icon("close")}</button></div>
      <div class="field"><label>Categoría</label><select id="np-cat">${state.categorias.map(c => `<option value="${c.id}">${esc(c.nombre)}</option>`).join("")}</select></div>
      <div class="field"><label>Nombre</label><input id="np-nombre" placeholder="Ej: Pizza de pastor"></div>
      <div class="field"><label>Descripción</label><input id="np-desc" placeholder="Ingredientes incluidos"></div>
      <div class="field"><label>Precio base</label><input id="np-precio" type="number" step="0.5" value="60"></div>
      <div class="field">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
          <input type="checkbox" id="np-pers" style="width:18px;height:18px">
          Pizza personalizable (mitad y mitad / combinado)
        </label>
      </div>
      <div class="field" id="np-precios-field" style="display:none">
        <label>Precios por tamaño (constructor Domino's)</label>
        <div class="tam-grid">
          ${TAMANOS.map(t => `<div><span style="font-size:12px;font-weight:700;color:var(--gris-500)">${t[0].toUpperCase() + t.slice(1)}</span><input class="np-precio-t" data-t="${t}" type="number" step="0.5" placeholder="Precio base" style="width:100%;margin-top:4px;border:1.5px solid var(--gris-200);border-radius:8px;padding:8px 10px;font-weight:700"></div>`).join("")}
        </div>
      </div>
      <div class="field" id="np-receta-field" style="display:none">
        <label>Receta base (ingredientes incluidos)</label>
        <div class="opt-chips">
          ${state.ingredientes.length ? state.ingredientes.map(i => `
            <button class="ing-check" data-reci="${i.id}">
              <span class="checkbox">${icon("check")}</span>
              <span>${esc(i.nombre)}</span>
            </button>`).join("") : `<span style="color:var(--gris-500);font-size:12px">Crea ingredientes desde la pestaña Ingredientes</span>`}
        </div>
      </div>
      <div class="modal-foot">
        <button class="btn ghost" id="np-cancel">Cancelar</button>
        <button class="btn btn-primary" id="np-save">Guardar</button>
      </div>
    </div>`;
  $("#modal-root").appendChild(modal);
  function togglePizzaFields() {
    const show = $("#np-pers", modal).checked || esPizza();
    $("#np-precios-field", modal).style.display = show ? "" : "none";
    $("#np-receta-field", modal).style.display = show ? "" : "none";
  }
  $("#np-pers", modal).addEventListener("change", togglePizzaFields);
  $("#np-cat", modal).addEventListener("change", togglePizzaFields);
  $$("[data-reci]", modal).forEach(b => b.addEventListener("click", () => b.classList.toggle("selected")));
  $("#np-close", modal).onclick = $("#np-cancel", modal).onclick = () => modal.remove();
  $("#np-save", modal).onclick = async () => {
    const categoria_id = +$("#np-cat", modal).value;
    const nombre = $("#np-nombre", modal).value.trim();
    const descripcion = $("#np-desc", modal).value.trim();
    const precio_base = parseFloat($("#np-precio", modal).value) || 0;
    const personalizable = $("#np-pers", modal).checked ? 1 : 0;
    if (!nombre) return toast("Escribe el nombre", "warn");
    const show = $("#np-pers", modal).checked || esPizza();
    const precios = {};
    if (show) {
      TAMANOS.forEach(t => {
        const v = parseFloat($(`[data-t="${t}"]`, modal).value);
        if (!isNaN(v)) precios[t] = v;
      });
    }
    const receta = $$("[data-reci].selected", modal).map(b => +b.dataset.reci);
    try {
      const cat = state.categorias.find(c => c.id === categoria_id);
      const body = { categoria_id, nombre, descripcion, precio_base, icono: cat?.icono || "extra", orden: 99, personalizable };
      if (show) { body.precios = precios; body.receta = receta; }
      const r = await api("/menu/productos", "POST", body);
      toast("Producto creado");
      modal.remove();
      loadMenu();
    } catch (e) { toast("Error: " + e.message, "error"); }
  };
}

/* ============ VISTA: INGREDIENTES ============ */
async function loadIngredientes() {
  try {
    const inv = await api("/ingredientes");
    const v = $("#view-ingredientes");
    v.innerHTML = `
      <div class="view-header">
        <div><div class="view-title">Ingredientes</div><div class="view-sub">Lista de ingredientes del negocio</div></div>
        <button class="btn btn-primary" id="btn-nuevo-ing">${icon("plus")}Nuevo ingrediente</button>
      </div>
      <div class="table-wrap">
        <table class="data">
          <thead><tr><th>Ingrediente</th><th>Recargo</th><th></th></tr></thead>
          <tbody>
            ${inv.map(i => `
              <tr>
                <td style="font-weight:700">${esc(i.nombre)}</td>
                <td>${i.recargo ? money(i.recargo) : "—"}</td>
                <td style="white-space:nowrap"><button class="btn btn-sm btn-ghost" data-editing="${i.id}">${icon("edit")}Editar</button></td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>`;
    $$("[data-editing]", v).forEach(b => b.addEventListener("click", () => editarIngrediente(+b.dataset.editing)));
    $("#btn-nuevo-ing").onclick = () => modalNuevoIngrediente();
  } catch (e) { toast("Error: " + e.message, "error"); }
}
function modalNuevoIngrediente() {
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.innerHTML = `
    <div class="modal">
      <div class="modal-head"><h3>Nuevo ingrediente</h3><button class="modal-close" id="ni-close">${icon("close")}</button></div>
      <div class="field"><label>Nombre</label><input id="ni-nombre"></div>
      <div class="field"><label>Recargo (costo extra)</label><input id="ni-recargo" type="number" step="0.5" value="0"></div>
      <div class="field">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
          <input type="checkbox" id="ni-pizza" style="width:18px;height:18px">
          Es topping de pizza
        </label>
      </div>
      <div class="modal-foot"><button class="btn ghost" id="ni-cancel">Cancelar</button><button class="btn btn-primary" id="ni-save">Guardar</button></div>
    </div>`;
  $("#modal-root").appendChild(modal);
  $("#ni-close", modal).onclick = $("#ni-cancel", modal).onclick = () => modal.remove();
  $("#ni-save", modal).onclick = async () => {
    const nombre = $("#ni-nombre", modal).value.trim();
    if (!nombre) return toast("Escribe el nombre", "warn");
    try {
      await api("/ingredientes", "POST", {
        nombre, recargo: +($("#ni-recargo", modal).value || 0), pizza: $("#ni-pizza", modal).checked ? 1 : 0,
      });
      toast("Ingrediente creado");
      modal.remove();
      loadIngredientes();
      state.ingredientes = await api("/menu/ingredientes");
    } catch (e) { toast("Error: " + e.message, "error"); }
  };
}
function editarIngrediente(iid) {
  const ing = state.ingredientes.find(i => i.id === iid);
  if (!ing) return;
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.innerHTML = `
    <div class="modal">
      <div class="modal-head"><h3>Editar ingrediente</h3><button class="modal-close" id="ei-close">${icon("close")}</button></div>
      <div class="field"><label>Nombre</label><input id="ei-nombre" value="${esc(ing.nombre)}"></div>
      <div class="field"><label>Recargo (costo extra)</label><input id="ei-recargo" type="number" step="0.5" value="${ing.recargo}"></div>
      <div class="field">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
          <input type="checkbox" id="ei-pizza" ${ing.pizza === 1 ? "checked" : ""} style="width:18px;height:18px">
          Es topping de pizza
        </label>
      </div>
      <div class="modal-foot"><button class="btn ghost" id="ei-cancel">Cancelar</button><button class="btn btn-primary" id="ei-save">Guardar</button></div>
    </div>`;
  $("#modal-root").appendChild(modal);
  $("#ei-close", modal).onclick = $("#ei-cancel", modal).onclick = () => modal.remove();
  $("#ei-save", modal).onclick = async () => {
    const nombre = $("#ei-nombre", modal).value.trim();
    if (!nombre) return toast("Escribe el nombre", "warn");
    try {
      await api("/ingredientes/" + iid, "PUT", {
        nombre, recargo: +($("#ei-recargo", modal).value || 0), pizza: $("#ei-pizza", modal).checked ? 1 : 0,
      });
      toast("Ingrediente actualizado");
      modal.remove();
      loadIngredientes();
      state.ingredientes = await api("/menu/ingredientes");
    } catch (e) { toast("Error: " + e.message, "error"); }
  };
}

/* ============ VISTA: CLIENTES ============ */
async function loadClientes(q) {
  try {
    const lista = await api("/clientes?q=" + encodeURIComponent(q));
    state.clientes = lista;
    const v = $("#view-clientes");
    v.innerHTML = `
      <div class="view-header">
        <div><div class="view-title">Clientes</div><div class="view-sub">Habituales para pedir más rápido</div></div>
        <button class="btn btn-primary" id="btn-nuevo-cli">${icon("plus")}Nuevo cliente</button>
      </div>
      <div class="field" style="max-width:420px"><label>Buscar</label>
        <input id="cli-search" placeholder="Nombre o teléfono…" value="${esc(q)}" style="background:#fff">
      </div>
      <div class="table-wrap">
        <table class="data">
          <thead><tr><th>Nombre</th><th>Teléfono</th><th>Dirección</th><th></th></tr></thead>
          <tbody>
            ${lista.map(c => `
              <tr data-cli="${c.id}">
                <td style="font-weight:700">${esc(c.nombre)}</td>
                <td>${esc(c.telefono)}</td>
                <td>${esc(c.direccion)}</td>
                <td><button class="btn btn-sm btn-ghost client-ultimo" data-cid="${c.id}">${icon("clipboard")}Última orden</button></td>
              </tr>`).join("") || `<tr><td colspan="4" style="text-align:center;color:var(--gris-400)">Sin clientes</td></tr>`}
          </tbody>
        </table>
      </div>`;
    $("#cli-search").addEventListener("input", e => { clearTimeout(lb); lb = setTimeout(() => loadClientes(e.target.value), 300); });
    $$(".client-ultimo", v).forEach(b => b.onclick = () => verUltimoPedidoCliente(+b.dataset.cid));
    $("#btn-nuevo-cli").onclick = modalNuevoCliente;
  } catch (e) { toast("Error: " + e.message, "error"); }
}
let lb;
function modalNuevoCliente() {
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.innerHTML = `
    <div class="modal">
      <div class="modal-head"><h3>Nuevo cliente</h3><button class="modal-close" id="nc-close">${icon("close")}</button></div>
      <div class="field"><label>Nombre *</label><input id="nc-nombre"></div>
      <div class="field"><label>Teléfono</label><input id="nc-tel" placeholder="612 ••• ••••"></div>
      <div class="field"><label>Dirección</label><input id="nc-dir"></div>
      <div class="field"><label>Notas</label><textarea id="nc-notas"></textarea></div>
      <div class="modal-foot"><button class="btn ghost" id="nc-cancel">Cancelar</button><button class="btn btn-primary" id="nc-save">Guardar</button></div>
    </div>`;
  $("#modal-root").appendChild(modal);
  $("#nc-close", modal).onclick = $("#nc-cancel", modal).onclick = () => modal.remove();
  $("#nc-save", modal).onclick = async () => {
    const nombre = $("#nc-nombre", modal).value.trim();
    if (!nombre) return toast("Escribe el nombre", "warn");
    try {
      const r = await api("/clientes", "POST", { nombre, telefono: $("#nc-tel", modal).value.trim(), direccion: $("#nc-dir", modal).value.trim(), notas: $("#nc-notas", modal).value.trim() });
      toast("Cliente guardado");
      modal.remove();
      loadClientes("");
    } catch (e) { toast("Error: " + e.message, "error"); }
  };
}
async function verUltimoPedidoCliente(cid) {
  try {
    const ped = await api("/clientes/" + cid + "/ultimo_pedido");
    if (!ped) { toast("Este cliente aún no tiene pedidos", "warn"); return; }
    const modal = document.createElement("div");
    modal.className = "modal-backdrop";
    modal.innerHTML = `
      <div class="modal">
        <div class="modal-head"><h3>Última orden de ${esc(state.clientes.find(c => c.id === cid)?.nombre || "")}</h3>
        <button class="modal-close" id="up-close">${icon("close")}</button></div>
        <div style="color:var(--gris-500);font-size:13px;margin-bottom:10px">${esc(ped.folio)} · ${esc(ped.creado_en)}</div>
        ${ped.items.map(it => `
          <div class="cart-item" style="margin-bottom:6px">
            <div class="row1"><span class="name">${it.cantidad}× ${esc(it.producto_nombre)}</span></div>
            <div class="config-txt">${esc(it.configuracion)}</div>
          </div>`).join("")}
        <div class="cart-total"><span class="lbl">Total</span><span class="val">${money(ped.total)}</span></div>
        <div class="modal-foot">
          <button class="btn ghost" id="up-cancel">Cerrar</button>
          <button class="btn btn-primary" id="up-repedir">${icon("reset")}Replicar pedido</button>
        </div>
      </div>`;
    $("#modal-root").appendChild(modal);
    $("#up-close", modal).onclick = $("#up-cancel", modal).onclick = () => modal.remove();
    $("#up-repedir", modal).onclick = () => {
      // reconstruir carrito desde último pedido
      state.carrito = ped.items.map(it => {
        const prod = state.menu.flatMap(c => c.productos).find(p => p.nombre === it.producto_nombre);
        return prod ? { producto: prod, opciones: {}, extras: [], cantidad: it.cantidad } : null;
      }).filter(Boolean);
      state.pedido.cliente_id = cid;
      state.pedido.cliente_nombre = state.clientes.find(c => c.id === cid)?.nombre || "";
      state.pedido.direccion = state.clientes.find(c => c.id === cid)?.direccion || "";
      modal.remove();
      setTab("pedir");
      renderCategorias();
      renderCarrito();
    };
  } catch (e) { toast("Error: " + e.message, "error"); }
}

/* ============ MODAL CLIENTE EN TOMA DE PEDIDO ============ */
function abrirModalCliente() {
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.innerHTML = `
    <div class="modal">
      <div class="modal-head"><h3>Asignar cliente</h3><button class="modal-close" id="cl-close">${icon("close")}</button></div>
      <div class="field"><label>Buscar cliente existente</label>
        <input id="cl-search" placeholder="Nombre o teléfono…"></div>
      <div id="cl-results" style="max-height:280px;overflow-y:auto"></div>
      <div class="field"><label>Nombre directo</label><input id="cl-name" value="${esc(state.pedido.cliente_nombre)}" placeholder="Escribir sin registrar"></div>
      <div class="modal-foot">
        <button class="btn ghost" id="cl-clear">${icon("trash")}Quitar</button>
        <button class="btn btn-primary" id="cl-ok">Usar</button>
      </div>
    </div>`;
  $("#modal-root").appendChild(modal);
  $("#cl-close", modal).onclick = () => modal.remove();
  $("#cl-clear", modal).onclick = () => {
    state.pedido.cliente_id = null; state.pedido.cliente_nombre = "";
    modal.remove(); renderCategorias();
  };
  $("#cl-ok", modal).onclick = () => {
    const nombre = $("#cl-name", modal).value.trim();
    if (!nombre) return toast("Escribe un nombre", "warn");
    state.pedido.cliente_nombre = nombre;
    modal.remove();
    renderCategorias();
  };
  $("#cl-search", modal).addEventListener("input", async e => {
    const q = e.target.value.trim();
    const dest = $("#cl-results", modal);
    if (q.length < 1) { dest.innerHTML = ""; return; }
    try {
      const res = await api("/clientes?q=" + encodeURIComponent(q));
      dest.innerHTML = res.map(c => `
        <button class="chip" style="width:100%;margin-bottom:8px" data-cid="${c.id}" data-cname="${esc(c.nombre)}">
          <span>${icon("people")}${esc(c.nombre)}</span>
          <span class="rec">${esc(c.telefono)}</span>
        </button>`).join("") || `<div style="color:var(--gris-400);font-size:13px">Sin coincidencias</div>`;
      $$("[data-cid]", dest).forEach(b => b.onclick = () => {
        state.pedido.cliente_id = +b.dataset.cid;
        state.pedido.cliente_nombre = b.dataset.cname;
        const cl = state.clientes.find(x => x.id == b.dataset.cid);
        if (cl?.direccion && state.pedido.tipo === "domicilio") state.pedido.direccion = cl.direccion;
        if (cl?.telefono) state.pedido.telefono = cl.telefono;
        modal.remove();
        renderCategorias();
        toast(`Cliente: ${b.dataset.cname}`);
      });
    } catch {}
  });
}

/* ============ VISTA: REPORTES ============ */
async function loadReportes(dias = 30) {
  try {
    const [dia, rango] = await Promise.all([api("/reportes/dia"), api("/reportes/rango?dias=" + dias)]);
    const v = $("#view-reportes");
    v.innerHTML = `
      <div class="view-header">
        <div><div class="view-title">Reportes</div><div class="view-sub">Resumen de ventas del día y por rango</div></div>
        <select id="rango-select" class="status-select">
          <option value="7" ${dias === 7 ? "selected" : ""}>Últimos 7 días</option>
          <option value="14" ${dias === 14 ? "selected" : ""}>Últimos 14 días</option>
          <option value="30" ${dias === 30 ? "selected" : ""}>Últimos 30 días</option>
        </select>
      </div>
      <div class="stat-cards">
        <div class="stat-card"><span class="sl">Ventas del día</span><span class="sv green">${money(dia.total)}</span></div>
        <div class="stat-card"><span class="sl">Comandas hoy</span><span class="sv">${dia.pedidos}</span></div>
        <div class="stat-card"><span class="sl">Entregadas</span><span class="sv">${dia.entregados}</span></div>
        <div class="stat-card"><span class="sl">En proceso</span><span class="sv">${dia.en_proceso}</span></div>
      </div>
      <div class="grid grid-3" style="margin-bottom:18px">
        <div class="card">
          <div class="opt-label">Desglose por método de pago</div>
          ${Object.entries(dia.por_pago).map(([k, t]) => `
            <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--gris-200)"">
              <span style="font-weight:600;text-transform:capitalize">${esc(k)}</span>
              <span class="money" style="color:var(--rojo)">${money(t)}</span>
            </div>`).join("") || `<div style="color:var(--gris-400);font-size:13px;padding:10px 0">Sin entregas registradas hoy</div>`}
        </div>
        <div class="card">
          <div class="opt-label">Top productos (hoy)</div>
          ${dia.top.map((t, i) => `
            <div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--gris-200)">
              <span>${i + 1}. ${esc(t.nombre)}</span>
              <span class="money">${t.cantidad}×</span>
            </div>`).join("") || `<div style="color:var(--gris-400);font-size:13px;padding:10px 0">Aún sin datos</div>`}
        </div>
        <div class="card">
          <div class="opt-label">Gráfica de ventas (${dias} días)</div>
          <div id="grafica">${svgGrafica(rango.datos)}</div>
        </div>
      </div>
      <div class="card">
        <div class="modal-head"><h3>Comandas de hoy</h3><button class="btn btn-sm btn-ghost" id="imprimir-dia">${icon("print")}Imprimir</button></div>
        <div class="table-wrap">
          <table class="data">
            <thead><tr><th>Folio</th><th>Hora</th><th>Cliente</th><th>Tipo</th><th>Estado</th><th>Método</th><th>Total</th></tr></thead>
            <tbody>
              ${dia.lista.map(p => `
                <tr>
                  <td style="font-weight:800">${esc(p.folio)}</td>
                  <td>${esc(p.creado_en.slice(11, 16))}</td>
                  <td>${esc(p.cliente_nombre)}</td>
                  <td>${esc(p.tipo)}</td>
                  <td><span class="status-pill ${p.estado}">${estadoTxt(p.estado)}</span></td>
                  <td style="text-transform:capitalize">${esc(p.metodo_pago)}</td>
                  <td class="money">${money(p.total)}</td>
                </tr>`).join("") || `<tr><td colspan="7" style="text-align:center;color:var(--gris-400)">Sin comandas hoy</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>`;
    $("#rango-select").onchange = e => loadReportes(+e.target.value);
    $("#imprimir-dia").onclick = () => window.print();
  } catch (e) { toast("Error: " + e.message, "error"); }
}
function svgGrafica(data) {
  if (!data.length) return `<div style="color:var(--gris-400);font-size:13px;padding:20px 0">Sin datos en el rango</div>`;
  const W = 520, H = 200, padL = 46, padB = 26, padT = 12;
  const max = Math.max(...data.map(d => d.total), 1);
  const iw = W - padL - 14;
  const bh = H - padT - padB;
  const n = data.length;
  const bw = iw / n;
  const bars = data.map((d, i) => {
    const h = Math.max(2, (d.total / max) * bh);
    const x = padL + i * bw + bw * 0.15;
    const y = H - padB - h;
    return `<rect x="${x}" y="${y}" width="${bw * 0.7}" height="${h}" rx="3" fill="${d.total === max ? "#c8102e" : "#e8a016"}"><title>${esc(d.dia)} · ${money(d.total)}</title></rect>
      <text x="${x + bw * 0.35}" y="${H - 8}" font-size="8" fill="#8c93a3" text-anchor="middle">${d.dia.slice(8)}</text>`;
  }).join("");
  const lines = [];
  for (let g = 0; g <= 4; g++) {
    const y = padT + (bh / 4) * g;
    const lbl = Math.round(max * (1 - g / 4));
    lines.push(`<line x1="${padL}" y1="${y}" x2="${W - 14}" y2="${y}" stroke="#e2e5ea"/><text x="${padL - 6}" y="${y + 3}" font-size="9" fill="#8c93a3" text-anchor="end">${lbl >= 1000 ? (lbl / 1000).toFixed(0) + "k" : lbl}</text>`);
  }
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto">${lines.join("")}${bars}</svg>`;
}

/* ============ WAKE LOCK: evita que la tableta apague la pantalla ============ */
let wakeLock = null;
async function solicitarWakeLock() {
  try {
    if ("wakeLock" in navigator) {
      wakeLock = await navigator.wakeLock.request("screen");
      wakeLock.addEventListener("release", () => { wakeLock = null; });
    }
  } catch (e) {}
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") solicitarWakeLock();
});
document.addEventListener("click", solicitarWakeLock, { once: false });
solicitarWakeLock();

/* Gestos básicos: impedir zoom accidental en tableta */
document.addEventListener("gesturestart", e => e.preventDefault());

/* Sonido requiere gesto del usuario */
document.addEventListener("click", () => {
  try {
    if (!state.audio && window.AudioContext) state.audio = new AudioContext();
    if (state.audio && state.audio.state === "suspended") state.audio.resume();
  } catch (e) {}
}, { once: true });