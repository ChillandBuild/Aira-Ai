"use client";
import { useState, useMemo } from "react";
import Link from "next/link";
import { Copy, Download, Check, MessageCircle } from "lucide-react";

const COUNTRY_OPTIONS = [
  { code: "+91", label: "🇮🇳 India" },
  { code: "+1", label: "🇺🇸 US/Canada" },
  { code: "+44", label: "🇬🇧 UK" },
  { code: "+61", label: "🇦🇺 Australia" },
  { code: "+971", label: "🇦🇪 UAE" },
  { code: "+65", label: "🇸🇬 Singapore" },
  { code: "+81", label: "🇯🇵 Japan" },
  { code: "+49", label: "🇩🇪 Germany" },
];

function buildWaLink(country: string, phone: string, message: string): string {
  const digits = `${country}${phone}`.replace(/[^0-9]/g, "");
  const params = message.trim() ? `?text=${encodeURIComponent(message.trim())}` : "";
  return digits ? `https://wa.me/${digits}${params}` : "";
}

function qrUrl(link: string, size = 360): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=8&format=png&data=${encodeURIComponent(link)}`;
}

export default function WhatsAppLinkGeneratorPage() {
  const [country, setCountry] = useState("+91");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState(false);

  const link = useMemo(() => buildWaLink(country, phone, message), [country, phone, message]);
  const ready = link.length > 0 && phone.replace(/[^0-9]/g, "").length >= 6;

  async function copyLink() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard unavailable */
    }
  }

  function downloadQr() {
    if (!ready) return;
    const a = document.createElement("a");
    a.href = qrUrl(link, 800);
    a.download = `whatsapp-qr-${phone.replace(/[^0-9]/g, "")}.png`;
    a.target = "_blank";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_20%_-10%,#dcfce7_0%,transparent_55%),radial-gradient(circle_at_85%_110%,#cffafe_0%,transparent_55%),#ffffff]">
      <nav className="max-w-6xl mx-auto px-6 py-6 flex items-center justify-between">
        <Link href="/" className="font-bold text-xl tracking-tight text-emerald-900">
          Aira <span className="text-emerald-600">AI</span>
        </Link>
        <Link href="/auth/login" className="text-sm font-medium text-emerald-700 hover:text-emerald-900">
          Sign in →
        </Link>
      </nav>

      <section className="max-w-6xl mx-auto px-6 pt-8 pb-24 grid lg:grid-cols-[1.1fr_0.9fr] gap-12 items-start">
        <div>
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-100 text-emerald-700 text-xs font-medium mb-5">
            <MessageCircle size={12} /> Free Tool · No sign-up
          </span>
          <h1 className="font-bold text-4xl md:text-5xl tracking-tight text-emerald-950 leading-[1.05]">
            WhatsApp Link & QR<br /> Generator
          </h1>
          <p className="mt-4 text-emerald-900/70 text-lg max-w-xl leading-relaxed">
            Build a click-to-chat link with a pre-filled message. Drop it in your bio, ads, business cards,
            or print the QR for storefront displays.
          </p>

          <div className="mt-9 bg-white rounded-3xl border border-emerald-100 p-6 shadow-[0_8px_30px_rgba(16,185,129,0.08)] space-y-5">
            <div className="grid grid-cols-[140px_1fr] gap-3">
              <div>
                <label className="text-xs font-medium text-emerald-900/70 mb-1.5 block">Country</label>
                <select
                  value={country}
                  onChange={e => setCountry(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-emerald-100 bg-emerald-50/40 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                >
                  {COUNTRY_OPTIONS.map(o => (
                    <option key={o.code} value={o.code}>{o.label} {o.code}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-emerald-900/70 mb-1.5 block">WhatsApp number</label>
                <input
                  value={phone}
                  onChange={e => setPhone(e.target.value.replace(/[^0-9]/g, ""))}
                  placeholder="9876543210"
                  inputMode="numeric"
                  className="w-full px-3 py-2.5 rounded-xl border border-emerald-100 bg-emerald-50/40 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-emerald-900/70 mb-1.5 block">
                Pre-filled message <span className="text-emerald-900/40 font-normal">(optional)</span>
              </label>
              <textarea
                value={message}
                onChange={e => setMessage(e.target.value)}
                rows={3}
                placeholder="Hi! I saw your ad and would like to know more."
                className="w-full px-3 py-2.5 rounded-xl border border-emerald-100 bg-emerald-50/40 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-emerald-400"
              />
              <p className="text-[11px] text-emerald-900/50 mt-1.5">
                {message.length} / 500 — keep it short for higher reply rates.
              </p>
            </div>

            <div className="pt-2 grid grid-cols-2 gap-3">
              <button
                onClick={copyLink}
                disabled={!ready}
                className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {copied ? <><Check size={16} /> Copied</> : <><Copy size={16} /> Copy link</>}
              </button>
              <button
                onClick={downloadQr}
                disabled={!ready}
                className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-white border border-emerald-200 text-emerald-700 text-sm font-medium hover:bg-emerald-50 transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Download size={16} /> Download QR
              </button>
            </div>

            {ready && (
              <div className="pt-1">
                <p className="text-xs font-medium text-emerald-900/70 mb-1.5">Your link</p>
                <code className="block w-full px-3 py-2.5 rounded-xl bg-emerald-50 text-emerald-800 text-xs break-all border border-emerald-100">
                  {link}
                </code>
              </div>
            )}
          </div>

          <div className="mt-12 grid sm:grid-cols-3 gap-4 text-sm">
            {[
              { t: "1. Enter number", d: "Pick your country code and add your business WhatsApp number." },
              { t: "2. Write the opener", d: "Add a pre-filled greeting so customers don't have to type." },
              { t: "3. Share or print", d: "Copy the link, drop the QR on print, or paste in bio links." },
            ].map(s => (
              <div key={s.t} className="rounded-2xl border border-emerald-100 bg-white/60 backdrop-blur p-4">
                <p className="font-semibold text-emerald-900">{s.t}</p>
                <p className="text-emerald-900/70 mt-1 leading-relaxed">{s.d}</p>
              </div>
            ))}
          </div>

          <div className="mt-12 rounded-3xl border border-emerald-100 bg-white p-7">
            <h2 className="font-bold text-xl text-emerald-950">Want to track every click?</h2>
            <p className="text-emerald-900/70 mt-2 leading-relaxed">
              Aira gives you a shortened, tracked link for every outbound WhatsApp message — see which leads
              clicked, when, and auto-boost their score for your callers.
            </p>
            <Link
              href="/auth/login"
              className="inline-flex items-center gap-2 mt-4 px-5 py-2.5 rounded-xl bg-emerald-900 text-white text-sm font-medium hover:bg-emerald-950 transition"
            >
              Open Aira →
            </Link>
          </div>
        </div>

        <aside className="lg:sticky lg:top-8">
          <div className="rounded-3xl bg-white border border-emerald-100 p-7 shadow-[0_12px_40px_rgba(16,185,129,0.1)]">
            <p className="text-xs font-medium text-emerald-900/60 mb-4">QR PREVIEW</p>
            <div className="aspect-square rounded-2xl border border-emerald-100 bg-emerald-50/40 flex items-center justify-center overflow-hidden">
              {ready ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={qrUrl(link, 480)}
                  alt="WhatsApp QR code"
                  className="w-full h-full object-contain p-3"
                  loading="lazy"
                  decoding="async"
                />
              ) : (
                <div className="text-center px-6">
                  <div className="w-20 h-20 mx-auto rounded-2xl bg-emerald-100 flex items-center justify-center mb-3">
                    <MessageCircle size={32} className="text-emerald-600" />
                  </div>
                  <p className="text-sm text-emerald-900/60">Enter a phone number to generate</p>
                </div>
              )}
            </div>

            <div className="mt-5 p-4 rounded-2xl bg-emerald-50 border border-emerald-100">
              <p className="text-xs text-emerald-900/80 leading-relaxed">
                💡 <strong>Pro tip:</strong> Print the QR at storefronts so walk-ins can start a chat without typing.
                Pair it with a tracked link in Aira to see footfall convert.
              </p>
            </div>
          </div>
        </aside>
      </section>

      <footer className="border-t border-emerald-100 bg-white/60">
        <div className="max-w-6xl mx-auto px-6 py-6 text-xs text-emerald-900/60 flex flex-wrap items-center justify-between gap-3">
          <span>© {new Date().getFullYear()} Aira AI — Free WhatsApp tools</span>
          <div className="flex gap-4">
            <Link href="/" className="hover:text-emerald-900">Home</Link>
            <Link href="/auth/login" className="hover:text-emerald-900">Sign in</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
