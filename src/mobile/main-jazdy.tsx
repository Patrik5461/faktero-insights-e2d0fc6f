/**
 * Vstupný bod samostatnej appky Kniha jázd.
 *
 * To isté, čo `main.tsx` robí pre Faktero: rovnaké obrazovky, ale zabalené do
 * vlastného balíčka a bez fakturácie. Na webe je to `/app-jazdy`, v telefóne
 * samostatná aplikácia s vlastným `appId`.
 *
 * Router tu nie je zámerne — mobilné obrazovky prepína stav, nie adresa.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "sonner";
import { ODSADENIE_TOASTOV } from "@/components/ui/sonner";
import { KnihaJazdApka } from "@/components/faktero/mobil/jazdy/KnihaJazdApka";
import "@/styles.css";

const koren = document.getElementById("root");
if (!koren) throw new Error("Chýba #root");

/**
 * Natívne úložisko sa musí načítať skôr, než sa appka spýta na prihlásenie —
 * inak by prvé čítanie vrátilo prázdno a appka by ponúkla prihlásenie aj
 * prihlásenému človeku. Strop je tam preto, aby zaseknuté úložisko nenechalo
 * appku navždy pod úvodným logom.
 */
async function spusti() {
  await Promise.race([
    import("@/lib/mobile/trvale-ulozisko").then((m) => m.pripravUlozisko()).catch(() => {}),
    new Promise((res) => setTimeout(res, 3000)),
  ]);

  createRoot(koren!).render(
    <StrictMode>
      <KnihaJazdApka />
      <Toaster
        position="top-center"
        richColors
        closeButton
        offset={ODSADENIE_TOASTOV}
        mobileOffset={ODSADENIE_TOASTOV}
      />
    </StrictMode>,
  );
}

void spusti();

/**
 * Natívne veci — schovanie úvodného loga a stavový riadok. Push tu zámerne
 * nie je: táto appka zatiaľ žiadnu notifikáciu zo servera nedostáva a pýtať
 * si povolenie, ktoré sa nepoužije, je najistejší spôsob, ako oň prísť
 * navždy — iOS sa druhýkrát nepýta.
 */
void import("@/lib/mobile/native-init")
  .then((m) => m.initNativePlatform())
  .catch(() => {
    /* na webe natívne pluginy nie sú — appka beží ďalej */
  });

/** Poistka: keby inicializácia zlyhala uprostred, logo nesmie ostať navrchu. */
setTimeout(() => {
  void import("@capacitor/splash-screen")
    .then(({ SplashScreen }) => SplashScreen.hide())
    .catch(() => {});
}, 4000);
