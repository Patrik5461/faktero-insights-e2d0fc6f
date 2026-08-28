package sk.faktero.drivedetector.core;

import static org.junit.Assert.assertEquals;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

import org.junit.Test;

/** Preklad testov vzdialenosti z iOS — tie isté čísla musia vyjsť aj tu. */
public class DistanceTest {

    private TripPoint bod(double lat, double lng) {
        return new TripPoint(lat, lng, 0, 10, null, 0);
    }

    @Test
    public void vzdialenostMedziDvomaBodmi() {
        // Bratislava → Trnava je vzdušnou čiarou zhruba 45 km.
        double metre = Distance.meters(bod(48.1486, 17.1077), bod(48.3774, 17.5872));
        assertEquals(45_000, metre, 2_000);
    }

    @Test
    public void rovnakyBodJeNulovaVzdialenost() {
        assertEquals(0, Distance.meters(bod(48.15, 17.11), bod(48.15, 17.11)), 0.0001);
    }

    @Test
    public void sucetTrasy() {
        List<TripPoint> body = Arrays.asList(bod(48.150, 17.110), bod(48.151, 17.110), bod(48.152, 17.110));
        // Tisícina stupňa zemepisnej šírky je asi 111 metrov.
        assertEquals(222, Distance.total(body), 5);
    }

    @Test
    public void jedinyBodNemaVzdialenost() {
        assertEquals(0, Distance.total(Arrays.asList(bod(48.15, 17.11))), 0.0001);
        assertEquals(0, Distance.total(new ArrayList<>()), 0.0001);
    }

    @Test
    public void priemernaRychlostSaPocitaZTrasyACasu() {
        // 45 km za pol hodinu = 90 km/h.
        BufferedTrip jazda = new BufferedTrip("x", 0, 1_800d, new ArrayList<>(), 45_000, 0, null, false);
        assertEquals(90, jazda.avgSpeedKmh(), 0.1);
    }

    @Test
    public void priemernaRychlostBezTrvaniaJeNula() {
        BufferedTrip jazda = new BufferedTrip("x", 100, 100d, new ArrayList<>(), 500, 0, null, false);
        assertEquals(0, jazda.avgSpeedKmh(), 0.0001);
    }
}
