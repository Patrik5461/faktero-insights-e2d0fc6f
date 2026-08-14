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

/**
 * Natívne veci — schovanie úvodného loga, stavový riadok, push, hlboké odkazy.
 *
 * Na webe to spúšťa koreň TanStacku, ktorý tu nie je. Bez tohto volania ostane
 * appka navždy pod úvodným logom, aj keď je rozhranie pod ním hotové.
 */
void import("@/lib/mobile/native-init")
  .then((m) => m.initNativePlatform())
  .catch(() => {
    /* na webe natívne pluginy nie sú — appka beží ďalej */
  });

/**
 * Poistka. Keby inicializácia zlyhala uprostred, logo nesmie ostať navrchu —
 * appka pod ním funguje a človek by to nemal ako zistiť.
 */
setTimeout(() => {
  void import("@capacitor/splash-screen")
    .then(({ SplashScreen }) => SplashScreen.hide())
    .catch(() => {});
}, 4000);
