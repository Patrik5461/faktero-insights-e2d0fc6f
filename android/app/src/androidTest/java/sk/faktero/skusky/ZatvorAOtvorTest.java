package sk.faktero.skusky;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.os.SystemClock;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.uiautomator.By;
import androidx.test.uiautomator.UiDevice;
import androidx.test.uiautomator.UiObject2;
import androidx.test.uiautomator.Until;
import java.util.List;
import java.util.regex.Pattern;
import org.junit.Before;
import org.junit.FixMethodOrder;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.junit.runners.MethodSorters;

/**
 * Appka sa musí otvoriť aj po úplnom zatvorení.
 *
 * Pri prvej skúške na telefóne (Xiaomi, 2026-08-29) obe Android appky po
 * inštalácii nabehli, ale po zatvorení zo zoznamu otvorených appiek sa už
 * neotvorili. Prvý štart je prázdny; druhý číta prihlásenie z bezpečného
 * úložiska, obnovuje stav detekcie a spúšťa službu — chyba je v tom, čo si
 * appka uložila pri prvom behu.
 *
 * Test sa púšťa s orchestrátorom (Firebase Test Lab `--use-orchestrator`):
 * každá metóda beží v novom procese appky, údaje appky ostávajú. Druhá metóda
 * je teda naozaj „zatvoriť a znova otvoriť“.
 *
 * Argumenty (Test Lab `--environment-variables`, v kóde nie sú):
 * `email`, `heslo` — demo účet; `domov` — regulárny výraz textu, podľa ktorého
 * sa spozná úvodná obrazovka po prihlásení (napr. „Overview|Prehľad“).
 */
@RunWith(AndroidJUnit4.class)
@FixMethodOrder(MethodSorters.NAME_ASCENDING)
public class ZatvorAOtvorTest {

    private static final long CAKANIE_MS = 60_000;

    private UiDevice zariadenie;
    private String balik;
    private Bundle argumenty;

    @Before
    public void priprav() {
        zariadenie = UiDevice.getInstance(InstrumentationRegistry.getInstrumentation());
        balik = InstrumentationRegistry.getInstrumentation().getTargetContext().getPackageName();
        argumenty = InstrumentationRegistry.getArguments();
    }

    @Test
    public void a_prveSpustenieSPrihlasenim() throws Exception {
        spusti();
        long koniec = System.currentTimeMillis() + CAKANIE_MS;
        List<UiObject2> polia = null;
        while (System.currentTimeMillis() < koniec) {
            povolSystemoveOtazky();
            if (jeDomov()) return; // prihlásenie ostalo z predošlého behu
            polia = zariadenie.findObjects(By.clazz("android.widget.EditText"));
            if (polia.size() >= 2) break;
            SystemClock.sleep(1000);
        }
        assertTrue("Prihlasovacie polia sa neukázali", polia != null && polia.size() >= 2);

        vpis(polia.get(0), argumenty.getString("email", ""));
        vpis(polia.get(1), argumenty.getString("heslo", ""));
        // Tlačidlo, nie nadpis — obrazovka má nad poľami nadpis s rovnakým textom
        // („Sign in“) a ťuknutie naň nerobí nič.
        UiObject2 tlacidlo = zariadenie.findObject(By.clazz("android.widget.Button")
                .text(Pattern.compile("(?i)^\\s*(sign in|prihlásiť sa|přihlásit se)\\s*$")));
        assertTrue("Tlačidlo prihlásenia sa nenašlo", tlacidlo != null);
        tlacidlo.click();

        assertTrue("Po prihlásení sa neukázala úvodná obrazovka", cakajNaDomov());
    }

    @Test
    public void b_opatovneOtvoreniePoZatvoreni() throws Exception {
        spusti();
        assertTrue("Appka sa po úplnom zatvorení znova neotvorila na úvodnú obrazovku", cakajNaDomov());
        // Pád tesne po štarte — služba detekcie, obnova stavu — príde až o chvíľu.
        SystemClock.sleep(15_000);
        assertEquals("Appka po opätovnom otvorení nevydržala v popredí", balik, zariadenie.getCurrentPackageName());
        assertTrue("Úvodná obrazovka po chvíli zmizla", jeDomov());
    }

    /*
      Spúšťa sa systémovým príkazom, ako to robí spúšťač. Xiaomi (HyperOS)
      zakazuje jednej appke spustiť druhú na pozadí — test, ktorý ju spúšťal
      sám, skončil hláškou „MIUILOG- Permission Denied Activity“ a appka sa
      vôbec neotvorila, hoci s ňou nebolo nič v neporiadku.
    */
    private void spusti() throws Exception {
        Context kontext = InstrumentationRegistry.getInstrumentation().getContext();
        Intent zamer = kontext.getPackageManager().getLaunchIntentForPackage(balik);
        assertTrue("Appka nemá spúšťaciu aktivitu", zamer != null && zamer.getComponent() != null);
        zariadenie.executeShellCommand("am start -W -n " + zamer.getComponent().flattenToShortString());
        assertTrue("Okno appky sa neukázalo", zariadenie.wait(Until.hasObject(By.pkg(balik).depth(0)), CAKANIE_MS));
    }

    private boolean cakajNaDomov() {
        long koniec = System.currentTimeMillis() + CAKANIE_MS;
        while (System.currentTimeMillis() < koniec) {
            povolSystemoveOtazky();
            if (jeDomov()) return true;
            SystemClock.sleep(1000);
        }
        return false;
    }

    private boolean jeDomov() {
        String domov = argumenty.getString("domov", "Overview|Prehľad");
        return zariadenie.hasObject(By.text(Pattern.compile("(?i)^\\s*(" + domov + ")\\s*$")));
    }

    /** Systémové otázky (notifikácie, poloha) by zakryli appku — odpovie sa „povoliť“. */
    private void povolSystemoveOtazky() {
        for (int i = 0; i < 3; i++) {
            UiObject2 tlacidlo = zariadenie.findObject(By.res(Pattern.compile("com\\.android\\.permissioncontroller:id/permission_allow.*button")));
            if (tlacidlo == null) return;
            tlacidlo.click();
            SystemClock.sleep(800);
        }
    }

    /** Text do poľa vo WebView; keď ho pole cez prístupnosť neprijme, napíše sa klávesnicou. */
    private void vpis(UiObject2 pole, String text) throws Exception {
        pole.click();
        SystemClock.sleep(300);
        pole.setText(text);
        SystemClock.sleep(300);
        String obsah = pole.getText();
        if (obsah == null || obsah.isEmpty()) {
            zariadenie.executeShellCommand("input text " + text.replace("@", "\\@").replace(" ", "%s"));
        }
    }
}
