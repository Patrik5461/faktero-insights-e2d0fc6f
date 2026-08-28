package sk.faktero.drivedetector;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import sk.faktero.drivedetector.core.BufferedTrip;

/**
 * Natívne sa s časom pracuje v sekundách, JavaScript počíta v milisekundách.
 *
 * Prevod je na jednom mieste — iOS to isté robí v `JSMapping.swift`. Keď sa
 * niekde zabudne, jazda dostane dátum v januári 1970 a trvanie tisíckrát
 * kratšie. V knihe jázd to potom vyzerá ako pokazené dáta a príčina sa hľadá
 * všade inde, len nie na mostíku.
 *
 * V úložisku ostávajú sekundy — to, čo počíta jadro detekcie, sa nemení.
 */
final class JsPrevod {

    private JsPrevod() {
    }

    /** Kľúče denníka, ktoré nesú čas. Zvyšok sú počty a rýchlosti. */
    private static final String[] CASY = {
            "poslednePrebudenie",
            "posledneNeuspesne",
            "poslednaJazda",
            "poslednyFix",
    };

    static double milis(double sekundy) {
        return Math.round(sekundy * 1000d);
    }

    /** Jazda pre JavaScript: tá istá jazda, len s časmi v milisekundách. */
    static JSONObject jazda(BufferedTrip t) {
        JSONObject j = TripStore.doJson(t);
        try {
            j.put("startedAt", milis(j.optDouble("startedAt", 0)));
            if (j.has("endedAt") && !j.isNull("endedAt")) {
                j.put("endedAt", milis(j.optDouble("endedAt")));
            }
            JSONArray body = j.optJSONArray("points");
            for (int i = 0; body != null && i < body.length(); i++) {
                JSONObject b = body.optJSONObject(i);
                if (b == null) continue;
                b.put("timestamp", milis(b.optDouble("timestamp", 0)));
            }
        } catch (JSONException ignored) {
        }
        return j;
    }

    /** Denník diagnostiky. Mení sa priamo — je to čerstvo načítaná kópia. */
    static JSONObject dennik(JSONObject d) {
        for (String kluc : CASY) {
            if (!d.has(kluc)) continue;
            try {
                d.put(kluc, milis(d.optDouble(kluc, 0)));
            } catch (JSONException ignored) {
            }
        }
        return d;
    }
}
