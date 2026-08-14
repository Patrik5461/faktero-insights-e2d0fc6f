/**
 * Vstupný bod samostatnej mobilnej aplikácie.
 *
 * Toto je tá istá appka, ktorú na webe vidno na `/app`, ale zostavená do
 * balíčka, ktorý je v telefóne. Vďaka tomu sa otvorí aj bez signálu — dovtedy
 * sa celé rozhranie ťahalo zo živého webu a bez pripojenia sa nedalo spraviť
 * nič. Dáta ďalej chodia zo Supabase (absolútna adresa, funguje z akéhokoľvek
 * pôvodu); čo sa nedá odoslať teraz, počká vo fronte.
 *
 * Router tu nie je zámerne — mobilné obrazovky prepína stav, nie adresa.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "sonner";
import { MobilnaApka } from "@/components/faktero/mobil/MobilApp";
import "@/styles.css";

const koren = document.getElementById("root");
if (!koren) throw new Error("Chýba #root");

createRoot(koren).render(
  <StrictMode>
    <MobilnaApka />
    <Toaster position="top-center" richColors closeButton />
  </StrictMode>,
);
