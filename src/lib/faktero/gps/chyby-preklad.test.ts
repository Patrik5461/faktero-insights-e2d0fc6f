import { describe, expect, it } from "vitest";
import { preloz } from "@/lib/i18n/jazyk";
import { prelozChybuGps } from "./chyby-preklad";

const t = (jazyk: "sk" | "de" | "cs") => (text: string, p?: Record<string, string | number>) =>
  preloz(jazyk, text, p);

describe("preklad chýb poskytovateľov GPS", () => {
  it("pevnú vetu preloží zo slovníka", () => {
    expect(prelozChybuGps("Samsara je nedostupná.", t("de"))).toBe("Samsara ist nicht erreichbar.");
    expect(prelozChybuGps("Samsara je nedostupná.", t("cs"))).toBe("Samsara je nedostupná.");
    expect(prelozChybuGps("GPS Dozor odmietol prihlasovacie meno alebo heslo.", t("cs"))).toBe(
      "GPS Dozor odmítl přihlašovací jméno nebo heslo.",
    );
  });

  it("vetu so stavom alebo kódom preloží podľa vzoru", () => {
    expect(prelozChybuGps("Geotab odpovedal stavom 503.", t("de"))).toBe(
      "Geotab antwortete mit Status 503.",
    );
    expect(prelozChybuGps("Traccar vrátil chybu 500: Internal error.", t("de"))).toBe(
      "Traccar meldete einen Fehler 500: Internal error.",
    );
    expect(
      prelozChybuGps(
        "Webfleet dovoľuje túto požiadavku len raz za 60 s. Skúste to o chvíľu znova.",
        t("cs"),
      ),
    ).toBe("Webfleet povoluje tento požadavek jen jednou za 60 s. Zkuste to za chvíli znovu.");
  });

  it("v slovenčine a pri neznámej vete nechá text tak, ako prišiel", () => {
    expect(prelozChybuGps("Geotab odpovedal stavom 503.", t("sk"))).toBe(
      "Geotab odpovedal stavom 503.",
    );
    expect(prelozChybuGps("Niečo úplne iné.", t("de"))).toBe("Niečo úplne iné.");
    expect(prelozChybuGps(null, t("sk"))).toBe("Chyba");
  });
});
