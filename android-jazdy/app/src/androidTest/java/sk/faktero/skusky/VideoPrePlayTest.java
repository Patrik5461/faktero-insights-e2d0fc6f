package sk.faktero.skusky;

import static org.junit.Assert.assertTrue;

import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.os.Bundle;
import android.os.ParcelFileDescriptor;
import android.os.SystemClock;
import android.util.Log;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.uiautomator.By;
import androidx.test.uiautomator.BySelector;
import androidx.test.uiautomator.UiDevice;
import androidx.test.uiautomator.UiObject2;
import androidx.test.uiautomator.Until;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.util.List;
import java.util.regex.Pattern;
import org.junit.Before;
import org.junit.FixMethodOrder;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.junit.runners.MethodSorters;

/**
 * Video pre Google Play — deklarácia „poloha na pozadí“ a „služba v popredí“.
 *
 * Nič neoveruje, len pomaly prejde to, čo musí recenzent vidieť: prihlásenie,
 * zapnutie rozpoznávania jázd používateľom, systémové povolenia (aj „Vždy“),
 * trvalú notifikáciu služby a zapísanú jazdu s kilometrami a trasou.
 * Firebase Test Lab beh nahráva, video je výsledok.
 *
 * Argumenty (Test Lab `--environment-variables`, v kóde nie sú):
 * `email`, `heslo` — účet pre recenzenta; `trasa` — regulárny výraz riadku
 * jazdy, ktorá má uloženú trasu (napr. „Trnava.*Modra“).
 */
@RunWith(AndroidJUnit4.class)
@FixMethodOrder(MethodSorters.NAME_ASCENDING)
public class VideoPrePlayTest {

    private static final String LOG = "VideoPrePlay";
    private static final long CAKANIE_MS = 60_000;
    /** Pauza medzi krokmi, aby sa video dalo čítať. */
    private static final long PAUZA_MS = 4_000;

    private static final String[] POVOLENIA = {
        "android.permission.ACCESS_BACKGROUND_LOCATION",
        "android.permission.ACCESS_FINE_LOCATION",
        "android.permission.ACCESS_COARSE_LOCATION",
        "android.permission.POST_NOTIFICATIONS",
        "android.permission.ACTIVITY_RECOGNITION",
        "android.permission.CAMERA",
    };

    private UiDevice zariadenie;
    private String balik;
    private Bundle argumenty;

    @Before
    public void priprav() {
        zariadenie = UiDevice.getInstance(InstrumentationRegistry.getInstrumentation());
        balik = InstrumentationRegistry.getInstrumentation().getTargetContext().getPackageName();
        argumenty = InstrumentationRegistry.getArguments();
    }

    /**
     * Test Lab pri inštalácii povolí appke všetko (`pm install -g`), recenzent
     * ale musí vidieť systémové otázky. `pm revoke` zabije proces appky — a s ním
     * aj tento test, ktorý beží v ňom. Preto sa odoberá v samostatnej metóde
     * cez odpojený shell a test sa púšťa s orchestrátorom: táto metóda „spadne“.
     * Každé ďalšie odobratie zabije aj práve bežiacu metódu, preto po nej idú
     * prázdne čakacie metódy `b*`, ktoré tie zásahy pochytajú, a `z_video`
     * beží v novom procese už bez povolení.
     */
    @Test
    public void a_odoberPovolenia() throws Exception {
        StringBuilder prikaz = new StringBuilder("(sleep 2; ");
        for (String p : POVOLENIA) {
            prikaz.append("pm revoke ").append(balik).append(' ').append(p).append("; ");
            prikaz.append("pm clear-permission-flags ").append(balik).append(' ').append(p).append(" user-set user-fixed; ");
        }
        prikaz.append(") >/dev/null 2>&1 &\nexit\n");
        ParcelFileDescriptor[] rury = InstrumentationRegistry.getInstrumentation().getUiAutomation().executeShellCommandRw("sh");
        try (FileOutputStream vstup = new FileOutputStream(rury[1].getFileDescriptor())) {
            vstup.write(prikaz.toString().getBytes("UTF-8"));
        }
        rury[1].close();
        rury[0].close();
        SystemClock.sleep(30_000); // sem by sa to dostať nemalo — proces medzitým zanikne
    }

