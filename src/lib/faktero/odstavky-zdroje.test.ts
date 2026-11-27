import { describe, expect, it } from "vitest";
import {
  bezDuplicit,
  bratislavaIso,
  casOdDo,
  jeOznamOdstavky,
  lenAktualne,
  najdiDatumy,
  odhadniSluzbu,
  rozoberFsRss,
  rozoberSpRss,
  rozoberUpvsTabulku,
} from "./odstavky-zdroje";

/*
 * Vzorky sú skrátené reálne obsahy zdrojov:
 *  - FS technické informácie 15. 12. 2025 a 16. 5. 2025, novinky 19. 8. 2026 (web.archive.org,
 *    26. 11. 2026 bol portál FS práve v odstávke a RSS presmerovalo na servis.financnasprava.sk/odstavka),
 *  - slovensko.sk plán odstávok stiahnutý 26. 11. 2026,
 *  - Sociálna poisťovňa RSS 26. 11. 2026 (odstávková položka je doplnená podľa formátu kanála,
 *    text z oznamu z júna 2026).
 */

const FS_TECH = `﻿<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0">
  <channel>
    <title>Technické informácie RSS</title>
    <link>https://www.financnasprava.sk/sk/rss/rss-technicke-informacie</link>
    <item>
      <title>Mimoriadna technická odstávka Ústredného portálu verejnej správy www.slovensko.sk 15.12.2025 – 16.12.2025</title>
      <link>https://www.financnasprava.sk/sk/pre-media/novinky/archiv-noviniek/detail-novinky/_mimoriadn-odstavka-ti</link>
      <description>&lt;p&gt;Oznamujeme verejnosti, že&amp;nbsp;dňa &lt;b&gt;15. decembra 2025 (pondelok) v čase od 22:00 hod. do 16. decembra 2025 (utorok) v&amp;nbsp;čase do 04:00 hod.&lt;/b&gt;&amp;nbsp;sa uskutoční mimoriadna technická odstávka &lt;a href="https://www.slovensko.sk/"&gt;Ústredného portálu verejnej správy&lt;/a&gt;. Z tohto dôvodu nebude v uvedenom čase dostupné prihlasovanie na Ústrednom portáli verejnej správy.&lt;/p&gt;</description>
      <category>Technické informácie</category>
      <guid>https://www.financnasprava.sk/sk/pre-media/novinky/archiv-noviniek/detail-novinky/_mimoriadn-odstavka-ti</guid>
      <pubDate>Mon, 15 Dec 2025 08:47:21 GMT</pubDate>
    </item>
    <item>
      <title>Obmedzenie prevádzky na PCÚ Čierna nad Tisou pracovisko Dobrá TKD - 19.5.2025 </title>
      <link>https://www.financnasprava.sk/sk/pre-media/novinky/archiv-noviniek/detail-novinky/_obmedz-12-ti</link>
      <description>&lt;p&gt;Na Pobočke colného úradu Čierna nad Tisou pracovisko Dobrá TKD bude dňa 19.5.2025 v čase od 9:00 do 13:00 hod. čiastočne obmedzená prevádzka z dôvodu prerušenia distribúcie elektrickej energie.&lt;/p&gt;</description>
      <category>Technické informácie</category>
      <guid>https://www.financnasprava.sk/sk/pre-media/novinky/archiv-noviniek/detail-novinky/_obmedz-12-ti</guid>
      <pubDate>Fri, 16 May 2025 09:05:28 GMT</pubDate>
    </item>
    <item>
      <title>Nová verzia podpisových komponentov – D.Suite/eIDAS</title>
      <link>https://www.financnasprava.sk/sk/pre-media/novinky/archiv-noviniek/detail-novinky/_nova-verzia-20260107-ti</link>
      <description>&lt;p&gt;Oznamujeme verejnosti, že na stránke Ústredného portálu verejnej správy (ÚPVS) bol vydaný nový balík podpisových komponentov – D.Suite/eIDAS – verzia – 2.0.6.&lt;/p&gt;</description>
      <category>Technické informácie</category>
      <guid>https://www.financnasprava.sk/sk/pre-media/novinky/archiv-noviniek/detail-novinky/_nova-verzia-20260107-ti</guid>
      <pubDate>Thu, 08 Jan 2026 13:31:47 GMT</pubDate>
    </item>
  </channel>
</rss>`;

