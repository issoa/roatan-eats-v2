import { useState, useEffect, useRef } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

// ── Config — edit this to change restaurant / menu / PINs ───────────────────
const RESTAURANT = {
  name:               "Chicken Shack",
  emoji:              "🍗",
  tagline:            "Honduran comfort food & fresh island seafood",
  address:            "West End, Roatan",
  hours:              "Mon–Sun  10am – 9pm",
  zone:               "West End",        // restaurant's own area
  deliveryFeeLocal:   10.00,             // same area as restaurant
  deliveryFeeRemote:  15.00,             // different area
  taxRate:            0.12,              // 12% food tax
  zones: [                               // all areas you deliver to
    "West End",
    "Half Moon Bay",
    "Sandy Bay",
    "West Bay",
    "Flowers Bay",
    "Coxen Hole",
    "French Harbour",
    "Oak Ridge",
  ],
  driverPin:   "1234",
  kitchenPin:  "5678",
  menu: [
    { id: 1,  category: "Breakfast", name: "Baleada Simple",    desc: "Flour tortilla with refried beans and cream",               price: 2.50 },
    { id: 2,  category: "Breakfast", name: "Baleada Especial",  desc: "Flour tortilla with beans, eggs, cheese, and cream",        price: 4.00 },
    { id: 3,  category: "Mains",    name: "Pollo Frito",        desc: "Fried chicken with rice, beans, and plantains",             price: 8.00 },
    { id: 4,  category: "Mains",    name: "Pescado Frito",      desc: "Fresh fried fish with coconut rice and salad",              price: 10.00 },
    { id: 5,  category: "Mains",    name: "Sopa de Caracol",    desc: "Conch soup with coconut milk and yuca",                     price: 12.00 },
    { id: 6,  category: "Sides",    name: "Tajadas",            desc: "Crispy fried plantain slices",                              price: 2.00 },
    { id: 7,  category: "Sides",    name: "Rice & Beans",       desc: "Coconut rice with red beans",                               price: 2.50 },
    { id: 8,  category: "Drinks",   name: "Jamaica Tea",        desc: "Cold hibiscus flower tea",                                  price: 1.50 },
    { id: 9,  category: "Drinks",   name: "Agua de Coco",       desc: "Fresh coconut water",                                       price: 2.00 },
    { id: 10, category: "Drinks",   name: "Refresco del Dia",   desc: "Ask driver for today's flavor",                             price: 1.50 },
  ],
};

// ── Helpers ──────────────────────────────────────────────────────────────────
const fmt   = (n) => `$${Number(n).toFixed(2)}`;
const clock = () => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const waUrl = (phone, msg) => `https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(msg)}`;
const view  = () => new URLSearchParams(window.location.search).get("view") || "customer";

async function getSettings() {
  const { data } = await supabase.from("settings").select("key,value");
  return data ? Object.fromEntries(data.map((r) => [r.key, r.value])) : {};
}
async function putSetting(key, value) {
  // Try update first (record already exists), fall back to insert
  const { error: upErr, count } = await supabase
    .from("settings")
    .update({ value })
    .eq("key", key)
    .select();
  if (upErr) {
    // Try insert if update failed
    const { error: inErr } = await supabase.from("settings").insert({ key, value });
    return inErr;
  }
  return null;
}

// ── Root ─────────────────────────────────────────────────────────────────────
export default function App() {
  const v = view();
  if (v === "driver")     return <DriverView />;
  if (v === "restaurant") return <RestaurantView />;
  if (v === "qr")         return <QRView />;
  return <CustomerView />;
}