    @Test public void b1_cakaj() { SystemClock.sleep(6_000); }
    @Test public void b2_cakaj() { SystemClock.sleep(6_000); }
    @Test public void b3_cakaj() { SystemClock.sleep(6_000); }
    @Test public void b4_cakaj() { SystemClock.sleep(6_000); }
    @Test public void b5_cakaj() { SystemClock.sleep(6_000); }
    @Test public void b6_cakaj() { SystemClock.sleep(6_000); }

    @Test
    public void z_video() throws Exception {
        Log.i(LOG, "povolenia: " + zariadenie.executeShellCommand("dumpsys package " + balik)
                .replaceAll("(?s).*runtime permissions:", "").replaceAll("(?s)\\n\\s*\\n.*", "").trim());
        krok("0 domovská obrazovka");
        zariadenie.wakeUp();
        zariadenie.pressHome();
        SystemClock.sleep(3_000);

        // 1. Spustenie a prihlásenie
        krok("1 spustenie appky");
        spusti();
        List<UiObject2> polia = null;
        long koniec = System.currentTimeMillis() + CAKANIE_MS;
        while (System.currentTimeMillis() < koniec) {
            povolDialog();
            polia = zariadenie.findObjects(By.clazz("android.widget.EditText"));
            if (polia.size() >= 2) break;
            SystemClock.sleep(1000);
        }
        vypisObrazovku();
        assertTrue("Prihlasovacie polia sa neukázali", polia != null && polia.size() >= 2);
        SystemClock.sleep(PAUZA_MS);

        krok("1 prihlásenie");
        vpis(polia.get(0), argumenty.getString("email", ""));
        SystemClock.sleep(1500);
        vpisHeslo(polia.get(1), argumenty.getString("heslo", ""));
        SystemClock.sleep(1500);
        // Skryť klávesnicu, nech je tlačidlo vidno — ale len keď je naozaj
        // otvorená, inak by „späť“ appku zatvorilo.
        String ime = zariadenie.executeShellCommand("dumpsys input_method");
        if (ime.contains("mInputShown=true") || ime.contains("isInputViewShown=true")) {
            zariadenie.pressBack();
            SystemClock.sleep(1000);
        }
        UiObject2 prihlasit = najdi(By.clazz("android.widget.Button")
                .text(Pattern.compile("(?i)^\\s*(sign in|log in|prihlásiť sa|přihlásit se)\\s*$")), 10_000);
        assertTrue("Tlačidlo prihlásenia sa nenašlo", prihlasit != null);
        prihlasit.click();

        // 2. Appka po prihlásení sama vysvetlí, načo jej je poloha (aj na
        // pozadí), a po „Allow“ sa vypýtajú systémové povolenia vrátane „Vždy“.
        krok("2 vysvetlenie a povolenia");
        vybavPovolenia(true);
        assertTrue("Po prihlásení sa neukázala úvodná obrazovka",
                cakajNaText("(?i)^\\s*(Overview|Prehľad)\\s*$", CAKANIE_MS) != null);
        vypisObrazovku();
        SystemClock.sleep(PAUZA_MS);

        // 3. Obrazovka jazdy a zapnutie rozpoznávania
        krok("3 záložka Jazda");
        UiObject2 jazda = cakajNaText("(?i)^\\s*(Trip|Jazda)\\s*$", 15_000);
        assertTrue("Záložka Jazda sa nenašla", jazda != null);
        jazda.click();
        SystemClock.sleep(PAUZA_MS);
        vypisObrazovku();

        krok("3 prepínač rozpoznávania");
        UiObject2 prepinac = najdi(By.clazz("android.widget.CheckBox"), 15_000);
        if (prepinac == null) {
            // Prepínač je pod mapou/tlačidlom štartu — posunúť obsah nižšie.
            for (int i = 0; i < 4 && prepinac == null; i++) {
                posunDole();
                prepinac = najdi(By.clazz("android.widget.CheckBox"), 2_000);
            }
        }
        vypisObrazovku();
        assertTrue("Prepínač rozpoznávania jázd sa nenašiel", prepinac != null);
        // Popiska vedľa prepínača musí byť v zábere.
        posunNaText("(?i)(Detect trips automatically|Rozpoznávať jazdy automaticky)");
        SystemClock.sleep(PAUZA_MS);
        prepinac = najdi(By.clazz("android.widget.CheckBox"), 5_000);
        prepinac.click();

        // Keby povolenia ešte chýbali, prepínač si ich vypýta znova.
        krok("3 po zapnutí");
        vybavPovolenia(false);
        vypisObrazovku();
        SystemClock.sleep(PAUZA_MS + 2_000);

        // 4. Home a panel notifikácií s trvalou notifikáciou služby
        krok("4 domov");
        zariadenie.pressHome();
        SystemClock.sleep(PAUZA_MS);
        krok("4 notifikácie");
        zariadenie.openNotification();
        SystemClock.sleep(2_500);
        vypisObrazovku();
        // Služba má tichý kanál — Pixel ho dáva do sekcie „Silent“ na spodok
        // zoznamu, tak sa zoznam posunie, kým notifikácia nie je v zábere.
        Pattern notifText = Pattern.compile("(?i).*(Kniha jázd sleduje|Nahrávam jazdu|Faktero sleduje|sleduje jazdy).*");
        UiObject2 notif = najdi(By.text(notifText), 2_000);
        int w = zariadenie.getDisplayWidth(), h = zariadenie.getDisplayHeight();
        for (int i = 0; i < 4 && (notif == null || notif.getVisibleBounds().bottom > h * 0.85); i++) {
            zariadenie.swipe(w / 2, (int) (h * 0.80), w / 2, (int) (h * 0.45), 30);
            SystemClock.sleep(1_500);
            notif = najdi(By.text(notifText), 1_500);
        }
        vypisObrazovku();
        if (notif != null) {
            Log.i(LOG, "notifikácia: " + notif.getText());
            try {
                // Rozbaliť, nech je vidno aj popis.
                UiObject2 rozbal = notif.getParent() != null ? notif.getParent().findObject(By.res(Pattern.compile(".*expand_button.*"))) : null;
                if (rozbal != null) rozbal.click();
            } catch (RuntimeException e) {
                Log.i(LOG, "rozbalenie: " + e);
            }
        }
        SystemClock.sleep(8_000);
        zariadenie.pressBack();
        SystemClock.sleep(1_500);

        // 5. Späť do appky, história a jazda s trasou
        krok("5 späť do appky");
        spusti();
        SystemClock.sleep(PAUZA_MS);
        // Kniha jázd má záložku História; Faktero má históriu pri vozidle na
        // obrazovke Jazda (tlačidlo „Trip history — auto“).
        UiObject2 historia = cakajNaText("(?i)^\\s*(History|História|Trip history.*|História jázd.*)\\s*$", 10_000);
        if (historia == null) {
            UiObject2 j = cakajNaText("(?i)^\\s*(Trip|Jazda)\\s*$", 10_000);
            if (j != null) {
                j.click();
                SystemClock.sleep(PAUZA_MS);
            }
            historia = posunNaText("(?i)^\\s*(Trip history.*|História jázd.*)\\s*$");
        }
        vypisObrazovku();
        assertTrue("História jázd sa nenašla", historia != null);
        historia.click();
        SystemClock.sleep(PAUZA_MS);
        vypisObrazovku();

        // Pri viacerých vozidlách sa najprv vyberá auto (pri jednom sa otvorí samo).
        String trasa = argumenty.getString("trasa", "Trnava.*Modra");
        if (cakajNaText("(?i).*" + trasa + ".*", 6_000) == null) {
            UiObject2 auto = najdi(By.text(Pattern.compile("(?i).*(Dodávka|Škoda|Octavia).*")), 3_000);
            try {
                if (auto != null) auto.click();
            } catch (RuntimeException e) {
                Log.i(LOG, "auto sa nedalo ťuknúť: " + e);
            }
            SystemClock.sleep(PAUZA_MS);
        }

        krok("5 jazda s trasou");
        UiObject2 riadok = posunNaText("(?i).*" + trasa + ".*");
        vypisObrazovku();
        assertTrue("Jazda s trasou sa v histórii nenašla", riadok != null);
        SystemClock.sleep(2_000);
        riadok.click();
        SystemClock.sleep(3_000);
        // Mapa sa rozbalí pod riadkom — posunúť, nech je celá v zábere.
        posunDole();
        SystemClock.sleep(8_000);
        vypisObrazovku();
        krok("koniec");
        // Záznam obrazovky zaostáva o niekoľko sekúnd — koniec nech sa stihne nahrať.
        SystemClock.sleep(12_000);
    }

