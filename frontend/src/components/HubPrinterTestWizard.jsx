import React, { useState } from "react";
import { X, Printer, Check, ChevronRight, Settings2, Loader2, RefreshCw } from "lucide-react";
import { testPrint } from "../utils/desktopBridge";

export default function HubPrinterTestWizard({
  isOpen,
  onClose,
  printerName,
  platform,
  onSaveProfile
}) {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const [profile, setProfile] = useState({
    defaultOrientation: 'auto',
    defaultDuplexBinding: 'auto',
    backSideRotation: 'auto',
    reversePageOrder: false,
    scaleMode: 'fit-to-page'
  });

  if (!isOpen) return null;

  const handleTestPrint = async (options) => {
    setLoading(true);
    setErrorMsg("");
    try {
      const result = await testPrint({ printerName, options });
      if (!result.success) {
        setErrorMsg(result.message || result.error || "Failed to send test print.");
      }
    } catch (err) {
      setErrorMsg(err.message || "Failed to send test print.");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setLoading(true);
    setErrorMsg("");
    try {
      await onSaveProfile(platform, printerName, profile);
      onClose();
    } catch (err) {
      setErrorMsg(err.message || "Failed to save profile.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center p-2 sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 flex h-auto max-h-[92dvh] sm:max-h-[85vh] w-full max-w-2xl flex-col rounded-t-3xl sm:rounded-3xl border border-slate-200 bg-white shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4 bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
              <Settings2 className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-800">Print Engine Test Wizard</h3>
              <p className="text-xs text-slate-500">Configuring {printerName}</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-full p-2 text-slate-400 hover:bg-slate-200">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-6" style={{ WebkitOverflowScrolling: "touch" }}>
          {errorMsg && (
            <div className="mb-4 rounded-xl bg-rose-50 p-4 text-sm font-medium text-rose-600">
              {errorMsg}
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <h4 className="text-lg font-bold">Step 1: Test Double-Sided (Long Edge)</h4>
              <p className="text-sm text-slate-600">
                Let's test how your printer physically handles two-sided documents by default. 
                Clicking the button below will print a 2-page document using Long Edge binding.
              </p>
              <button 
                onClick={() => handleTestPrint({ sides: "two_sided_long_edge", copies: 1 })}
                disabled={loading}
                className="flex items-center gap-2 rounded-xl bg-slate-100 px-4 py-3 font-semibold hover:bg-slate-200"
              >
                {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Printer className="h-5 w-5" />}
                Send Long Edge Test
              </button>
              
              <div className="mt-6 pt-4 border-t space-y-4">
                <p className="font-semibold text-sm">After printing, look at the second page on the back. Is it upside down (inverted)?</p>
                <div className="flex gap-4">
                  <button 
                    onClick={() => { setProfile(p => ({ ...p, backSideRotation: 'auto' })); setStep(2); }}
                    className="flex-1 rounded-xl border p-4 text-left hover:border-indigo-500 hover:bg-indigo-50"
                  >
                    <div className="font-bold">No, it looks perfect</div>
                    <div className="text-xs text-slate-500 mt-1">Normal behavior</div>
                  </button>
                  <button 
                    onClick={() => { setProfile(p => ({ ...p, backSideRotation: 'rotate-180' })); setStep(2); }}
                    className="flex-1 rounded-xl border p-4 text-left hover:border-indigo-500 hover:bg-indigo-50"
                  >
                    <div className="font-bold">Yes, it's upside down</div>
                    <div className="text-xs text-slate-500 mt-1">We will rotate back sides 180°</div>
                  </button>
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <h4 className="text-lg font-bold">Step 2: Page Order</h4>
              <p className="text-sm text-slate-600">
                Some printers output pages face up, causing a 3-page document to be stacked as 3, 2, 1.
              </p>
              <button 
                onClick={() => handleTestPrint({ copies: 1 })}
                disabled={loading}
                className="flex items-center gap-2 rounded-xl bg-slate-100 px-4 py-3 font-semibold hover:bg-slate-200"
              >
                {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Printer className="h-5 w-5" />}
                Send 3-Page Test
              </button>
              
              <div className="mt-6 pt-4 border-t space-y-4">
                <p className="font-semibold text-sm">How did the pages stack in the output tray?</p>
                <div className="flex gap-4">
                  <button 
                    onClick={() => { setProfile(p => ({ ...p, reversePageOrder: false })); setStep(3); }}
                    className="flex-1 rounded-xl border p-4 text-left hover:border-indigo-500 hover:bg-indigo-50"
                  >
                    <div className="font-bold">Correct order (1 on top)</div>
                  </button>
                  <button 
                    onClick={() => { setProfile(p => ({ ...p, reversePageOrder: true })); setStep(3); }}
                    className="flex-1 rounded-xl border p-4 text-left hover:border-indigo-500 hover:bg-indigo-50"
                  >
                    <div className="font-bold">Reversed (3 on top)</div>
                  </button>
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <h4 className="text-lg font-bold">Step 3: Scaling & Margins</h4>
              <p className="text-sm text-slate-600">
                Does your printer cut off the edges of documents? 
              </p>
              <div className="mt-4 flex gap-4 flex-col">
                  <label className="flex items-start gap-3 rounded-xl border p-4 hover:bg-slate-50 cursor-pointer">
                    <input type="radio" checked={profile.scaleMode === 'fit-to-page'} onChange={() => setProfile(p => ({ ...p, scaleMode: 'fit-to-page' }))} className="mt-1" />
                    <div>
                      <div className="font-bold">Fit to Page (Recommended)</div>
                      <div className="text-xs text-slate-500">Shrinks document slightly to ensure nothing is cut off</div>
                    </div>
                  </label>
                  <label className="flex items-start gap-3 rounded-xl border p-4 hover:bg-slate-50 cursor-pointer">
                    <input type="radio" checked={profile.scaleMode === 'actual-size'} onChange={() => setProfile(p => ({ ...p, scaleMode: 'actual-size' }))} className="mt-1" />
                    <div>
                      <div className="font-bold">Actual Size</div>
                      <div className="text-xs text-slate-500">Prints exact PDF size. Edges might clip if PDF has no margins.</div>
                    </div>
                  </label>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-between border-t p-4 bg-slate-50">
          <button 
            onClick={() => setStep(Math.max(1, step - 1))}
            disabled={step === 1}
            className="rounded-xl border px-4 py-2 text-sm font-semibold hover:bg-slate-100 disabled:opacity-50"
          >
            Back
          </button>
          
          {step < 3 ? (
            <button 
              onClick={() => setStep(step + 1)}
              className="flex items-center gap-1 rounded-xl bg-slate-900 px-5 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Skip
            </button>
          ) : (
            <button 
              onClick={handleSave}
              disabled={loading}
              className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Save Correction Profile
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