// =============================================================================
// QR CODE VIEW  /?view=qr  — open this page and print it
// =============================================================================
function QRView() {
  const url = window.location.origin;
  const qr  = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&margin=20&data=${encodeURIComponent(url)}`;

  return (
    <div className="qr-page">
      <div className="qr-card">
        <div className="qr-emoji">{RESTAURANT.emoji}</div>
        <h1 className="qr-title">{RESTAURANT.name}</h1>
        <p className="qr-sub">Scan to order online</p>
        <img src={qr} alt="QR Code" className="qr-img" />
        <p className="qr-url">{url}</p>
        <p className="qr-tagline">{RESTAURANT.tagline}</p>
        <p className="qr-hours">{RESTAURANT.hours}</p>
      </div>
      <button className="btn-primary" style={{marginTop:20}} onClick={() => window.print()}>
        🖨️ Print
      </button>
    </div>
  );
}

// =============================================================================
// CUSTOMER VIEW  /?
// =============================================================================
function CustomerView() {
  const [cart, setCart]         = useState({});
  const [step, setStep]         = useState("menu"); // menu | checkout | done
  const [name, setName]         = useState(() => localStorage.getItem("c_name")  || "");
  const [phone, setPhone]       = useState(() => localStorage.getItem("c_phone") || "");
  const [where, setWhere]       = useState(() => localStorage.getItem("c_where") || "");
  const [note, setNote]         = useState("");
  const [zone, setZone]         = useState(() => localStorage.getItem("c_zone")  || "");
  const [driverPhone, setDriverPhone]       = useState("50497010106");
  const [restaurantZone, setRestaurantZone] = useState(RESTAURANT.zone);
  const [waLink, setWaLink]     = useState("");
  const [orderError, setOrderError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    getSettings().then((s) => {
      if (s.active_driver_phone) setDriverPhone(s.active_driver_phone.replace(/\D/g, ""));
      if (s.restaurant_zone)     setRestaurantZone(s.restaurant_zone);
    });
  }, []);

  const categories   = [...new Set(RESTAURANT.menu.map((i) => i.category))];
  const cartItems    = RESTAURANT.menu.filter((i) => cart[i.id]);
  const subtotal     = cartItems.reduce((s, i) => s + i.price * cart[i.id], 0);
  const tax          = subtotal * RESTAURANT.taxRate;
  const deliveryFee  = zone && zone !== restaurantZone
    ? RESTAURANT.deliveryFeeRemote
    : RESTAURANT.deliveryFeeLocal;
  const total        = subtotal + tax + (zone ? deliveryFee : 0);
  const itemCount    = Object.values(cart).reduce((s, n) => s + n, 0);

  function add(id) { setCart((c) => ({ ...c, [id]: (c[id] || 0) + 1 })); }
  function rem(id) {
    setCart((c) => {
      const n = { ...c };
      if (n[id] > 1) n[id]--; else delete n[id];
      return n;
    });
  }

  async function placeOrder() {
    setSubmitting(true);
    setOrderError("");
    localStorage.setItem("c_name",  name);
    localStorage.setItem("c_phone", phone);
    localStorage.setItem("c_where", where);
    localStorage.setItem("c_zone",  zone);

    // Always fetch the latest driver phone fresh at order time
    const settings = await getSettings();
    const freshDriverPhone = settings.active_driver_phone
      ? settings.active_driver_phone.replace(/\D/g, "")
      : driverPhone;
    const freshRestaurantZone = settings.restaurant_zone || restaurantZone;

    const lines = cartItems
      .map((i) => `  • ${i.name} x${cart[i.id]}  ${fmt(i.price * cart[i.id])}`)
      .join("\n");

    const msg = [
      `🛵 *New Order — ${RESTAURANT.name}*`,
      ``,
      `👤 ${name}`,
      `📱 ${phone}`,
      `📍 ${where}`,
      `🗺️ Area: ${zone}`,
      note ? `📝 ${note}` : null,
      ``,
      `*Order:*`,
      lines,
      ``,
      `Subtotal:  ${fmt(subtotal)}`,
      `Tax 12%:   ${fmt(tax)}`,
      `Delivery:  ${fmt(deliveryFee)} (${zone === freshRestaurantZone ? "local" : "cross-area"})`,
      `*TOTAL:    ${fmt(total)}*`,
      ``,
      `⏰ ${clock()}`,
    ].filter((l) => l !== null).join("\n");

    const { error } = await supabase.from("orders").insert({
      customer_name:    name.trim(),
      customer_phone:   phone.trim(),
      delivery_address: where.trim(),
      note:             note.trim(),
      items:            cartItems.map((i) => ({ id: i.id, name: i.name, price: i.price, quantity: cart[i.id] })),
      subtotal,
      delivery_fee:     deliveryFee,
      total,
      status:           "new",
      restaurant:       RESTAURANT.name,
      order_time:       clock(),
    });

    setSubmitting(false);
    if (error) {
      setOrderError(`Could not place order: ${error.message}`);
      return;
    }
    setWaLink(waUrl(freshDriverPhone, msg));
    setStep("done");
  }

  // ── Done screen ─────────────────────────────────────────────────────────────
  if (step === "done") return (
    <div className="app">
      <header className="hdr"><h1>{RESTAURANT.emoji} {RESTAURANT.name}</h1></header>
      <div className="done">
        <div className="done-icon">✅</div>
        <h2>Order Received!</h2>
        <p>Tap below to send your order to the driver on WhatsApp.</p>
        <a className="btn-wa full" href={waLink} target="_blank" rel="noreferrer">
          📲 Send Order to Driver
        </a>
        <a className="btn-wa full" style={{background:"#128c7e", marginTop:8}}
          href={waUrl(driverPhone, `Hi! I just placed an order and want to follow up 🛵`)}
          target="_blank" rel="noreferrer">
          💬 Contact Driver
        </a>
        <button className="btn-ghost full" onClick={() => { setCart({}); setNote(""); setStep("menu"); }}>
          ← Back to Menu
        </button>
      </div>
    </div>
  );

  // ── Checkout ────────────────────────────────────────────────────────────────
  if (step === "checkout") return (
    <div className="app">
      <header className="hdr">
        <button className="back" onClick={() => setStep("menu")}>← Menu</button>
        <h1>Your Order</h1>
      </header>

      <div className="card">
        {cartItems.map((i) => (
          <div key={i.id} className="row">
            <span>{i.name} ×{cart[i.id]}</span>
            <span>{fmt(i.price * cart[i.id])}</span>
          </div>
        ))}
        <div className="row muted"><span>Tax (12%)</span><span>{fmt(tax)}</span></div>
        <div className="row muted">
          <span>Delivery{zone ? ` · ${zone}` : ""}</span>
          <span>{zone ? fmt(deliveryFee) : "select area below"}</span>
        </div>
        <div className="row grand"><span>Total</span><strong>{zone ? fmt(total) : "—"}</strong></div>
      </div>

      <div className="card">
        <h3>Your Details</h3>
        <input  className="inp" placeholder="Your name *"              value={name}  onChange={(e) => setName(e.target.value)} />
        <input  className="inp" placeholder="Your WhatsApp number"     value={phone} onChange={(e) => setPhone(e.target.value)} />
        <select className="inp" value={zone} onChange={(e) => setZone(e.target.value)}>
          <option value="">Select your area *</option>
          {RESTAURANT.zones.map((z) => (
            <option key={z} value={z}>
              {z} — {z === restaurantZone ? fmt(RESTAURANT.deliveryFeeLocal) : fmt(RESTAURANT.deliveryFeeRemote)} delivery
            </option>
          ))}
        </select>
        <textarea className="inp" rows={3}
          placeholder="Exact location (e.g. Blue Parrot bungalow 3, near the dock) *"
          value={where} onChange={(e) => setWhere(e.target.value)} />
        <textarea className="inp" rows={2}
          placeholder="Any notes? (optional)"
          value={note} onChange={(e) => setNote(e.target.value)} />
        {orderError && <p style={{color:"#c0392b",fontSize:"0.85rem",marginTop:"8px"}}>{orderError}</p>}
        <button
          className="btn-primary full"
          disabled={!name.trim() || !where.trim() || !zone || submitting}
          onClick={placeOrder}
        >
          {submitting ? "Placing order…" : "📲 Send Order via WhatsApp"}
        </button>
      </div>
    </div>
  );

  // ── Menu ────────────────────────────────────────────────────────────────────
  return (
    <div className="app">
      <header className="hdr">
        <div className="hdr-row">
          <h1>{RESTAURANT.emoji} {RESTAURANT.name}</h1>
          {driverPhone && (
            <a className="btn-wa-sm"
              href={waUrl(driverPhone, "Hi! I have a question about my order 🛵")}
              target="_blank" rel="noreferrer">
              💬 Driver
            </a>
          )}
        </div>
        <p className="sub">{RESTAURANT.tagline}</p>
        <p className="meta">{RESTAURANT.hours} · {RESTAURANT.address}</p>
      </header>

      {categories.map((cat) => (
        <div key={cat} className="card">
          <div className="cat-title">{cat}</div>
          {RESTAURANT.menu.filter((i) => i.category === cat).map((item) => (
            <div key={item.id} className="menu-row">
              <div className="menu-info">
                <div className="menu-name">{item.name}</div>
                <div className="menu-desc">{item.desc}</div>
                <div className="menu-price">{fmt(item.price)}</div>
              </div>
              <div className="qty">
                {cart[item.id] ? (
                  <>
                    <button className="qty-btn" onClick={() => rem(item.id)}>−</button>
                    <span className="qty-n">{cart[item.id]}</span>
                    <button className="qty-btn" onClick={() => add(item.id)}>+</button>
                  </>
                ) : (
                  <button className="qty-btn add" onClick={() => add(item.id)}>+</button>
                )}
              </div>
            </div>
          ))}
        </div>
      ))}

      <div style={{ height: 90 }} />

      {itemCount > 0 && (
        <div className="cart-bar">
          <span>{itemCount} item{itemCount !== 1 ? "s" : ""} · {fmt(subtotal)} + delivery</span>
          <button className="btn-primary" onClick={() => setStep("checkout")}>View Order →</button>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// PIN GATE (shared)
// =============================================================================
function PinGate({ title, correctPin, onAuth }) {
  const [pin, setPin] = useState("");
  const [shake, setShake] = useState(false);

  function press(k) {
    if (k === "⌫") { setPin((p) => p.slice(0, -1)); return; }
    const next = pin + k;
    setPin(next);
    if (next.length === 4) {
      if (next === correctPin) { onAuth(); }
      else { setShake(true); setTimeout(() => { setPin(""); setShake(false); }, 500); }
    }
  }

  return (
    <div className="pin-screen">
      <h2>{title}</h2>
      <div className={`pin-dots ${shake ? "shake" : ""}`}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={`pin-dot ${pin.length > i ? "filled" : ""}`} />
        ))}
      </div>
      <div className="pin-pad">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, "", 0, "⌫"].map((k, i) => (
          <button key={i} className="pin-key" disabled={k === ""} onClick={() => press(String(k))}>
            {k}
          </button>
        ))}
      </div>
    </div>
  );
}

// =============================================================================
// DRIVER VIEW  /?view=driver
// =============================================================================
function DriverView() {
  const [auth, setAuth]               = useState(false);
  const [correctPin, setCorrectPin]   = useState(RESTAURANT.driverPin);
  const [orders, setOrders]           = useState([]);
  const [driverPhone, setDriverPhone] = useState("");
  const [newPhone, setNewPhone]       = useState("");
  const [restaurantPhone, setRestaurantPhone] = useState("");
  const [showSettings, setShowSettings]       = useState(false);
  const pollRef = useRef(null);

  useEffect(() => {
    getSettings().then((s) => {
      if (s.driver_pin) setCorrectPin(s.driver_pin);
      if (s.active_driver_phone) {
        const p = s.active_driver_phone.replace(/\D/g, "");
        setDriverPhone(p);
        setNewPhone(p);
      }
      if (s.restaurant_phone) setRestaurantPhone(s.restaurant_phone.replace(/\D/g, ""));
    });
  }, []);

  function cleared() {
    return new Set(JSON.parse(localStorage.getItem("d_cleared") || "[]"));
  }

  async function load() {
    const { data } = await supabase.from("orders").select("*").order("created_at", { ascending: false });
    if (data) {
      const c = cleared();
      setOrders(data.filter((o) => !c.has(o.id)));
    }
  }

  useEffect(() => {
    if (!auth) return;
    load();
    const ch = supabase.channel("drv-orders")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, load)
      .subscribe();
    pollRef.current = setInterval(load, 10000);
    return () => { supabase.removeChannel(ch); clearInterval(pollRef.current); };
  }, [auth]);

  async function advance(id, status) {
    const next = status === "picked_up" ? "delivered" : "picked_up";
    await supabase.from("orders").update({ status: next }).eq("id", id);
    load();
  }

  function clearDone() {
    const ids = orders.filter((o) => o.status === "delivered").map((o) => o.id);
    if (!ids.length) return;
    const next = new Set([...cleared(), ...ids]);
    localStorage.setItem("d_cleared", JSON.stringify([...next]));
    setOrders((prev) => prev.filter((o) => !ids.includes(o.id)));
  }

  async function savePhone() {
    const p = newPhone.replace(/\D/g, "");
    if (!p) { alert("Please enter a phone number"); return; }
    const err = await putSetting("active_driver_phone", p);
    if (err) { alert(`Could not save phone number: ${err.message}`); return; }
    setDriverPhone(p);
    setShowSettings(false);
    alert(`✅ Driver number saved: ${p}`);
  }

  if (!auth) return (
    <PinGate title="🛵 Driver Login" correctPin={correctPin} onAuth={() => setAuth(true)} />
  );

  const active = orders.filter((o) => o.status !== "delivered");
  const done   = orders.filter((o) => o.status === "delivered");

  const statusBadge = {
    new:       <span className="badge new">🆕 New</span>,
    preparing: <span className="badge prep">👨‍🍳 Preparing</span>,
    ready:     <span className="badge ready">✅ Ready!</span>,
    picked_up: <span className="badge pickup">🛵 Picked Up</span>,
    delivered: <span className="badge done">✓ Delivered</span>,
  };

  return (
    <div className="app">
      <header className="hdr">
        <div className="hdr-row">
          <h1>🛵 Driver</h1>
          <div className="hdr-actions">
            {done.length > 0 && <button className="btn-sm danger" onClick={clearDone}>🗑️ Clear</button>}
            <button className="btn-sm" onClick={() => setShowSettings((s) => !s)}>⚙️</button>
          </div>
        </div>
        <p className="sub">Active orders: {active.length}</p>
      </header>

      {showSettings && (
        <div className="card settings">
          <h3>My WhatsApp Number</h3>
          <p className="hint">This is the number customers will send orders to.</p>
          <input className="inp" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="504xxxxxxxxx" />
          <div className="row-gap">
            <button className="btn-primary" onClick={savePhone}>Save</button>
            <button className="btn-ghost"   onClick={() => setShowSettings(false)}>Cancel</button>
          </div>
        </div>
      )}

      {orders.length === 0 && (
        <p className="empty">No orders yet — they'll appear here automatically when customers order.</p>
      )}

      {active.map((order) => (
        <div key={order.id} className={`card order ${order.status === "new" ? "order-new" : ""}`}>
          <div className="order-top">
            <strong>{order.customer_name}</strong>
            {statusBadge[order.status]}
          </div>
          <div className="order-meta">📍 {order.delivery_address}</div>
          {order.items && (
            <div className="order-meta">
              🍽️ {order.items.map((i) => `${i.name} ×${i.quantity}`).join(", ")}
            </div>
          )}
          <div className="order-meta">💵 Total: <strong>{fmt(order.total)}</strong></div>
          {order.note && <div className="order-meta muted">📝 {order.note}</div>}
          <div className="order-actions">
            {order.customer_phone && (
              <a className="btn-wa"
                href={waUrl(order.customer_phone, `Hi ${order.customer_name}! This is your Roatan Eats driver 🛵 I'm on my way with your order!`)}
                target="_blank" rel="noreferrer">
                👤 Customer
              </a>
            )}
            <button className="btn-wa green" onClick={async () => {
              const s = await getSettings();
              const rPhone = s.restaurant_phone
                ? s.restaurant_phone.replace(/\D/g, "")
                : restaurantPhone;
              if (!rPhone) { alert("No restaurant phone saved yet. Go to the kitchen screen → ⚙️ to set it."); return; }
              window.open(waUrl(rPhone, `Hi ${RESTAURANT.name}! 🛵 I'm the driver. On my way to pick up order for ${order.customer_name}. Items: ${order.items ? order.items.map(i => `${i.name} ×${i.quantity}`).join(", ") : ""}`), "_blank");
            }}>
              🍳 Restaurant
            </button>
            {order.status !== "picked_up" && (
              <button className="btn-primary" onClick={() => advance(order.id, order.status)}>
                🛵 Picked Up
              </button>
            )}
            {order.status === "picked_up" && (
              <button className="btn-primary" onClick={() => advance(order.id, order.status)}>
                ✅ Delivered
              </button>
            )}
          </div>
        </div>
      ))}

      {done.length > 0 && (
        <>
          <div className="section-label">Delivered today ({done.length})</div>
          {done.map((order) => (
            <div key={order.id} className="card order dimmed">
              <div className="order-top">
                <strong>{order.customer_name}</strong>
                <span className="badge done">✓ Done</span>
              </div>
              <div className="order-meta">📍 {order.delivery_address}</div>
              <div className="order-meta">💵 {fmt(order.total)}</div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

// =============================================================================
// RESTAURANT VIEW  /?view=restaurant
// =============================================================================
function RestaurantView() {
  const [auth, setAuth]             = useState(false);
  const [correctPin, setCorrectPin] = useState(RESTAURANT.kitchenPin);
  const [orders, setOrders]         = useState([]);
  const [driverPhone, setDriverPhone]               = useState("");
  const [restaurantZone, setRestaurantZone]         = useState(RESTAURANT.zone);
  const [restaurantPhone, setRestaurantPhone]       = useState("");
  const [newZone, setNewZone]         = useState(RESTAURANT.zone);
  const [newRestPhone, setNewRestPhone]             = useState("");
  const [showSettings, setShowSettings]             = useState(false);
  const pollRef = useRef(null);

  useEffect(() => {
    getSettings().then((s) => {
      if (s.restaurant_pin)      setCorrectPin(s.restaurant_pin);
      if (s.active_driver_phone) setDriverPhone(s.active_driver_phone.replace(/\D/g, ""));
      if (s.restaurant_zone) {
        setRestaurantZone(s.restaurant_zone);
        setNewZone(s.restaurant_zone);
      }
      if (s.restaurant_phone) {
        const p = s.restaurant_phone.replace(/\D/g, "");
        setRestaurantPhone(p);
        setNewRestPhone(p);
      }
    });
  }, []);

  function cleared() {
    return new Set(JSON.parse(localStorage.getItem("r_cleared") || "[]"));
  }

  async function load() {
    const { data } = await supabase.from("orders").select("*").order("created_at", { ascending: false });
    if (data) {
      const c = cleared();
      setOrders(data.filter((o) => !c.has(o.id)));
    }
  }

  useEffect(() => {
    if (!auth) return;
    load();
    const ch = supabase.channel("rst-orders")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, load)
      .subscribe();
    pollRef.current = setInterval(load, 10000);
    return () => { supabase.removeChannel(ch); clearInterval(pollRef.current); };
  }, [auth]);

  async function advance(id, status) {
    const next = { new: "preparing", preparing: "ready" };
    if (!next[status]) return;
    await supabase.from("orders").update({ status: next[status] }).eq("id", id);
    load();
  }

  function clearDone() {
    const ids = orders.filter((o) => ["picked_up", "delivered"].includes(o.status)).map((o) => o.id);
    if (!ids.length) return;
    const next = new Set([...cleared(), ...ids]);
    localStorage.setItem("r_cleared", JSON.stringify([...next]));
    setOrders((prev) => prev.filter((o) => !ids.includes(o.id)));
  }

  async function saveSettings() {
    const p = newRestPhone.replace(/\D/g, "");
    const errZone  = await putSetting("restaurant_zone", newZone);
    const errPhone = p ? await putSetting("restaurant_phone", p) : null;
    if (errZone || errPhone) {
      alert(`Save failed: ${(errZone || errPhone).message}`);
      return;
    }
    setRestaurantZone(newZone);
    if (p) setRestaurantPhone(p);
    setShowSettings(false);
    alert(`✅ Saved! Zone: ${newZone}${p ? ` · Phone: ${p}` : ""}`);
  }

  if (!auth) return (
    <PinGate title="🍳 Kitchen Login" correctPin={correctPin} onAuth={() => setAuth(true)} />
  );

  const active = orders.filter((o) => !["picked_up", "delivered"].includes(o.status));
  const done   = orders.filter((o) => ["picked_up",  "delivered"].includes(o.status));

  const statusBadge = {
    new:       <span className="badge new">🆕 New</span>,
    preparing: <span className="badge prep">👨‍🍳 Preparing</span>,
    ready:     <span className="badge ready">✅ Ready!</span>,
  };

  const nextBtn = {
    new:       "→ Start Preparing",
    preparing: "→ Ready for Pickup",
  };

  return (
    <div className="app">
      <header className="hdr">
        <div className="hdr-row">
          <h1>🍳 {RESTAURANT.name}</h1>
          <div className="hdr-actions">
            {done.length > 0 && <button className="btn-sm danger" onClick={clearDone}>🗑️ Clear</button>}
            <button className="btn-sm" onClick={() => setShowSettings((s) => !s)}>⚙️</button>
          </div>
        </div>
        <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", marginTop:6}}>
          <p className="sub" style={{margin:0}}>Kitchen · {restaurantZone} · Active: {active.length}</p>
          <button className="btn-wa-sm" onClick={async () => {
            const s = await getSettings();
            const phone = s.active_driver_phone
              ? s.active_driver_phone.replace(/\D/g, "")
              : driverPhone;
            if (!phone) { alert("No driver phone saved yet."); return; }
            window.open(waUrl(phone, `Hi Driver! 🍳 This is ${RESTAURANT.name}. Can you please contact us?`), "_blank");
          }}>
            💬 Driver
          </button>
        </div>
      </header>

      {showSettings && (
        <div className="card settings">
          <h3>Restaurant Settings</h3>
          <p className="hint">Your WhatsApp number (so the driver can reach you).</p>
          <input className="inp" value={newRestPhone} onChange={(e) => setNewRestPhone(e.target.value)} placeholder="504xxxxxxxxx" />
          <p className="hint" style={{marginTop:10}}>Your area (for delivery fee calculation).</p>
          <select className="inp" value={newZone} onChange={(e) => setNewZone(e.target.value)}>
            {RESTAURANT.zones.map((z) => (
              <option key={z} value={z}>{z}</option>
            ))}
          </select>
          <div className="row-gap">
            <button className="btn-primary" onClick={saveSettings}>Save</button>
            <button className="btn-ghost"   onClick={() => setShowSettings(false)}>Cancel</button>
          </div>
        </div>
      )}

      {orders.length === 0 && (
        <p className="empty">No orders yet — they'll appear here automatically when customers order.</p>
      )}

      {active.map((order) => (
        <div key={order.id} className={`card order ${order.status === "new" ? "order-new" : ""}`}>
          <div className="order-top">
            <strong>{order.customer_name}</strong>
            {statusBadge[order.status]}
          </div>
          {order.items && (
            <div className="items-block">
              {order.items.map((i, idx) => (
                <div key={idx} className="item-line">
                  <span className="item-qty">×{i.quantity}</span>
                  <span className="item-name">{i.name}</span>
                </div>
              ))}
            </div>
          )}
          {order.note && <div className="order-meta muted">📝 {order.note}</div>}
          <div className="order-actions">
            {nextBtn[order.status] && (
              <button className="btn-primary" onClick={() => advance(order.id, order.status)}>
                {nextBtn[order.status]}
              </button>
            )}
            {order.status === "ready" && (
              <button className="btn-wa" onClick={async () => {
                const s = await getSettings();
                const phone = s.active_driver_phone
                  ? s.active_driver_phone.replace(/\D/g, "")
                  : driverPhone;
                window.open(waUrl(phone, `Hi! Order for ${order.customer_name} is ready for pickup at ${RESTAURANT.name} 🍽️`), "_blank");
              }}>
                📲 Notify Driver
              </button>
            )}
          </div>
        </div>
      ))}

      {done.length > 0 && (
        <>
          <div className="section-label">With driver / done ({done.length})</div>
          {done.map((order) => (
            <div key={order.id} className="card order dimmed">
              <div className="order-top">
                <strong>{order.customer_name}</strong>
                <span className="badge done">✓ Gone</span>
              </div>
              {order.items && (
                <div className="order-meta">
                  {order.items.map((i) => `${i.name} ×${i.quantity}`).join(", ")}
                </div>
              )}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
