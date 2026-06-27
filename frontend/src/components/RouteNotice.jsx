import React from "react";

export function RouteNotice({ title, message, actionLabel, onAction }) {
  return (
    <section className="mx-auto max-w-xl rounded-2xl border bg-white p-6 text-center shadow-sm">
      <h2 className="text-2xl font-bold">{title}</h2>
      <p className="mt-2 text-slate-600">{message}</p>
      {actionLabel && (
        <button onClick={onAction} className="mt-5 rounded-2xl bg-slate-900 px-5 py-3 font-semibold text-white">
          {actionLabel}
        </button>
      )}
    </section>
  );
}