const FS_NOVINKY = `﻿<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0">
  <channel>
    <title>Novinky a aktuality RSS</title>
    <item>
      <title>Mimoriadne technické práce v infraštruktúre informačných systémov Ministerstva vnútra SR - 20.08.2026</title>
      <link>https://www.financnasprava.sk/sk/pre-media/novinky/archiv-noviniek/detail-novinky/_mimoriadne-technicke-prace-v-i</link>
      <description>&lt;p&gt;Oznamujeme verejnosti, že&amp;nbsp;dňa &lt;b&gt;20. augusta 2026 (štvrtok) v čase od 19:00 do 19:30 hod.,&lt;/b&gt; sa uskutočnia nutné technické práce v infraštruktúre informačných systémov Ministerstva vnútra SR. Z tohto dôvodu nebude dostupná služba eID autentifikácie.&lt;/p&gt;</description>
      <category>Novinky</category>
      <guid>https://www.financnasprava.sk/sk/pre-media/novinky/archiv-noviniek/detail-novinky/_mimoriadne-technicke-prace-v-i</guid>
      <pubDate>Wed, 19 Aug 2026 14:50:48 GMT</pubDate>
    </item>
    <item>
      <title>Šanca pre milovníkov motoriek: finančná správa ponúka v dražbách deväť strojov</title>
      <link>https://www.financnasprava.sk/sk/pre-media/novinky/archiv-noviniek/detail-novinky/_drazby-moto-ts</link>
      <description>&lt;p&gt;Milovníci motocyklov si môžu v kalendári zakrúžkovať štyri termíny - Daňový úrad Bratislava ponúkne od 20. augusta do 2. septembra 2026 v dražbách spolu deväť motocyklov.&lt;/p&gt;</description>
      <category>Novinky</category>
      <guid>https://www.financnasprava.sk/sk/pre-media/novinky/archiv-noviniek/detail-novinky/_drazby-moto-ts</guid>
      <pubDate>Mon, 17 Aug 2026 13:03:25 GMT</pubDate>
    </item>
    <item>
      <title>Obmedzenie prevádzky na slovensko-ukrajinskom hraničnom priechode Vyšné Nemecké–Užhorod v nákladnej doprave</title>
      <link>https://www.financnasprava.sk/sk/pre-media/novinky/archiv-noviniek/detail-novinky/_obmedz-chpvn-20260817-ti</link>
      <description>&lt;p&gt;Na slovensko–ukrajinskom cestnom hraničnom priechode Vyšné Nemecké – Užhorod, pracovisko nákladná doprava v smere vstup do SR, bude dňa 20.08.2026 čiastočne obmedzená prevádzka.&lt;/p&gt;</description>
      <category>Novinky</category>
      <guid>https://www.financnasprava.sk/sk/pre-media/novinky/archiv-noviniek/detail-novinky/_obmedz-chpvn-20260817-ti</guid>
      <pubDate>Mon, 17 Aug 2026 07:09:22 GMT</pubDate>
    </item>
  </channel>
</rss>`;