    // ── Pomôcky ────────────────────────────────────────────────────────────

    private void krok(String nazov) {
        Log.i(LOG, "KROK " + nazov + " @" + SystemClock.elapsedRealtime());
    }

    /** Spúšťa sa systémovým príkazom (Xiaomi zakazuje spustenie z testu). */
    private void spusti() throws Exception {
        Context kontext = InstrumentationRegistry.getInstrumentation().getContext();
        Intent zamer = kontext.getPackageManager().getLaunchIntentForPackage(balik);
        assertTrue("Appka nemá spúšťaciu aktivitu", zamer != null && zamer.getComponent() != null);
        zariadenie.executeShellCommand("am start -W -n " + zamer.getComponent().flattenToShortString());
        assertTrue("Okno appky sa neukázalo", zariadenie.wait(Until.hasObject(By.pkg(balik).depth(0)), CAKANIE_MS));
    }

    private UiObject2 najdi(BySelector vyber, long ms) {
        return zariadenie.wait(Until.findObject(vyber), ms);
    }

    /** Text alebo popis (WebView niektoré prvky hlási len cez content-desc). */
    private UiObject2 cakajNaText(String regex, long ms) {
        Pattern p = Pattern.compile(regex);
        long koniec = System.currentTimeMillis() + ms;
        while (System.currentTimeMillis() < koniec) {
            UiObject2 o = zariadenie.findObject(By.text(p));
            if (o == null) o = zariadenie.findObject(By.desc(p));
            if (o != null) return o;
            povolDialog();
            SystemClock.sleep(700);
        }
        return null;
    }

