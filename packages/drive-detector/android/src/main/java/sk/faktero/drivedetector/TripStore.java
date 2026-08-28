package sk.faktero.drivedetector;

import android.content.Context;
import android.content.SharedPreferences;

import java.util.ArrayList;
import java.util.List;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import sk.faktero.drivedetector.core.BufferedTrip;
import sk.faktero.drivedetector.core.Classification;
import sk.faktero.drivedetector.core.DetectorConfig;
import sk.faktero.drivedetector.core.TripPoint;

/**
 * Čo musí prežiť zabitie appky.
 *
 * Detekcia beží v službe, ktorú systém pokojne zabije a znova spustí uprostred
 * jazdy. Bez uloženia by sa rozpracovaná jazda stratila a človek by po
 * príchode našiel prázdnu knihu jázd. Ukladá sa preto po každom bode.
 *
 * `SharedPreferences` a nie databáza zámerne: zápisov je málo (raz za ~30 m),
 * dáta sú malé a čítať sa musia aj vtedy, keď appka práve štartuje na pozadí a
 * nič iné ešte nebeží.
 */
public final class TripStore {

    private static final String SUBOR = "sk.faktero.drivedetector";
    private static final String K_CONFIG = "config";
    private static final String K_AKTIVNA = "aktivna";
    private static final String K_NEVYRIESENE = "nevyriesene";
    private static final String K_DEBOUNCE = "debounce";
    private static final String K_MONITORING = "monitoring";
    private static final String K_TEXTY = "texty";
    private static final String K_DIAG = "diagnostika";

    private final SharedPreferences prefs;

    public TripStore(Context context) {
        this.prefs = context.getApplicationContext().getSharedPreferences(SUBOR, Context.MODE_PRIVATE);
    }

    // ── Nastavenia ─────────────────────────────────────────────────────────

    public DetectorConfig nacitajConfig() {
        DetectorConfig c = new DetectorConfig();
        String raw = prefs.getString(K_CONFIG, null);
        if (raw == null) return c;
        try {
            JSONObject j = new JSONObject(raw);
            c.speedThresholdKmh = j.optDouble("speedThresholdKmh", c.speedThresholdKmh);
            c.sustainedSeconds = j.optDouble("sustainedSeconds", c.sustainedSeconds);
            c.minConsecutiveFixes = j.optInt("minConsecutiveFixes", c.minConsecutiveFixes);
            c.maxAccuracyMeters = j.optDouble("maxAccuracyMeters", c.maxAccuracyMeters);
            c.debounceMinutes = j.optDouble("debounceMinutes", c.debounceMinutes);
            c.stopSpeedKmh = j.optDouble("stopSpeedKmh", c.stopSpeedKmh);
            c.stopAfterSeconds = j.optDouble("stopAfterSeconds", c.stopAfterSeconds);
            c.distanceFilterMeters = j.optDouble("distanceFilterMeters", c.distanceFilterMeters);
        } catch (JSONException ignored) {
            // Poškodené nastavenie nesmie zhodiť detekciu — ide sa s predvolenými.
        }
        return c;
    }

    public void ulozConfig(JSONObject json) {
        prefs.edit().putString(K_CONFIG, json.toString()).apply();
    }

    /** Texty notifikácie prídu z appky — natívna vrstva o slovenčine nevie. */
    public JSONObject nacitajTexty() {
        String raw = prefs.getString(K_TEXTY, null);
        if (raw == null) return null;
        try {
            return new JSONObject(raw);
        } catch (JSONException e) {
            return null;
        }
    }

    public void ulozTexty(JSONObject texty) {
        if (texty == null) return;
        prefs.edit().putString(K_TEXTY, texty.toString()).apply();
    }

    // ── Beh ────────────────────────────────────────────────────────────────

    public boolean jeMonitoring() {
        return prefs.getBoolean(K_MONITORING, false);
    }

    public void nastavMonitoring(boolean value) {
        prefs.edit().putBoolean(K_MONITORING, value).apply();
    }

    public Double nacitajDebounce() {
        double v = prefs.getFloat(K_DEBOUNCE, -1);
        return v < 0 ? null : v;
    }

    public void ulozDebounce(Double dokedy) {
        prefs.edit().putFloat(K_DEBOUNCE, dokedy == null ? -1 : dokedy.floatValue()).apply();
    }

    // ── Jazdy ──────────────────────────────────────────────────────────────

    public BufferedTrip nacitajAktivnu() {
        String raw = prefs.getString(K_AKTIVNA, null);
        if (raw == null) return null;
        try {
            return zJson(new JSONObject(raw));
        } catch (JSONException e) {
            return null;
        }
    }

    public void ulozAktivnu(BufferedTrip trip) {
        SharedPreferences.Editor e = prefs.edit();
        if (trip == null) e.remove(K_AKTIVNA);
        else e.putString(K_AKTIVNA, doJson(trip).toString());
        e.apply();
    }

