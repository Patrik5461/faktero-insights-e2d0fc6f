package sk.faktero.drivedetector;

import static org.junit.Assert.assertEquals;

import org.json.JSONObject;
import org.junit.Test;

import java.util.Arrays;
import java.util.Collections;

import sk.faktero.drivedetector.core.BufferedTrip;
import sk.faktero.drivedetector.core.TripPoint;

/**
 * Časy na mostíku.
 *
 * Natívne sa počíta v sekundách, JavaScript v milisekundách. Keď sa prevod
 * vynechá, appka dostane jazdu z 21. januára 1970 s trvaním pár sekúnd —
 * a v knihe jázd to vyzerá ako pokazená databáza, nie ako chyba v prevode.
 */
public class JsPrevodTest {

    private static final double ZACIATOK = 1_787_947_000d; // 2026-08-28, v sekundách

    @Test
    public void jazdaChodiVMilisekundach() {
        BufferedTrip t = new BufferedTrip("x", ZACIATOK, ZACIATOK + 600, Arrays.asList(
                new TripPoint(48.1, 17.1, 60, 5, null, ZACIATOK),
                new TripPoint(48.2, 17.2, 80, 5, null, ZACIATOK + 600)),
                12000, 90, null, false);

        JSONObject j = JsPrevod.jazda(t);

        assertEquals(ZACIATOK * 1000, j.optDouble("startedAt"), 0.5);
        assertEquals((ZACIATOK + 600) * 1000, j.optDouble("endedAt"), 0.5);
        assertEquals(ZACIATOK * 1000, j.optJSONArray("points").optJSONObject(0).optDouble("timestamp"), 0.5);
        // Vzdialenosť je v metroch a prevodom prejsť nesmie.
        assertEquals(12000, j.optDouble("distanceMeters"), 0.5);
    }

    @Test
    public void dennikPrepocitaLenCasy() throws Exception {
        JSONObject d = new JSONObject();
        d.put("poslednaJazda", ZACIATOK);
        d.put("poslednePrebudenie", ZACIATOK - 60);
        d.put("prebudeni", 7);
        d.put("najvyssiaRychlost", 92.5);

        JSONObject von = JsPrevod.dennik(d);

        assertEquals(ZACIATOK * 1000, von.optDouble("poslednaJazda"), 0.5);
        assertEquals((ZACIATOK - 60) * 1000, von.optDouble("poslednePrebudenie"), 0.5);
        assertEquals(7, von.optInt("prebudeni"));
        assertEquals(92.5, von.optDouble("najvyssiaRychlost"), 0.001);
    }

    @Test
    public void jazdaBezKoncaOKoniecNepride() {
        BufferedTrip t = new BufferedTrip("y", ZACIATOK, null, Collections.emptyList(), 0, 0, null, true);
        JSONObject j = JsPrevod.jazda(t);
        assertEquals(ZACIATOK * 1000, j.optDouble("startedAt"), 0.5);
        assertEquals(false, j.has("endedAt"));
    }
}