const UPVS = `<h2><strong>Termíny plánovaných technických odstávok v roku 2026:</strong></h2>
<table class="tblBorder" border="0">
<tbody>
<tr><th class="tblBorder"><strong>Dátum</strong></th><th class="tblBorder"><strong>Začiatok</strong></th><th class="tblBorder"><strong>Koniec</strong></th><th class="tblBorder"><strong>Plánované aktivity</strong></th></tr>
<tr>
<td>09. 12. 2026 -<br />10. 12. 2026</td>
<td>&nbsp;22.00 h.</td>
<td>&nbsp;4.00 h.</td>
<td>&nbsp;<strong>Pravidelná plánovaná technická odstávka&nbsp; &nbsp; &nbsp;&nbsp;<br /></strong></td>
</tr>
<tr>
<td>14. 10. 2026 -<br />15. 10. 2026</td>
<td>&nbsp;22.00 h.</td>
<td>&nbsp;4.00 h.</td>
<td>
<p>&nbsp;<strong>Pravidelná plánovaná technická odstávka&nbsp; &nbsp; &nbsp;&nbsp;</strong></p>
<ul>
<li>Modul IAM - úprava a drobné opravy</li>
<li>Modul <a href="/sk/slovnik/detail\\_edesk" class='infoPopUp'>eDesk</a> - nasadenie novej verzie 0.6</li>
<li>Optimalizácia <a href="/sk/slovnik/detail\\_mef" class='infoPopUp'>eForm</a></li>
</ul>
</td>
</tr>
<tr>
<td>
<p>12. 08. 2026 -<br />13. 08. 2026</p>
</td>
<td>&nbsp;22.00 h.</td>
<td>&nbsp;4.00 h.</td>
<td>
<p><strong><strong>&nbsp;Pravidelná plánovaná technická odstávka&nbsp; &nbsp; &nbsp;&nbsp;</strong></strong></p>
<ul>
<li>Odstávka sa neuskutočnila&nbsp;</li>
</ul>
</td>
</tr>
<tr>
<td>
<p>18. 07. 2026 -<br />19. 07. 2026</p>
</td>
<td>&nbsp;08.00 h.</td>
<td>&nbsp;20.00 h.</td>
<td>
<p><strong>Mimoriadna technická odstávka</strong></p>
<ul>
<li><span data-teams="true">Technické práce na infraštruktúre</span></li>
</ul>
</td>
</tr>
<tr>
<td>
<p>14. 03. 2026 -<br />14. 03. 2026</p>
</td>
<td>&nbsp;8.00 h.</td>
<td>&nbsp;20.00 h.</td>
<td><p><strong>Mimoriadna technická odstávka</strong></p></td>
</tr>
</tbody>
</table>
<table class="tblBorder" border="0">
<tbody>
<tr>
<td>
<p>18. 12. 2025</p>
</td>
<td>20.50 h.</td>
<td>22.00 h.</td>
<td><div><strong>Mimoriadna technická odstávka</strong></div></td>
</tr>
<tr>
<td>21. 12. 2022</td>
<td>22.00 h.</td>
<td>24.00 h.</td>
<td><strong>Mimoriadna technická odstávka</strong> práce súvisiace s revokáciou certifikátov</td>
</tr>
<tr>
<td>10. 08. 20 22 - 11. 08. 2022</td>
<td>22.00 h.</td>
<td>4.00 h.</td>
<td>&nbsp;Pravidelná plánovaná technická odstávka - neuskutočnila sa</td>
</tr>
</tbody>
</table>`;

const SP = `<?xml version="1.0" encoding="utf-8"?>
<rss xmlns:dc="http://purl.org/dc/elements/1.1/" version="2.0" xml:base="http://www.socpoist.sk/">
  <channel>
    <title>Sociálna poisťovňa</title>
    <item>
  <title>Dôchodkový vek v roku 2027 sa nemení. Je známy pre poistencov narodených pred rokom 1969</title>
  <link>http://www.socpoist.sk/node/7108/</link>
  <description>Dôchodkový vek sa v&amp;nbsp;roku 2027 z&amp;nbsp;pohľadu legislatívy nemení.
</description>
  <pubDate>26.11.2026</pubDate>
    <dc:creator>Sociálna poisťovňa</dc:creator>
    <guid isPermaLink="false">/node/7108/</guid>
    </item>
<item>
  <title>ZAMESTNÁVATELIA: Prechádzame na nový portál eSlužieb. Pôvodný portál v časti pre zamestnávateľov končí 2. decembra 2026</title>
  <link>http://www.socpoist.sk/node/7105/</link>
  <description>Sociálna poisťovňa oznamuje zamestnávateľom, že od 2. decembra 2026 plne prechádza na novú verziu portálu eSlužieb v&amp;nbsp;časti Odvádzateľ poistného.
</description>
  <pubDate>24.11.2026</pubDate>
    <dc:creator>Sociálna poisťovňa</dc:creator>
    <guid isPermaLink="false">/node/7105/</guid>
    </item>
<item>
  <title>Odstávka eSlužieb Sociálnej poisťovne</title>
  <link>http://www.socpoist.sk/node/6900/</link>
  <description>Z dôvodu technickej údržby budú eSlužby nedostupné od 11. júna 2026 (od 17.00 h) do 15. júna 2026 (do 23.59 h).
</description>
  <pubDate>05.06.2026</pubDate>
    <dc:creator>Sociálna poisťovňa</dc:creator>
    <guid isPermaLink="false">/node/6900/</guid>
    </item>
  </channel>
</rss>`;

