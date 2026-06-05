import { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  Zap,
  Mail,
  Lock,
  Eye,
  EyeOff,
  BarChart2,
  Receipt,
  TrendingUp,
} from "lucide-react";
import logo from "../../public/Logo-Hollow-BW-StrongerEdges.svg";

const FEATURES = [
  {
    icon: Receipt,
    text: "Track and analyze your LESCO bill history",
  },
  {
    icon: TrendingUp,
    text: "Predict upcoming electricity costs before billing day",
  },
  {
    icon: Zap,
    text: "Monitor household energy usage in real time",
  },
];

/* ─── Cursor-animation hook ─────────────────────────────────────────────── */
function useCursorAnimation(panelRef, canvasRef) {
  const state = useRef({
    mouseX: -200,
    mouseY: -200,
    ringX: -200,
    ringY: -200,
    trail: [],
    isInside: false,
    lastParticle: 0,
    rafId: null,
  });

  useEffect(() => {
    const panel = panelRef.current;
    const canvas = canvasRef.current;
    if (!panel || !canvas) return;
    const ctx = canvas.getContext("2d");

    const cursor = document.getElementById("sebps-cursor");
    const ring = document.getElementById("sebps-ring");
    const orb1 = document.getElementById("sebps-orb1");

    /* resize canvas to fill panel */
    const resize = () => {
      canvas.width = panel.offsetWidth;
      canvas.height = panel.offsetHeight;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(panel);

    /* helpers */
    const lerp = (a, b, t) => a + (b - a) * t;

    const spawnRipple = (x, y) => {
      const el = document.createElement("div");
      el.style.cssText = `
        position:absolute;left:${x - 60}px;top:${y - 60}px;
        width:120px;height:120px;border-radius:50%;
        background:rgba(96,165,250,0.07);
        transform:scale(0);pointer-events:none;z-index:3;
        animation:sebpsRipple 0.9s ease-out forwards;
      `;
      panel.appendChild(el);
      setTimeout(() => el.remove(), 950);
    };

    const spawnParticle = (x, y) => {
      const size = Math.random() * 4 + 2;
      const dx = (Math.random() - 0.5) * 24;
      const dur = 0.7 + Math.random() * 0.5;
      const el = document.createElement("div");
      el.style.cssText = `
        position:absolute;
        left:${x + dx - size / 2}px;top:${y}px;
        width:${size}px;height:${size}px;border-radius:50%;
        background:rgba(96,165,250,0.38);pointer-events:none;z-index:2;
        animation:sebpsFloat ${dur}s linear forwards;
      `;
      panel.appendChild(el);
      setTimeout(() => el.remove(), dur * 1000 + 100);
    };

    /* draw trail */
    const drawTrail = () => {
      const { trail, isInside } = state.current;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (trail.length < 2) return;

      for (let i = 1; i < trail.length; i++) {
        const t = i / trail.length;
        ctx.beginPath();
        ctx.moveTo(trail[i - 1].x, trail[i - 1].y);
        ctx.lineTo(trail[i].x, trail[i].y);
        ctx.strokeStyle = `rgba(96,165,250,${t * 0.45})`;
        ctx.lineWidth = t * 3.5;
        ctx.lineCap = "round";
        ctx.stroke();
      }

      if (isInside && trail.length > 0) {
        const head = trail[trail.length - 1];
        const grad = ctx.createRadialGradient(
          head.x,
          head.y,
          0,
          head.x,
          head.y,
          18,
        );
        grad.addColorStop(0, "rgba(96,165,250,0.22)");
        grad.addColorStop(1, "rgba(96,165,250,0)");
        ctx.beginPath();
        ctx.arc(head.x, head.y, 18, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();
      }
    };

    /* raf loop */
    const tick = () => {
      const s = state.current;
      /* age-out trail points */
      for (let i = s.trail.length - 1; i >= 0; i--) {
        s.trail[i].age++;
        if (s.trail[i].age > 18) s.trail.splice(i, 1);
      }
      /* lag ring */
      s.ringX = lerp(s.ringX, s.mouseX, 0.11);
      s.ringY = lerp(s.ringY, s.mouseY, 0.11);
      if (ring) {
        ring.style.left = s.ringX + "px";
        ring.style.top = s.ringY + "px";
      }
      drawTrail();
      s.rafId = requestAnimationFrame(tick);
    };
    state.current.rafId = requestAnimationFrame(tick);

    /* event listeners */
    const onMove = (e) => {
      const rect = panel.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const s = state.current;
      s.mouseX = x;
      s.mouseY = y;
      s.trail.push({ x, y, age: 0 });
      if (s.trail.length > 32) s.trail.shift();

      if (cursor) {
        cursor.style.left = x + "px";
        cursor.style.top = y + "px";
      }
      if (orb1) {
        const nx = (x / panel.offsetWidth - 0.5) * 40;
        const ny = (y / panel.offsetHeight - 0.5) * 40;
        orb1.style.transform = `translate(${nx}px,${ny}px)`;
      }

      const now = Date.now();
      if (now - s.lastParticle > 80) {
        spawnParticle(x, y);
        s.lastParticle = now;
      }
    };

    const onEnter = () => {
      state.current.isInside = true;
      if (cursor) cursor.style.opacity = "1";
      if (ring) ring.style.opacity = "1";
    };
    const onLeave = () => {
      state.current.isInside = false;
      state.current.mouseX = -200;
      state.current.mouseY = -200;
      if (cursor) cursor.style.opacity = "0";
      if (ring) ring.style.opacity = "0";
      if (orb1) orb1.style.transform = "translate(0,0)";
    };
    const onDown = () => {
      if (cursor) {
        cursor.style.width = "9px";
        cursor.style.height = "9px";
      }
      if (ring) {
        ring.style.width = "52px";
        ring.style.height = "52px";
        ring.style.borderColor = "rgba(96,165,250,0.9)";
      }
      spawnRipple(state.current.mouseX, state.current.mouseY);
    };
    const onUp = () => {
      if (cursor) {
        cursor.style.width = "14px";
        cursor.style.height = "14px";
      }
      if (ring) {
        ring.style.width = "36px";
        ring.style.height = "36px";
        ring.style.borderColor = "rgba(96,165,250,0.55)";
      }
    };

    panel.addEventListener("mousemove", onMove);
    panel.addEventListener("mouseenter", onEnter);
    panel.addEventListener("mouseleave", onLeave);
    panel.addEventListener("mousedown", onDown);
    panel.addEventListener("mouseup", onUp);

    return () => {
      cancelAnimationFrame(state.current.rafId);
      ro.disconnect();
      panel.removeEventListener("mousemove", onMove);
      panel.removeEventListener("mouseenter", onEnter);
      panel.removeEventListener("mouseleave", onLeave);
      panel.removeEventListener("mousedown", onDown);
      panel.removeEventListener("mouseup", onUp);
    };
  }, [panelRef, canvasRef]);
}

/* ─── Component ─────────────────────────────────────────────────────────── */
export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPw, setShowPw] = useState(false);

  const panelRef = useRef(null);
  const canvasRef = useRef(null);
  useCursorAnimation(panelRef, canvasRef);

  const set = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await login(form.email, form.password);
      navigate("/");
    } catch (err) {
      setError(err.response?.data?.detail || "Invalid email or password.");
    } finally {
      setBusy(false);
    }
  };

  /* feature hover helpers */
  const onFeatEnter = () => {
    const ring = document.getElementById("sebps-ring");
    const cursor = document.getElementById("sebps-cursor");
    if (ring) {
      ring.style.width = "48px";
      ring.style.height = "48px";
      ring.style.borderColor = "rgba(96,165,250,0.85)";
    }
    if (cursor) cursor.style.background = "#60a5fa";
  };
  const onFeatLeave = () => {
    const ring = document.getElementById("sebps-ring");
    const cursor = document.getElementById("sebps-cursor");
    if (ring) {
      ring.style.width = "36px";
      ring.style.height = "36px";
      ring.style.borderColor = "rgba(96,165,250,0.55)";
    }
    if (cursor) cursor.style.background = "#fff";
  };

  return (
    <>
      {/* ── Global keyframes injected once ─────────────────────────────── */}
      <style>{`
        @keyframes sebpsRipple {
          to { transform: scale(1); opacity: 0; }
        }
        @keyframes sebpsFloat {
          0%   { transform: translateY(0) scale(1); opacity: 0.7; }
          100% { transform: translateY(-120px) scale(0.3); opacity: 0; }
        }
        #sebps-cursor {
          position: absolute;
          width: 14px; height: 14px;
          background: #fff;
          border-radius: 50%;
          pointer-events: none;
          z-index: 10;
          opacity: 0;
          transform: translate(-50%, -50%);
          transition: opacity 0.2s, width 0.15s, height 0.15s, background 0.15s;
          box-shadow: 0 0 0 2px rgba(255,255,255,0.15);
        }
        #sebps-ring {
          position: absolute;
          width: 36px; height: 36px;
          border: 1.5px solid rgba(96,165,250,0.55);
          border-radius: 50%;
          pointer-events: none;
          z-index: 9;
          opacity: 0;
          transform: translate(-50%, -50%);
          transition: opacity 0.2s, width 0.2s, height 0.2s, border-color 0.2s;
        }
      `}</style>

      <div className="min-h-screen flex">
        {/* ── Left panel ──────────────────────────────────────────────── */}
        <div
          ref={panelRef}
          className="hidden lg:flex lg:w-[44%] xl:w-[42%] flex-col justify-between bg-[#0a0000] p-12 relative overflow-hidden"
          style={{ cursor: "none" }}
        >
          {/* Grid texture */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              backgroundImage:
                "linear-gradient(rgba(255,255,255,0.08) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.08) 1px,transparent 1px)",
              backgroundSize: "40px 40px",
            }}
          />

          {/* Glow orbs */}
          <div
            id="sebps-orb1"
            className="absolute pointer-events-none rounded-full"
            style={{
              top: -80,
              left: -80,
              width: 360,
              height: 360,
              background: "rgba(37,99,235,0.18)",
              filter: "blur(80px)",
              transition: "transform 0.6s ease",
            }}
          />
          <div
            className="absolute pointer-events-none rounded-full"
            style={{
              bottom: -60,
              right: -60,
              width: 280,
              height: 280,
              background: "rgba(96,165,250,0.09)",
              filter: "blur(70px)",
            }}
          />

          {/* Trail canvas */}
          <canvas
            ref={canvasRef}
            className="absolute inset-0 pointer-events-none"
            style={{ zIndex: 2 }}
          />

          {/* Custom cursor elements */}
          <div id="sebps-cursor" />
          <div id="sebps-ring" />

          {/* Brand */}
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-14">
              <img
                src={logo}
                alt="SEBPS Logo"
                className="w-20 h-20 invert -mr-6 shrink-0"
              />

              <div>
                <p className="text-white font-bold text-base tracking-wide">
                  SEBPS
                </p>

                <p className="text-slate-400 text-[11px] mt-0.5">
                  Smart Electricity Bill Prediction
                </p>
              </div>
            </div>

            <h2 className="text-white text-3xl font-bold leading-snug mb-3">
              Predict your bill
              <br />
              <span className="text-blue-400">before it arrives.</span>
            </h2>
            <p className="text-slate-400 text-sm leading-relaxed max-w-xs">
              SEBPS connects your LESCO history, IoT sensors, and appliance data
              to forecast your monthly bill with precision.
            </p>
          </div>

          {/* Features */}
          <div className="relative z-10 space-y-5">
            {FEATURES.map(({ icon: Icon, text }) => (
              <div
                key={text}
                className="flex items-start gap-3.5 transition-transform duration-150 hover:translate-x-1"
                onMouseEnter={onFeatEnter}
                onMouseLeave={onFeatLeave}
              >
                <div className="w-8 h-8 rounded-sm bg-slate-200 border border-blue-500/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Icon size={14} className="text-blue-slate-600" />
                </div>
                <p className="text-slate-300 text-sm leading-relaxed">{text}</p>
              </div>
            ))}
          </div>

          {/* Footer */}
          <p className="relative z-10 text-slate-600 text-xs">
            © {new Date().getFullYear()} SEBPS
          </p>
        </div>

        {/* ── Right panel (form) ──────────────────────────────────────── */}
        <div className="flex-1 flex items-center justify-center bg-slate-100 p-8">
          <div className="w-full max-w-[360px]">
            {/* Mobile brand */}
            <div className="flex items-center gap-2.5 mb-10 lg:hidden">
              <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center">
                <Zap size={17} className="text-white" />
              </div>
              <p className="font-bold text-slate-900 text-base">SEBPS</p>
            </div>

            <div className="mb-8">
              <h1 className="text-2xl font-bold text-slate-900">
                Welcome back
              </h1>
              <p className="text-slate-400 text-sm mt-1.5">
                Sign in to your account to continue
              </p>
            </div>

            {error && (
              <div className="mb-5 flex items-start gap-2.5 p-3.5 bg-red-50 border border-red-200 rounded-xl">
                <span className="text-red-500 text-xs mt-0.5">⚠</span>
                <p className="text-red-600 text-sm">{error}</p>
              </div>
            )}

            <form onSubmit={submit} className="space-y-4">
              {/* Email */}
              <div>
                <label className="label">Email address</label>
                <div className="relative">
                  <Mail
                    size={15}
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                  />
                  <input
                    type="email"
                    required
                    autoFocus
                    value={form.email}
                    onChange={set("email")}
                    placeholder="you@example.com"
                    className="input pl-10"
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label className="label">Password</label>
                <div className="relative">
                  <Lock
                    size={15}
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                  />
                  <input
                    type={showPw ? "text" : "password"}
                    required
                    value={form.password}
                    onChange={set("password")}
                    placeholder="••••••••"
                    className="input pl-10 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((p) => !p)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={busy}
                className="bg-slate-100 text-black border border-slate-800 hover:bg-black hover:text-white rounded-md transition hover:border-black w-full mt-2 py-3"
              >
                {busy ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    Signing in…
                  </span>
                ) : (
                  "Sign in"
                )}
              </button>
            </form>

            <p className="mt-6 text-center text-sm text-slate-500">
              Don't have an account?{" "}
              <Link
                to="/register"
                className="text-blue-600 font-medium hover:text-blue-700"
              >
                Create one
              </Link>
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
