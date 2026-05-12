"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save, Plus, Trash2, HelpCircle } from "lucide-react";
import Link from "next/link";
import api, { API_URL, getAuthHeaders } from "@/lib/api";

export default function CreateTemplatePage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [category, setCategory] = useState("UTILITY");
  const [language, setLanguage] = useState("en_US");
  
  // Component states
  const [headerType, setHeaderType] = useState<"NONE" | "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT">("NONE");
  const [headerText, setHeaderText] = useState("");
  
  const [bodyText, setBodyText] = useState("");
  const [bodyVariables, setBodyVariables] = useState<string[]>([]);
  
  const [footerText, setFooterText] = useState("");
  
  const [buttons, setButtons] = useState<any[]>([]);
  
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Dynamic variable detection
  const handleBodyChange = (text: string) => {
    setBodyText(text);
    const matches = text.match(/{{(\d+)}}/g);
    if (matches) {
      const uniqueVars = Array.from(new Set(matches));
      // Update variables array keeping existing values
      setBodyVariables(prev => {
        const next = [...prev];
        next.length = uniqueVars.length;
        return next.fill("", prev.length);
      });
    } else {
      setBodyVariables([]);
    }
  };

  const addQuickReply = () => {
    if (buttons.length >= 3) return;
    setButtons([...buttons, { type: "QUICK_REPLY", text: "" }]);
  };

  const addUrlButton = () => {
    if (buttons.length >= 3) return;
    setButtons([...buttons, { type: "URL", text: "", url: "" }]);
  };

  const removeButton = (idx: number) => {
    setButtons(buttons.filter((_, i) => i !== idx));
  };

  const updateButton = (idx: number, field: string, val: string) => {
    const next = [...buttons];
    next[idx][field] = val;
    setButtons(next);
  };

  const handleSubmit = async () => {
    if (!name || !bodyText) {
      setError("Name and Body are required.");
      return;
    }
    
    // Construct components array
    const components = [];
    
    if (headerType !== "NONE") {
      if (headerType === "TEXT") {
        components.push({ type: "HEADER", format: "TEXT", text: headerText });
      } else {
        components.push({ type: "HEADER", format: headerType });
      }
    }
    
    const bodyComponent: any = {
      type: "BODY",
      text: bodyText
    };
    
    if (bodyVariables.length > 0) {
      bodyComponent.example = {
        body_text: [bodyVariables]
      };
    }
    components.push(bodyComponent);
    
    if (footerText) {
      components.push({ type: "FOOTER", text: footerText });
    }
    
    if (buttons.length > 0) {
      components.push({
        type: "BUTTONS",
        buttons: buttons.map(b => {
          if (b.type === "URL") {
            // Check if URL has variables (simplified)
            if (b.url.includes("{{1}}")) {
              return { ...b, example: [ b.url.replace("{{1}}", "") || "https://example.com" ] };
            }
          }
          return b;
        })
      });
    }

    setSubmitting(true);
    setError(null);
    try {
      const authHeaders = await getAuthHeaders();
      const res = await fetch(`${API_URL}/api/v1/templates`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({
          name: name.toLowerCase().replace(/[^a-z0-9_]/g, ""),
          category,
          language,
          components
        })
      });
      
      if (!res.ok) {
        throw new Error(await res.text());
      }
      
      router.push("/dashboard/templates");
    } catch (err: any) {
      setError(err.message || "Failed to submit template");
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 pb-24">
      <div className="flex items-center gap-4 mb-8">
        <Link href="/dashboard/templates" className="p-2 bg-white rounded-full shadow-sm hover:bg-gray-50 text-gray-600">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Create WhatsApp Template</h1>
          <p className="text-gray-500">Design your message template for Meta verification.</p>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 p-4 rounded-xl mb-6 border border-red-100 flex items-start gap-3">
          <HelpCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <p className="text-sm font-medium">{error}</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* LEFT FORM */}
        <div className="md:col-span-2 space-y-6">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
            <h3 className="text-lg font-semibold border-b pb-2">Basic Info</h3>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Template Name *</label>
              <input 
                type="text" 
                value={name} 
                onChange={e => setName(e.target.value.toLowerCase().replace(/ /g, "_"))}
                placeholder="e.g. order_update_1"
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
              />
              <p className="text-xs text-gray-500 mt-1">Lowercase alphanumeric and underscores only. No spaces.</p>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category *</label>
                <select value={category} onChange={e => setCategory(e.target.value)} className="w-full px-4 py-2 border rounded-lg outline-none bg-white">
                  <option value="MARKETING">Marketing</option>
                  <option value="UTILITY">Utility</option>
                  <option value="AUTHENTICATION">Authentication</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Language *</label>
                <select value={language} onChange={e => setLanguage(e.target.value)} className="w-full px-4 py-2 border rounded-lg outline-none bg-white">
                  <option value="en_US">English (US)</option>
                  <option value="en_GB">English (UK)</option>
                  <option value="hi">Hindi</option>
                  <option value="ta">Tamil</option>
                </select>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
            <h3 className="text-lg font-semibold border-b pb-2">Components</h3>
            
            {/* HEADER */}
            <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
              <div className="flex justify-between items-center mb-2">
                <label className="font-medium text-gray-900">Header (Optional)</label>
                <select value={headerType} onChange={e => setHeaderType(e.target.value as any)} className="text-sm px-2 py-1 border rounded bg-white">
                  <option value="NONE">None</option>
                  <option value="TEXT">Text</option>
                  <option value="IMAGE">Image</option>
                  <option value="VIDEO">Video</option>
                  <option value="DOCUMENT">Document</option>
                </select>
              </div>
              {headerType === "TEXT" && (
                <input type="text" value={headerText} onChange={e => setHeaderText(e.target.value)} placeholder="Header text (e.g. Update Alert)" maxLength={60} className="w-full px-3 py-2 border rounded-lg mt-2 text-sm" />
              )}
            </div>

            {/* BODY */}
            <div>
              <label className="font-medium text-gray-900 block mb-1">Body Text *</label>
              <textarea 
                value={bodyText}
                onChange={e => handleBodyChange(e.target.value)}
                rows={5}
                placeholder="Hello {{1}}, your package has been shipped via {{2}}."
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 outline-none resize-none"
              />
              
              {/* VARIABLE EXAMPLES */}
              {bodyVariables.length > 0 && (
                <div className="mt-3 p-4 bg-blue-50 border border-blue-100 rounded-xl">
                  <h4 className="text-sm font-semibold text-blue-900 mb-2">Provide examples for variables</h4>
                  <p className="text-xs text-blue-700 mb-3">Meta requires realistic examples for {{}} variables to approve the template.</p>
                  <div className="space-y-2">
                    {bodyVariables.map((val, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <span className="text-sm font-medium text-blue-800 w-12">{`{{${i+1}}}`}</span>
                        <input 
                          type="text" 
                          value={val} 
                          onChange={e => {
                            const next = [...bodyVariables];
                            next[i] = e.target.value;
                            setBodyVariables(next);
                          }}
                          placeholder={`Example for {{${i+1}}}`}
                          className="flex-1 px-3 py-1.5 text-sm border border-blue-200 rounded outline-none"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* FOOTER */}
            <div>
              <label className="font-medium text-gray-900 block mb-1">Footer (Optional)</label>
              <input type="text" value={footerText} onChange={e => setFooterText(e.target.value)} placeholder="Small grey text at bottom (e.g. Thanks for choosing us)" maxLength={60} className="w-full px-4 py-2 border rounded-lg text-sm outline-none" />
            </div>

            {/* BUTTONS */}
            <div className="pt-2">
              <div className="flex justify-between items-center mb-3">
                <label className="font-medium text-gray-900">Buttons (Max 3)</label>
                <div className="flex gap-2">
                  <button onClick={addQuickReply} disabled={buttons.length >= 3} className="text-xs bg-gray-100 hover:bg-gray-200 px-2 py-1 rounded font-medium disabled:opacity-50">
                    + Quick Reply
                  </button>
                  <button onClick={addUrlButton} disabled={buttons.length >= 3} className="text-xs bg-gray-100 hover:bg-gray-200 px-2 py-1 rounded font-medium disabled:opacity-50">
                    + URL Button
                  </button>
                </div>
              </div>
              
              <div className="space-y-3">
                {buttons.map((b, i) => (
                  <div key={i} className="flex items-center gap-2 bg-gray-50 p-3 rounded-lg border border-gray-200">
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-gray-500 uppercase w-24">{b.type.replace("_", " ")}</span>
                        <input type="text" value={b.text} onChange={e => updateButton(i, "text", e.target.value)} placeholder="Button Text (e.g. Yes)" className="flex-1 px-2 py-1 text-sm border rounded" />
                      </div>
                      {b.type === "URL" && (
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-gray-500 w-24">Link URL</span>
                          <input type="text" value={b.url} onChange={e => updateButton(i, "url", e.target.value)} placeholder="https://..." className="flex-1 px-2 py-1 text-sm border rounded text-blue-600" />
                        </div>
                      )}
                    </div>
                    <button onClick={() => removeButton(i)} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded">
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
                {buttons.length === 0 && (
                  <p className="text-sm text-gray-400 italic">No buttons added.</p>
                )}
              </div>
            </div>

          </div>
        </div>

        {/* RIGHT PREVIEW */}
        <div>
          <div className="sticky top-6">
            <h3 className="font-medium text-gray-900 mb-4">Preview</h3>
            <div className="bg-[#e5ddd5] p-4 rounded-3xl shadow-inner relative overflow-hidden" style={{ minHeight: '400px' }}>
              {/* WhatsApp Message Bubble */}
              <div className="bg-white rounded-xl rounded-tl-none p-3 shadow-sm relative z-10 max-w-[85%] text-[15px] leading-relaxed">
                
                {headerType === "TEXT" && headerText && (
                  <p className="font-bold text-gray-900 mb-1">{headerText}</p>
                )}
                {headerType !== "NONE" && headerType !== "TEXT" && (
                  <div className="w-full h-24 bg-gray-200 rounded flex items-center justify-center mb-2">
                    <span className="text-xs text-gray-500 font-medium uppercase">{headerType}</span>
                  </div>
                )}
                
                <p className="text-gray-800 whitespace-pre-wrap break-words">
                  {bodyText || "Message body will appear here"}
                </p>
                
                {footerText && (
                  <p className="text-xs text-gray-500 mt-2">{footerText}</p>
                )}
                
                <div className="text-[10px] text-gray-400 text-right mt-1">12:00 PM</div>
              </div>

              {/* Buttons Preview */}
              {buttons.length > 0 && (
                <div className="mt-2 space-y-1 relative z-10 max-w-[85%]">
                  {buttons.map((b, i) => (
                    <div key={i} className="bg-white text-blue-500 text-center py-2.5 rounded-xl shadow-sm text-sm font-medium">
                      {b.text || "Button"}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button 
              onClick={handleSubmit} 
              disabled={submitting}
              className="w-full mt-6 bg-green-600 text-white font-medium py-3 rounded-xl hover:bg-green-700 transition-colors shadow-sm disabled:opacity-70 flex items-center justify-center gap-2"
            >
              <Save size={18} />
              {submitting ? "Submitting to Meta..." : "Submit Template"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
