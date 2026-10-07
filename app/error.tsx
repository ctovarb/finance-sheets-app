"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("App error:", error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center bg-[#0b0b1f] p-6 text-white text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-500/10 text-3xl text-rose-400 border border-rose-500/20">
        ⚠️
      </div>
      <h2 className="mt-4 text-2xl font-bold tracking-tight text-white">Ocurrió un error</h2>
      <p className="mt-2 text-sm text-white/60">
        {error.message || "No se pudo cargar la información."}
      </p>
      {error.digest && (
        <p className="mt-1 text-[11px] text-white/40">ID: {error.digest}</p>
      )}
      <div className="mt-6 flex gap-3">
        <button
          onClick={() => reset()}
          className="rounded-2xl bg-gradient-to-r from-[#7c4dbc] to-[#9b6ad8] px-5 py-3 text-sm font-semibold text-white shadow-lg active:scale-95 transition-all"
        >
          Reintentar
        </button>
        <button
          onClick={() => {
            localStorage.clear();
            window.location.reload();
          }}
          className="rounded-2xl border border-white/10 bg-[#16162a] px-5 py-3 text-sm font-medium text-white/80 hover:text-white active:scale-95 transition-all"
        >
          Reiniciar sesión
        </button>
      </div>
    </main>
  );
}
