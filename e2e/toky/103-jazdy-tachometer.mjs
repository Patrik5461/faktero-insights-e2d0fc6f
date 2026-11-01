/*
  Kniha jázd (balík opráv B8, J-05): GPS jazda s tachometrom od nuly.

  Web, appka aj automatická detekcia jazdy ukladajú jazdu „relatívne“
  (začiatok 0, koniec = prejdené km). Spúšťač `trips_doplnit_tachometer`
  ju napojí na koniec predchádzajúcej jazdy vozidla, inak na počiatočný
  stav. Ručne zadaný tachometer ostane. Formulár úpravy jazdy potom ukazuje
  skutočný stav tachometra.

  Firma test2, vlastné vozidlo s ŠPZ podľa značky behu; po sebe zmaže jazdy aj vozidlo.
*/
export default {
  popis: "Kniha jázd: GPS jazda nadväzuje na tachometer vozidla (J-05)",
  limit: 120000,
  firma: "test2",
  async spusti(t) {
    const page = t.page;
    const firma = t.firmy.test2;
    let vozidlo = null;

    t.uprac("jazdy a vozidlo", async () => {
      const auta = await t.rest.get(
        `vehicles?company_id=eq.${firma}&name=eq.${encodeURIComponent(`${t.znacka} tachometer`)}&select=id`,
      );
      for (const a of auta.data ?? []) {
        await t.rest.delete(`trips?vehicle_id=eq.${a.id}&company_id=eq.${firma}`);
        const r = await t.rest.delete(`vehicles?id=eq.${a.id}&company_id=eq.${firma}`);
        if (r.status >= 300)
          throw new Error(`vozidlo ${a.id}: ${r.status} ${r.text.slice(0, 200)}`);
      }
    });

    await t.krok("príprava: vozidlo s počiatočným stavom 50 000 km", async () => {
      vozidlo = await t.rest.vloz("vehicles", {
        company_id: firma,
        name: `${t.znacka} tachometer`,
        license_plate: "QA103",
        initial_odometer: 50000,
      });
      t.over(vozidlo?.id, "vozidlo sa nezaložilo");
    });

    const gpsJazda = async (den, km) => {
      const riadok = await t.rest.vloz("trips", {
        company_id: firma,
        vehicle_id: vozidlo.id,
        trip_date: den,
        start_time: `${den}T07:00:00Z`,
        start_odometer: 0,
        end_odometer: km,
        distance_km: km,
        purpose: "GPS jazda",
        note: `GPS: e2e ${t.znacka}`,
      });
      return {
        id: riadok.id,
        start: Number(riadok.start_odometer),
        end: Number(riadok.end_odometer),
      };
    };

    const prva = await t.krok("prvá GPS jazda začne počiatočným stavom vozidla", async () => {
      const j = await gpsJazda("2026-10-01", 12.5);
      t.over(
        j.start === 50000 && j.end === 50012.5,
        `tachometer ${j.start}–${j.end}, čakal som 50000–50012.5`,
      );
      return j;
    });

    const druha = await t.krok("ďalšia GPS jazda nadviaže na koniec predchádzajúcej", async () => {
      const j = await gpsJazda("2026-10-02", 7.5);
      t.over(
        j.start === 50012.5 && j.end === 50020,
        `tachometer ${j.start}–${j.end}, čakal som 50012.5–50020`,
      );
      return j;
    });

    await t.krok("ručne zadaný tachometer spúšťač nemení", async () => {
      const riadok = await t.rest.vloz("trips", {
        company_id: firma,
        vehicle_id: vozidlo.id,
        trip_date: "2026-10-03",
        start_odometer: 60000,
        end_odometer: 60010,
        distance_km: 10,
      });
      t.over(
        Number(riadok?.start_odometer) === 60000,
        `ručný tachometer sa zmenil na ${riadok?.start_odometer}`,
      );
    });

    await t.krok("úprava jazdy ukáže skutočný tachometer, nie 0", async () => {
      await t.go(`/jazdy/nova?id=${druha.id}`);
      await page.waitForFunction(
        () => [...document.querySelectorAll("input")].some((i) => i.value === "50012.5"),
        null,
        { timeout: 20000 },
      );
      t.log(`prvá jazda ${prva.start}–${prva.end}, druhá ${druha.start}–${druha.end}`);
    });
  },
};