    /**
     * Ukončené jazdy, ktoré si appka ešte neprevzala — od najstaršej.
     * Cez víkend ich môže byť aj desať a stratiť sa nesmie ani jedna.
     */
    public List<BufferedTrip> nacitajNevyriesene() {
        List<BufferedTrip> von = new ArrayList<>();
        String raw = prefs.getString(K_NEVYRIESENE, null);
        if (raw == null) return von;
        try {
            JSONArray pole = new JSONArray(raw);
            for (int i = 0; i < pole.length(); i++) von.add(zJson(pole.getJSONObject(i)));
        } catch (JSONException ignored) {
        }
        return von;
    }

    public void pridajNevyriesenu(BufferedTrip trip) {
        List<BufferedTrip> zoznam = nacitajNevyriesene();
        zoznam.add(trip);
        ulozNevyriesene(zoznam);
    }

    public void odoberNevyriesenu(String tripId) {
        List<BufferedTrip> zoznam = nacitajNevyriesene();
        List<BufferedTrip> zvysok = new ArrayList<>();
        for (BufferedTrip t : zoznam) if (!t.id.equals(tripId)) zvysok.add(t);
        ulozNevyriesene(zvysok);
    }

    private void ulozNevyriesene(List<BufferedTrip> zoznam) {
        JSONArray pole = new JSONArray();
        for (BufferedTrip t : zoznam) pole.put(doJson(t));
        prefs.edit().putString(K_NEVYRIESENE, pole.toString()).apply();
    }

    // ── Diagnostika ────────────────────────────────────────────────────────

    /**
     * Čo detekcia naozaj robila. Musí prežiť zabitie appky — detekcia beží aj
     * vtedy, keď appka nebeží, takže bez uloženia by v Diagnostike nebolo nikdy nič.
     */
    public JSONObject nacitajDiagnostiku() {
        String raw = prefs.getString(K_DIAG, null);
        try {
            return raw == null ? new JSONObject() : new JSONObject(raw);
        } catch (JSONException e) {
            return new JSONObject();
        }
    }

    public void ulozDiagnostiku(JSONObject diag) {
        prefs.edit().putString(K_DIAG, diag.toString()).apply();
    }

    /** Zvýši počítadlo bez toho, aby volajúci musel riešiť JSON. */
    public void pripocitaj(String kluc, int o) {
        JSONObject d = nacitajDiagnostiku();
        try {
            d.put(kluc, d.optInt(kluc, 0) + o);
            ulozDiagnostiku(d);
        } catch (JSONException ignored) {
        }
    }

    public void zapisDiag(String kluc, double hodnota) {
        JSONObject d = nacitajDiagnostiku();
        try {
            d.put(kluc, hodnota);
            ulozDiagnostiku(d);
        } catch (JSONException ignored) {
        }
    }

    // ── Prevod ─────────────────────────────────────────────────────────────

    public static JSONObject doJson(BufferedTrip t) {
        JSONObject j = new JSONObject();
        try {
            j.put("id", t.id);
            j.put("startedAt", t.startedAt);
            if (t.endedAt != null) j.put("endedAt", (double) t.endedAt);
            j.put("distanceMeters", t.distanceMeters);
            j.put("maxSpeedKmh", t.maxSpeedKmh);
            j.put("avgSpeedKmh", t.avgSpeedKmh());
            j.put("manual", t.manual);
            if (t.classification != null) j.put("classification", t.classification.kod);
            JSONArray body = new JSONArray();
            for (TripPoint p : t.points) {
                JSONObject b = new JSONObject();
                b.put("lat", p.lat);
                b.put("lng", p.lng);
                b.put("speedKmh", p.speedKmh);
                b.put("accuracy", p.accuracy);
                if (p.altitude != null) b.put("altitude", (double) p.altitude);
                b.put("timestamp", p.timestamp);
                body.put(b);
            }
            j.put("points", body);
        } catch (JSONException ignored) {
        }
        return j;
    }

    public static BufferedTrip zJson(JSONObject j) {
        List<TripPoint> body = new ArrayList<>();
        JSONArray pole = j.optJSONArray("points");
        if (pole != null) {
            for (int i = 0; i < pole.length(); i++) {
                JSONObject b = pole.optJSONObject(i);
                if (b == null) continue;
                body.add(new TripPoint(
                        b.optDouble("lat"),
                        b.optDouble("lng"),
                        b.optDouble("speedKmh"),
                        b.optDouble("accuracy"),
                        b.has("altitude") ? b.optDouble("altitude") : null,
                        b.optDouble("timestamp")));
            }
        }
        return new BufferedTrip(
                j.optString("id"),
                j.optDouble("startedAt"),
                j.has("endedAt") ? j.optDouble("endedAt") : null,
                body,
                j.optDouble("distanceMeters"),
                j.optDouble("maxSpeedKmh"),
                Classification.zKodu(j.optString("classification", null)),
                j.optBoolean("manual"));
    }
}
