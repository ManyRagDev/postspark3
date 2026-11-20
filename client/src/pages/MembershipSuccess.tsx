import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { resyncSupabaseSession } from "@/lib/authBridge";
import { confirmProCheckout, membershipCycleKey } from "@/lib/membershipApi";

export default function MembershipSuccess() {
  const [status, setStatus] = useState("Confirmando pagamento…");
  const [pending, setPending] = useState(true);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    const sessionId = new URLSearchParams(window.location.search).get("session_id");
    async function verify() {
      try {
        if (!sessionId) throw new Error("Abra esta página a partir do checkout.");
        const { active: paid } = await confirmProCheckout(sessionId);
        if (!paid) {
          if (active) setStatus("Aguardando a confirmação do pagamento. Você pode conferir novamente em instantes.");
          return;
        }
        const token = (await supabase?.auth.getSession())?.data.session?.access_token;
        if (!token) throw new Error("Entre com o mesmo e-mail usado para assinar.");
        await resyncSupabaseSession(token);
        if (!active) return;
        sessionStorage.removeItem(membershipCycleKey);
        window.history.replaceState({}, "", "/billing/success");
        window.location.replace("/thevoid");
      } catch (error) {
        if (active) setStatus(error instanceof Error ? error.message : "Não foi possível confirmar a assinatura.");
      } finally {
        if (active) setPending(false);
      }
    }
    void verify();
    return () => { active = false; };
  }, [attempt]);

  return (
    <main className="grid min-h-screen place-items-center bg-[#0d0b09] px-6 text-center text-white">
      <section className="max-w-sm">
        <h1 className="text-2xl font-semibold">Assinatura PostSpark</h1>
        <p className="mt-2 text-sm text-white/65" role="status">{status}</p>
        <p className="mt-3 text-sm text-white/65">
          O Studio e os Sparks do seu plano são liberados com o pagamento confirmado.
        </p>
        {!pending && (
          <div className="mt-6 flex flex-wrap items-center justify-center gap-4">
            <button type="button" className="rounded-full bg-[#ff5c00] px-5 py-2 font-semibold text-black"
              onClick={() => { setPending(true); setStatus("Confirmando pagamento…"); setAttempt(value => value + 1); }}>
              Conferir pagamento
            </button>
            <a href="/pricing" className="text-sm text-white/65 underline">Voltar aos planos</a>
          </div>
        )}
      </section>
    </main>
  );
}