    private UiObject2 posunNaText(String regex) {
        UiObject2 o = cakajNaText(regex, 5_000);
        for (int i = 0; i < 8 && (o == null || o.getVisibleBounds().bottom > zariadenie.getDisplayHeight() * 0.75); i++) {
            posunDole();
            o = cakajNaText(regex, 1_500);
        }
        return o;
    }

    private void posunDole() {
        int w = zariadenie.getDisplayWidth();
        int h = zariadenie.getDisplayHeight();
        zariadenie.swipe(w / 2, (int) (h * 0.65), w / 2, (int) (h * 0.40), 40);
        SystemClock.sleep(1200);
    }

    /**
     * Prejde vysvetlenie appky, systémové okná a stránku „Allow all the time“.
     * Skončí, keď už nič z toho nie je na obrazovke aspoň 8 s.
     */
    private void vybavPovolenia(boolean cakajNaVysvetlenie) throws Exception {
        long hranica = System.currentTimeMillis() + 120_000;
        long pokoj = System.currentTimeMillis();
        boolean vysvetlenieVidel = !cakajNaVysvetlenie;
        while (System.currentTimeMillis() < hranica) {
            boolean nieco = false;
            /*
              Okno s vysvetlením WebView do stromu prístupnosti nedostane (strom
              ostane z obrazovky pod ním), takže sa hľadá na snímke obrazovky:
              stmavené pozadie a zelené tlačidlo „Allow“ v spodnej polovici.
            */
            int[] tlacidlo = cakajNaVysvetlenie ? zelenaVOkne() : null;
            if (tlacidlo != null && balik.equals(zariadenie.getCurrentPackageName())) {
                krok("2 vysvetlenie appky");
                vysvetlenieVidel = true;
                SystemClock.sleep(7_000); // nech sa dá text prečítať
                tlacidlo = zelenaVOkne();
                if (tlacidlo != null) {
                    Log.i(LOG, "ťukám na zelené tlačidlo okna " + tlacidlo[0] + "," + tlacidlo[1]);
                    zariadenie.click(tlacidlo[0], tlacidlo[1]);
                }
                SystemClock.sleep(3_000);
                nieco = true;
            } else if (zvolVzdy()) {
                nieco = true;
            } else if (povolDialog()) {
                nieco = true;
            } else {
                UiObject2 hotovo = zariadenie.findObject(By.pkg(balik).clazz("android.widget.Button")
                        .text(Pattern.compile("(?i)^\\s*(Done|Hotovo)\\s*$")));
                if (hotovo != null) {
                    vypisObrazovku();
                    SystemClock.sleep(3_000);
                    hotovo.click();
                    SystemClock.sleep(1_500);
                    nieco = true;
                } else if (!balik.equals(zariadenie.getCurrentPackageName())
                        && zariadenie.hasObject(By.res(Pattern.compile(".*permissioncontroller:id/.*")))) {
                    // Stránka nastavení s už zvoleným „Vždy“ — späť do appky.
                    zariadenie.pressBack();
                    SystemClock.sleep(2_000);
                    nieco = true;
                }
            }
            if (nieco) pokoj = System.currentTimeMillis();
            else if (vysvetlenieVidel && System.currentTimeMillis() - pokoj > 8_000) break;
            else if (!vysvetlenieVidel && System.currentTimeMillis() - pokoj > 25_000) break;
            SystemClock.sleep(700);
        }
        Log.i(LOG, "povolenia: " + zariadenie.executeShellCommand("dumpsys package " + balik)
                .replaceAll("(?s).*runtime permissions:", "").replaceAll("(?s)\\n\\s*\\n.*", "").trim());
    }