describe("bratislavaIso", () => {
  it("zima +01:00, leto +02:00", () => {
    expect(bratislavaIso(2026, 11, 26, 20, 0)).toBe("2026-11-26T20:00:00+01:00");
    expect(bratislavaIso(2026, 7, 18, 8, 0)).toBe("2026-07-18T08:00:00+02:00");
  });

  it("deň prechodu na letný a zimný čas", () => {
    // 29. 3. 2026 o 2:00 sa ručičky posúvajú na 3:00, 25. 10. 2026 o 3:00 späť na 2:00.
    expect(bratislavaIso(2026, 3, 29, 1, 0)).toBe("2026-03-29T01:00:00+01:00");
    expect(bratislavaIso(2026, 3, 29, 4, 0)).toBe("2026-03-29T04:00:00+02:00");
    expect(Date.parse(bratislavaIso(2026, 3, 29, 4, 0)) - Date.parse(bratislavaIso(2026, 3, 29, 1, 0))).toBe(2 * 3600_000);
    expect(bratislavaIso(2026, 10, 25, 1, 0)).toBe("2026-10-25T01:00:00+02:00");
    expect(bratislavaIso(2026, 10, 25, 4, 0)).toBe("2026-10-25T04:00:00+01:00");
  });

  it("hodina 24 a koniec mesiaca prejdú do ďalšieho dňa", () => {
    expect(bratislavaIso(2026, 12, 31, 24, 0)).toBe("2027-01-01T00:00:00+01:00");
    expect(bratislavaIso(2026, 11, 31, 10, 0)).toBe("2026-12-01T10:00:00+01:00");
  });
});

