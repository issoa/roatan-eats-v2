import { useState, useEffect, useRef } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

// ── Config — edit this to change restaurant / menu / PINs ───────────────────
const RESTAURANT = {
  name:        "Chicken Shack",
  emoji:       "🍗",
  tagline:     "Honduran comfort food & fresh island seafood",
  address:     "West End, Roatan",
  hours:       "Mon–Sun  10am – 9pm",
  deliveryFee: 5.00,
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
  await supabase.from("settings").upsert({ key, value });
}

// ── Root ─────────────────────────────────────────────────────────────────────
export default function App() {
  const v = view();
  if (v === "driver")     return <DriverView />;
  if (v === "restaurant") return <RestaurantView />;
  return <CustomerView />;
}

// =============================================================================
// CUSTOMER VIEW  /?
// =============================================================================
function CustomerView() {
  const [cart, setCart]       = useState({});
  const [step, setStep]       = useState("menu"); // menu | checkout | done
  const [name, setName]       = useState(() => localStorage.getItem("c_name")     || "");
  const [phone, setPhone]     = useState(() => localStorage.getItem("c_phone")    || "");
  const [where, setWhere]     = useState(() => localStorage.getItem("c_where")    || "");
  const [note, setNote]       = useState("");
  const [driverPhone, setDriverPhone] = useState("50497010106");
  const [waLink, setWaLink]   = useState("");

  useEffect(() => {
    getSettings().then((s) => {
      if (s.active_driver_phone) setDriverPhone(s.active_driver_phone.replace(/\D/g, ""));
    });
  }, []);

  const categories = [...new Set(RESTAURANT.menu.map((i) => i.category))];
  const cartItems  = RESTAURANT.menu.filter((i) => cart[i.id]);
  const subtotal   = cartItems.reduce((s, i) => s + i.price * cart[i.id], 0);
  const total      = subtotal + RESTAURANT.deliveryFee;
  const itemCount  = Object.values(cart).reduce((s, n) => s + n, 0);

  function add(id) { setCart((c) => ({ ...c, [id]: (c[id] || 0) + 1 })); }
  function rem(id) {
    setCart((c) => {
      const n = { ...c };
      if (n[id] > 1) n[id]--; else delete n[id];
      return n;
    });
  }

  function placeOrder() {
    localStorage.setItem("c_name",  name);
    localStorage.setItem("c_phone", phone);
    localStorage.setItem("c_where", where);

    const lines = cartItems
      .map((i) => `  • ${i.name} x${cart[i.id]}  ${fmt(i.price * cart[i.id])}`)
      .join("\n");

    const msg = [
      `🛵 *New Order — ${RESTAURANT.name}*`,
      ``,
      `👤 ${name}`,
      `📱 ${phone}`,
      `📍 ${where}`,
      note ? `📝 ${note}` : null,
      ``,
      `*Order:*`,
      lines,
      ``,
      `Subtotal:  ${fmt(subtotal)}`,
      `Delivery:  ${fmt(RESTAURANT.deliveryFee)}`,
      `*TOTAL:    ${fmt(total)}*`,
      ``,
      `⏰ ${clock()}`,
    ].filter((l) => l !== null).join("\n");

    supabase.from("orders").insert({
      customer_name:    name.trim(),
      customer_phone:   phone.trim(),
      delivery_address: where.trim(),
      note:             note.trim(),
      items:            cartItems.map((i) => ({ id: i.id, name: i.name, price: i.price, quantity: cart[i.id] })),
      subtotal,
      delivery_fee:     RESTAURANT.deliveryFee,
      total,
      status:           "new",
      restaurant:       RESTAURANT.name,
      order_time:       clock(),
    });

    setWaLink(waUrl(driverPhone, msg));
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
          📲 Send Order via WhatsApp
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
        <div className="row muted"><span>Delivery fee</span><span>{fmt(RESTAURANT.deliveryFee)}</span></div>
        <div className="row grand"><span>Total</span><strong>{fmt(total)}</strong></div>
      </div>

      <div className="card">
        <h3>Your Details</h3>
        <input  className="inp" placeholder="Your name *"              value={name}  onChange={(e) => setName(e.target.value)} />
        <input  className="inp" placeholder="Your WhatsApp number"     value={phone} onChange={(e) => setPhone(e.target.value)} />
        <textarea className="inp" rows={3}
          placeholder="Where to deliver? (e.g. Blue Parrot bungalow 3, near the dock) *"
          value={where} onChange={(e) => setWhere(e.target.value)} />
        <textarea className="inp" rows={2}
          placeholder="Any notes? (optional)"
          value={note} onChange={(e) => setNote(e.target.value)} />
        <button
          className="btn-primary full"
          disabled={!name.trim() || !where.trim()}
          onClick={placeOrder}
        >
          📲 Send Order via WhatsApp
        </button>
      </div>
    </div>
  );

  // ── Menu ────────────────────────────────────────────────────────────────────
  return (
    <div className="app">
      <header className="hdr">
        <h1>{RESTAURANT.emoji} {RESTAURANT.name}</h1>
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
          <span>{itemCount} item{itemCount !== 1 ? "s" : ""} · {fmt(total)}</span>
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
  const [auth, setAuth]           = useState(false);
  const [correctPin, setCorrectPin] = useState(RESTAURANT.driverPin);
  const [orders, setOrders]       = useState([]);
  const [driverPhone, setDriverPhone] = useState("");
  const [newPhone, setNewPhone]   = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const pollRef = useRef(null);

  useEffect(() => {
    getSettings().then((s) => {
      if (s.driver_pin)         setCorrectPin(s.driver_pin);
      if (s.active_driver_phone) {
        const p = s.active_driver_phone.replace(/\D/g, "");
        setDriverPhone(p);
        setNewPhone(p);
        putSetting("active_driver_phone", p); // keep fresh on login
      }
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
    await putSetting("active_driver_phone", p);
    setDriverPhone(p);
    setShowSettings(false);
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
                📲 WhatsApp
              </a>
            )}
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
  const [auth, setAuth]           = useState(false);
  const [correctPin, setCorrectPin] = useState(RESTAURANT.kitchenPin);
  const [orders, setOrders]       = useState([]);
  const [driverPhone, setDriverPhone] = useState("50497010106");
  const pollRef = useRef(null);

  useEffect(() => {
    getSettings().then((s) => {
      if (s.restaurant_pin)      setCorrectPin(s.restaurant_pin);
      if (s.active_driver_phone) setDriverPhone(s.active_driver_phone.replace(/\D/g, ""));
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
          {done.length > 0 && <button className="btn-sm danger" onClick={clearDone}>🗑️ Clear</button>}
        </div>
        <p className="sub">Kitchen · Active: {active.length}</p>
      </header>

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
              <a className="btn-wa"
                href={waUrl(driverPhone, `Hi! Order for ${order.customer_name} is ready for pickup at ${RESTAURANT.name} 🍽️`)}
                target="_blank" rel="noreferrer">
                📲 Notify Driver
              </a>
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