    /**
     * Stred zeleného tlačidla v okne appky so stmaveným pozadím, alebo null.
     * Pozadie sa pozná podľa horného pruhu obrazovky (bez okna je svetlý).
     */
    private int[] zelenaVOkne() {
        Bitmap b = InstrumentationRegistry.getInstrumentation().getUiAutomation().takeScreenshot();
        if (b == null) return null;
        try {
            int w = b.getWidth(), h = b.getHeight();
            int pozadie = b.getPixel(w / 2, (int) (h * 0.30));
            int jas = (Color.red(pozadie) + Color.green(pozadie) + Color.blue(pozadie)) / 3;
            if (jas > 200 || jas < 40) return null; // svetlé = bez okna, tmavé = iná obrazovka
            int x = w / 2;
            int zaciatok = -1;
            for (int y = (int) (h * 0.45); y < (int) (h * 0.97); y++) {
                int c = b.getPixel(x, y);
                boolean zelena = Color.green(c) > 90 && Color.green(c) > Color.red(c) + 50 && Color.green(c) > Color.blue(c) + 20;
                if (zelena && zaciatok < 0) zaciatok = y;
                if (!zelena && zaciatok >= 0) {
                    if (y - zaciatok > 60) return new int[] {x, (zaciatok + y) / 2};
                    zaciatok = -1;
                }
            }
            return null;
        } finally {
            b.recycle();
        }
    }

