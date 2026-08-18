import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Push a biometria bez telefónu.
 *
 * V prehliadači sa preklikať nedajú — kamera, Face ID ani APNs tam nie sú, a
 * keď sa appke nahovorí, že je natívna, spadne na chýbajúcom natívnom mostíku.
 * Overiť sa dá to podstatnejšie: **náš** kód okolo tých pluginov. Že sa token
 * odloží, keď človek ešte nie je prihlásený, a doručí sa neskôr. Že sa
 * prihlasovacie údaje pri zapnutí biometrie uložia a pri odomknutí použijú.
 *
 * Pluginy sú podstrčené — testuje sa naša logika, nie Apple.
 */

const relacia = {
  data: { session: { user: { id: "u1" }, refresh_token: "rt", access_token: "at" } },
};
const pouzivatel = { data: { user: { id: "u1" } } };

const setSession = vi.fn(async () => ({ error: null }));
const update = vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => relacia),
      getUser: vi.fn(async () => pouzivatel),
      setSession: (...a: unknown[]) => setSession(...(a as [])),
    },
    from: vi.fn(() => ({ update })),
  },
}));

const overenie = vi.fn(async () => undefined);
vi.mock("@aparajita/capacitor-biometric-auth", () => ({
  BiometricAuth: {
    checkBiometry: vi.fn(async () => ({ isAvailable: true })),
    authenticate: (...a: unknown[]) => overenie(...(a as [])),
  },
}));

const skontrolujPovolenia = vi.fn(async () => ({ receive: "prompt" }));
const vypytajPovolenia = vi.fn(async () => ({ receive: "granted" }));
const zaregistruj = vi.fn(async () => undefined);
vi.mock("@capacitor/push-notifications", () => ({
  PushNotifications: {
    checkPermissions: () => skontrolujPovolenia(),
    requestPermissions: () => vypytajPovolenia(),
    register: () => zaregistruj(),
    addListener: vi.fn(async () => ({ remove: async () => {} })),
  },
}));

// Appka sa musí považovať za natívnu, inak biometriu ani neponúkne. Ostatné
// pluginy podstrčené nie sú — ich načítanie zlyhá a úložisko spadne na
// prehliadačovú náhradu, čo testu nevadí.
vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => true, getPlatform: () => "ios" },
  registerPlugin: () => ({}),
}));

beforeEach(() => {
  const data = new Map<string, string>();
  (globalThis as any).localStorage = {
    get length() {
      return data.size;
    },
    key: (i: number) => [...data.keys()][i] ?? null,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
    clear: () => data.clear(),
  };
  vi.clearAllMocks();
});

describe("biometrické prihlásenie", () => {
  it("zapnutie si odloží prihlásenie a odomknutie ho použije", async () => {
    const { enableBiometric, isBiometricEnabled, loginWithBiometric, disableBiometric } =
      await import("./biometric");
    const { vycistiPamat } = await import("./trvale-ulozisko");
    vycistiPamat();

    expect(await isBiometricEnabled()).toBe(false);

    const zapnute = await enableBiometric();
    expect(zapnute.ok).toBe(true);
    // Pýtať sa musí ešte pri zapínaní — inak by si ho zapol ktokoľvek, komu
    // padne telefón do ruky odomknutý.
    expect(overenie).toHaveBeenCalledTimes(1);
    expect(await isBiometricEnabled()).toBe(true);

    const prihlasene = await loginWithBiometric();
    expect(prihlasene.ok).toBe(true);
    expect(setSession).toHaveBeenCalledWith({ refresh_token: "rt", access_token: "at" });

    await disableBiometric();
    expect(await isBiometricEnabled()).toBe(false);
  });

  it("bez zapnutia sa odomknúť nedá", async () => {
    const { loginWithBiometric } = await import("./biometric");
    const { vycistiPamat } = await import("./trvale-ulozisko");
    vycistiPamat();

    const r = await loginWithBiometric();
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/nie je nakonfigurovaná/i);
    expect(setSession).not.toHaveBeenCalled();
  });
});

describe("push token", () => {
  it("token doručený pred prihlásením sa odloží a pošle neskôr", async () => {
    // Token z APNs príde hneď pri štarte, často skôr, než sa človek prihlási.
    // Bez odloženia by sa stratil a notifikácie by nikdy nechodili.
    const { dorucCakajuciPushToken } = await import("./push");
    const { citaj, vycistiPamat, zapis } = await import("./trvale-ulozisko");
    vycistiPamat();

    // To isté, čo appka spraví, keď token príde pred prihlásením.
    zapis("faktero.push.cakajuci", JSON.stringify({ token: "token-123", platform: "ios" }));
    expect(citaj("faktero.push.cakajuci")).toContain("token-123");

    await dorucCakajuciPushToken();
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ push_token: "token-123", push_platform: "ios" }),
    );
    // Po doručení sa odložený token zahodí, nech sa neposiela dokola.
    expect(citaj("faktero.push.cakajuci")).toBeNull();
  });

  it("pri štarte sa appka na povolenie nepýta", async () => {
    /*
      Systémové okno o notifikáciách vyskakovalo pri prvom otvorení appky, teda
      skôr, než človek vedel, čo appka robí. „Nepovoliť" sa pritom vziať späť
      nedá — iOS sa druhýkrát nepýta. Pýta sa preto až domovská obrazovka.
    */
    const { registerPushNotifications } = await import("./push");

    const r = await registerPushNotifications({ pytatPovolenie: false });

    expect(r.ok).toBe(false);
    expect(vypytajPovolenia).not.toHaveBeenCalled();
    expect(zaregistruj).not.toHaveBeenCalled();
  });

  it("bez odloženého tokenu sa nikam nič neposiela", async () => {
    const { dorucCakajuciPushToken } = await import("./push");
    const { vycistiPamat } = await import("./trvale-ulozisko");
    vycistiPamat();

    await dorucCakajuciPushToken();
    expect(update).not.toHaveBeenCalled();
  });
});
