import { useState } from "react";
import { confirmSparkRefill } from "@/lib/membershipApi";

export default function SparkRefillSuccess() {
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState("Confira a recarga para atualizar seu saldo.");
  const [credited, setCredited] = useState(false);

  async function verify() {
    const id = new URLSearchParams(window.location.search).get("session_id");
    if (!id) { setStatus("Consulte o saldo para conferir o crédito."); return; }
    setPending(true);
    try {
      const result = await confirmSparkRefill(id);
      setCredited(result.credited);
      setStatus(result.credited ? "Recarga confirmada. Seus Sparks estão no saldo."
        : "A confirmação ainda está pendente.");
    } catch {
      setStatus("A recarga ainda não pôde ser confirmada. Tente novamente.");
    } finally {
      setPending(false);
    }
  }

  return <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-4 px-6">
    <h1 className="text-2xl font-semibold">Recarga de Sparks</h1>
    <p role="status">{status}</p>
    {!credited && <button type="button" disabled={pending} onClick={() => void verify()} className="w-fit rounded-lg bg-orange-300 px-4 py-3 font-semibold text-black">
      {pending ? "Conferindo…" : "Conferir recarga"}
    </button>}
    <a href="/billing" className="inline-flex min-h-11 items-center underline">Ver saldo</a>
  </main>;
}