    /** Systémový dialóg povolenia — odpovie „povoliť“ (pri polohe „počas používania“). */
    private boolean povolDialog() {
        UiObject2 b = zariadenie.findObject(By.res(Pattern.compile(".*permissioncontroller:id/permission_allow_foreground_only_button")));
        if (b == null) b = zariadenie.findObject(By.res(Pattern.compile(".*permissioncontroller:id/permission_allow_button")));
        if (b == null) b = zariadenie.findObject(By.pkg(Pattern.compile(".*permissioncontroller.*")).clazz("android.widget.Button").text(Pattern.compile(
                "(?i)^\\s*(While using the app|Allow|Počas používania aplikácie|Povoliť)\\s*$")));
        if (b == null) return false;
        Log.i(LOG, "povoľujem: " + b.getText());
        SystemClock.sleep(2_500); // nech je dialóg na videu čitateľný
        b.click();
        SystemClock.sleep(2_000);
        return true;
    }

    /** Stránka nastavení polohy (Android 11+): „Allow all the time“. */
    private boolean zvolVzdy() {
        UiObject2 r = zariadenie.findObject(By.res(Pattern.compile(".*permissioncontroller:id/allow_always_radio_button")));
        if (r == null) r = zariadenie.findObject(By.text(Pattern.compile("(?i)^\\s*(Allow all the time|Povoliť vždy|Vždy povoliť)\\s*$")));
        if (r == null) return false;
        Log.i(LOG, "volím Vždy");
        SystemClock.sleep(3_500);
        r.click();
        SystemClock.sleep(3_500);
        zariadenie.pressBack();
        SystemClock.sleep(2_500);
        return true;
    }

    /** Texty na obrazovke do logcatu — podľa nich sa ladí ďalší beh. */
    private void vypisObrazovku() {
        StringBuilder sb = new StringBuilder("OBRAZOVKA [" + zariadenie.getCurrentPackageName() + "]:");
        try {
            for (UiObject2 o : zariadenie.findObjects(By.text(Pattern.compile("(?s).+")))) {
                if ("android.widget.EditText".equals(o.getClassName())) continue; // nevypisovať obsah polí
                String r = o.getResourceName();
                sb.append(" | ").append(r != null ? r.replaceAll(".*:id/", "#") + " " : "").append(o.getText());
            }
            for (UiObject2 o : zariadenie.findObjects(By.desc(Pattern.compile("(?s).+")))) {
                sb.append(" | d=").append(o.getContentDescription());
            }
        } catch (RuntimeException e) {
            sb.append(" (obrazovka sa zmenila počas výpisu)");
        }
        String s = sb.toString();
        for (int i = 0; i < s.length(); i += 3500) Log.i(LOG, s.substring(i, Math.min(s.length(), i + 3500)));
    }

    /**
     * Heslo sa píše klávesnicou, nie cez `setText` — UiAutomator by text
     * zapísal do logcatu a ten sa ukladá do výsledkov Test Labu.
     */
    private void vpisHeslo(UiObject2 pole, String heslo) throws Exception {
        pole.click();
        SystemClock.sleep(800);
        // Priamo cez UiAutomation: UiDevice.executeShellCommand príkaz zapisuje
        // do logcatu. Bez úvodzoviek — príkaz neide cez shell, vpísali by sa.
        ParcelFileDescriptor vystup = InstrumentationRegistry.getInstrumentation().getUiAutomation()
                .executeShellCommand("input text " + heslo);
        try (FileInputStream in = new FileInputStream(vystup.getFileDescriptor())) {
            byte[] buf = new byte[256];
            while (in.read(buf) > 0) { /* čaká sa na dokončenie */ }
        }
        vystup.close();
    }

    /** Text do poľa vo WebView; keď ho pole cez prístupnosť neprijme, napíše sa klávesnicou. */
    private void vpis(UiObject2 pole, String text) throws Exception {
        pole.click();
        SystemClock.sleep(500);
        pole.setText(text);
        SystemClock.sleep(300);
        String obsah = pole.getText();
        if (obsah == null || obsah.isEmpty()) {
            zariadenie.executeShellCommand("input text " + text.replace("@", "\\@").replace(" ", "%s"));
        }
    }
}