describe("casOdDo", () => {
  it("„dňa 26.11.2026 od 20:00 hod. do 23:00 hod.“", () => {
    expect(
      casOdDo(
        "Oznamujeme, že dňa 26.11.2026 od 20:00 hod. do 23:00 hod. nebude dostupný Portál FS, podávanie formulárov, ani eDane.",
        2026,
      ),
    ).toEqual({ zaciatok: "2026-11-26T20:00:00+01:00", koniec: "2026-11-26T23:00:00+01:00", presne: true });
  });

  it("„28.11.2026 od 09:00 hod. do 17:00 hod.“", () => {
    expect(casOdDo("28.11.2026 od 09:00 hod. do 17:00 hod.", 2026)).toEqual({
      zaciatok: "2026-11-28T09:00:00+01:00",
      koniec: "2026-11-28T17:00:00+01:00",
      presne: true,
    });
  });

  it("mená mesiacov v 2. páde, dva dni, letný čas", () => {
    expect(casOdDo("od 11. júna 2026 (od 17.00 h) do 15. júna 2026 (do 23.59 h)", 2025)).toEqual({
      zaciatok: "2026-06-11T17:00:00+02:00",
      koniec: "2026-06-15T23:59:00+02:00",
      presne: true,
    });
  });

  it("chýbajúci rok prevezme od nasledujúceho dátumu, inak predvolený", () => {
    expect(casOdDo("od 11. júna (od 17.00 h) do 15. júna 2026 (do 23.59 h)", 2020)?.zaciatok).toBe(
      "2026-06-11T17:00:00+02:00",
    );
    expect(casOdDo("dňa 3. 12. od 8:00 do 10:00", 2026)?.zaciatok).toBe("2026-12-03T08:00:00+01:00");
  });

  it("deň je aj v druhom koncovom dátume („do 16. decembra 2025 … do 04:00“)", () => {
    expect(
      casOdDo(
        "dňa 15. decembra 2025 (pondelok) v čase od 22:00 hod. do 16. decembra 2025 (utorok) v čase do 04:00 hod.",
        2025,
      ),
    ).toEqual({ zaciatok: "2025-12-15T22:00:00+01:00", koniec: "2025-12-16T04:00:00+01:00", presne: true });
  });

  it("prechod cez polnoc bez druhého dátumu → koniec ďalší deň", () => {
    expect(casOdDo("dňa 31.12.2026 od 22:00 do 2:00 hod.", 2026)).toEqual({
      zaciatok: "2026-12-31T22:00:00+01:00",
      koniec: "2027-01-01T02:00:00+01:00",
      presne: true,
    });
  });

  it("noc prechodu na zimný čas", () => {
    const r = casOdDo("v sobotu 24. októbra 2026 od 22:00 hod. do 04:00 hod.", 2026)!;
    expect(r.zaciatok).toBe("2026-10-24T22:00:00+02:00");
    expect(r.koniec).toBe("2026-10-25T04:00:00+01:00");
    expect(Date.parse(r.koniec!) - Date.parse(r.zaciatok)).toBe(7 * 3600_000);
  });

  it("len dátum = celý deň, nie presne", () => {
    expect(casOdDo("bude dňa 20.08.2026 čiastočne obmedzená prevádzka", 2026)).toEqual({
      zaciatok: "2026-08-20T00:00:00+02:00",
      koniec: "2026-08-21T00:00:00+02:00",
      presne: false,
    });
  });

  it("bez dátumu nič", () => {
    expect(casOdDo("od 20:00 do 23:00 nebude dostupný portál", 2026)).toBeNull();
  });

  it("6. pád mesiaca a čísla, ktoré nie sú čas", () => {
    expect(najdiDatumy("odstávka 27. decembri 2026")[0]).toMatchObject({ den: 27, mesiac: 12, rok: 2026 });
    expect(casOdDo("dňa 5. marca 2026 verzia 2.0.6 a 3,5 %", 2026)?.presne).toBe(false);
  });
});

describe("relevancia a služba", () => {
  it("odstávka áno, tlačová správa nie, hraničný priechod nie", () => {
    expect(jeOznamOdstavky("Plánovaná odstávka eKasa systému")).toBe(true);
    expect(jeOznamOdstavky("Z dôvodu údržby nebude dostupná ePobočka")).toBe(true);
    expect(jeOznamOdstavky("Septembrové konferencie k eFaktúre sa blížia")).toBe(false);
    expect(jeOznamOdstavky("Obmedzenie prevádzky na hraničnom priechode Vyšné Nemecké")).toBe(false);
  });

  it("služby z textu", () => {
    expect(odhadniSluzbu("nebude dostupný Portál FS, podávanie formulárov, ani eDane")).toBe(
      "Portál FS, eDane, eFormuláre",
    );
    expect(odhadniSluzbu("výpadok systému eKasa a OPD")).toBe("eKasa, OPD");
    expect(odhadniSluzbu("nič také")).toBeNull();
  });
});

describe("rozoberFsRss", () => {
  it("technické informácie: odstávka s od–do je automaticky schválená, pobočka a nová verzia vypadnú", () => {
    const r = rozoberFsRss(FS_TECH);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({
      zdroj: "fs",
      guid: "https://www.financnasprava.sk/sk/pre-media/novinky/archiv-noviniek/detail-novinky/_mimoriadn-odstavka-ti",
      institucia: "Finančná správa",
      sluzba: "slovensko.sk",
      zaciatok: "2025-12-15T22:00:00+01:00",
      koniec: "2025-12-16T04:00:00+01:00",
      automaticky: true,
    });
    expect(r[0].popis).toContain("nebude v uvedenom čase dostupné prihlasovanie");
    expect(r[0].popis).not.toContain("&nbsp;");
  });

  it("novinky: len oznam o nedostupnosti a ako návrh", () => {
    const r = rozoberFsRss(FS_NOVINKY);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({
      nazov: "Mimoriadne technické práce v infraštruktúre informačných systémov Ministerstva vnútra SR - 20.08.2026",
      sluzba: "eID",
      zaciatok: "2026-08-20T19:00:00+02:00",
      koniec: "2026-08-20T19:30:00+02:00",
      automaticky: false,
    });
  });

  it("ten istý oznam v oboch kanáloch → ostane automaticky schválený", () => {
    const tech = rozoberFsRss(FS_TECH);
    const novinka = { ...tech[0], automaticky: false };
    expect(bezDuplicit([novinka, ...tech])).toEqual(tech);
  });
});

describe("rozoberUpvsTabulku", () => {
  const r = rozoberUpvsTabulku(UPVS);
  const podla = (guid: string) => r.find((x) => x.guid === guid)!;

  it("riadky s časom, cez polnoc, automaticky schválené", () => {
    expect(r).toHaveLength(8);
    expect(podla("upvs-2026-12-09T22:00")).toEqual({
      zdroj: "upvs",
      guid: "upvs-2026-12-09T22:00",
      institucia: "slovensko.sk",
      sluzba: "slovensko.sk",
      nazov: "Pravidelná plánovaná technická odstávka",
      popis: null,
      url: "https://www.slovensko.sk/sk/oznamy/plan-odstavok",
      zaciatok: "2026-12-09T22:00:00+01:00",
      koniec: "2026-12-10T04:00:00+01:00",
      automaticky: true,
      zamietnute: false,
    });
  });

  it("letný čas, moduly v popise", () => {
    const o = podla("upvs-2026-10-14T22:00");
    expect(o.zaciatok).toBe("2026-10-14T22:00:00+02:00");
    expect(o.koniec).toBe("2026-10-15T04:00:00+02:00");
    expect(o.popis).toBe("Modul IAM - úprava a drobné opravy; Modul eDesk - nasadenie novej verzie 0.6; Optimalizácia eForm");
    expect(o.sluzba).toBe("slovensko.sk, eFormuláre, eDesk");
  });

  it("zrušená odstávka je zamietnutá", () => {
    expect(podla("upvs-2026-08-12T22:00").zamietnute).toBe(true);
    expect(podla("upvs-2022-08-10T22:00")).toMatchObject({ zamietnute: true, koniec: "2022-08-11T04:00:00+02:00" });
  });

  it("viac dní, jeden deň, 24.00 h.", () => {
    expect(podla("upvs-2026-07-18T08:00").koniec).toBe("2026-07-19T20:00:00+02:00");
    expect(podla("upvs-2026-03-14T08:00").koniec).toBe("2026-03-14T20:00:00+01:00");
    expect(podla("upvs-2025-12-18T20:50").koniec).toBe("2025-12-18T22:00:00+01:00");
    expect(podla("upvs-2022-12-21T22:00").koniec).toBe("2022-12-22T00:00:00+01:00");
  });

  it("do databázy len nedávne a budúce", () => {
    const teraz = Date.parse("2026-11-26T20:00:00+01:00");
    expect(lenAktualne(r, teraz).map((x) => x.guid)).toEqual(["upvs-2026-12-09T22:00"]);
  });
});

describe("rozoberSpRss", () => {
  it("bežné aktuality vypadnú, odstávka je návrh s časom", () => {
    const r = rozoberSpRss(SP);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({
      zdroj: "sp",
      guid: "/node/6900/",
      institucia: "Sociálna poisťovňa",
      sluzba: "eSlužby",
      url: "https://www.socpoist.sk/node/6900/",
      zaciatok: "2026-06-11T17:00:00+02:00",
      koniec: "2026-06-15T23:59:00+02:00",
      automaticky: false,
    });
  });
});
