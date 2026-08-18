import XCTest
@testable import DriveDetectorCore

/// Celá kaskáda sa dá prejsť bez auta, bez GPS a bez čakania — čas aj merania
/// sú vstupom, nie prostredím.
final class DriveDetectionEngineTests: XCTestCase {
    private let start: TimeInterval = 1_000

    private func engine(_ uprav: (inout DetectorConfig) -> Void = { _ in }) -> DriveDetectionEngine {
        var config = DetectorConfig()
        uprav(&config)
        var poradie = 0
        return DriveDetectionEngine(config: config, makeId: {
            poradie += 1
            return "jazda-\(poradie)"
        })
    }

    private func fix(
        _ cas: TimeInterval,
        speed: Double,
        accuracy: Double = 10,
        lat: Double = 48.15,
        lng: Double = 17.11
    ) -> Fix {
        Fix(lat: lat, lng: lng, speedKmh: speed, accuracy: accuracy, altitude: 150, timestamp: cas)
    }

    /// Nakŕmi motor meraniami v pravidelnom takte a vráti všetky úkony.
    @discardableResult
    private func jazdi(
        _ motor: DriveDetectionEngine,
        od: TimeInterval,
        po koniec: TimeInterval,
        krok: TimeInterval = 5,
        speed: Double = 60,
        accuracy: Double = 10
    ) -> [DetectorEffect] {
        var vsetky: [DetectorEffect] = []
        var t = od
        while t <= koniec {
            vsetky += motor.ingest(fix(t, speed: speed, accuracy: accuracy), at: t)
            t += krok
        }
        return vsetky
    }

    private func zaciatokJazdy(_ effects: [DetectorEffect]) -> BufferedTrip? {
        for e in effects {
            if case .tripStarted(let jazda, _) = e { return jazda }
        }
        return nil
    }

    private func koniecJazdy(_ effects: [DetectorEffect]) -> BufferedTrip? {
        for e in effects {
            if case .tripEnded(let jazda) = e { return jazda }
        }
        return nil
    }

    // MARK: - Prebudenie a overovanie

    func testPrebudenieZapinaPresnuPolohuAPohyboveSenzory() {
        let motor = engine()
        let ukony = motor.wake(at: start)
        XCTAssertEqual(ukony, [.startPreciseUpdates, .startMotionUpdates])
        XCTAssertEqual(motor.state, .verifying)
    }

    func testJazdaSaPotvrdiPoDrzaniPrahu() {
        let motor = engine()
        _ = motor.wake(at: start)
        let ukony = jazdi(motor, od: start, po: start + 60)

        let jazda = zaciatokJazdy(ukony)
        XCTAssertNotNil(jazda)
        XCTAssertEqual(motor.state, .driving)
        // Trasa začína pri prebudení, nie až pri potvrdení prahu.
        XCTAssertEqual(jazda?.startedAt, start)
        XCTAssertEqual(jazda?.points.count, 13)
        XCTAssertFalse(jazda?.manual ?? true)
    }

    func testKratkeZrychlenieJazduNespusti() {
        let motor = engine()
        _ = motor.wake(at: start)
        // 30 sekúnd nad prahom, potom státie — na 60 sekúnd to nestačí.
        jazdi(motor, od: start, po: start + 30)
        jazdi(motor, od: start + 35, po: start + 80, speed: 2)

        XCTAssertEqual(motor.state, .verifying)
        XCTAssertNil(motor.trip)
    }

    func testPoDevatdesiatichSekundachSaOverovanieVzda() {
        let motor = engine()
        _ = motor.wake(at: start)
        jazdi(motor, od: start, po: start + 30, speed: 10)

        let ukony = motor.tick(at: start + 90)
        XCTAssertTrue(ukony.contains(.stopPreciseUpdates))
        XCTAssertTrue(ukony.contains(.bufferDiscarded))
        XCTAssertEqual(motor.state, .idle)
        XCTAssertNil(motor.trip)
    }

    /// Kvôli tomuto sa počítanie menilo: pôvodne musel prah držať minútu bez
    /// jediného poklesu a okno sa rátalo od prebudenia. V meste to znamenalo,
    /// že sa jazda nepotvrdila prakticky nikdy — stačil jeden semafor.
    func testMestskaJazdaSoSemaformiSaPotvrdi() {
        let motor = engine()
        _ = motor.wake(at: start)
        jazdi(motor, od: start, po: start + 25)
        jazdi(motor, od: start + 30, po: start + 70, speed: 3)
        jazdi(motor, od: start + 75, po: start + 95)
        jazdi(motor, od: start + 100, po: start + 115, speed: 12)
        let ukony = jazdi(motor, od: start + 120, po: start + 145)

        XCTAssertNotNil(zaciatokJazdy(ukony))
        XCTAssertEqual(motor.state, .driving)
    }

    /// Okno sa počíta od posledného merania nad prahom, nie od prebudenia —
    /// inak by dlhšia jazda vypadla uprostred.
    func testOknoDrziKymChodiaMeraniaNadPrahom() {
        let motor = engine { $0.sustainedSeconds = 300 }
        _ = motor.wake(at: start)
        jazdi(motor, od: start, po: start + 200)

        XCTAssertEqual(motor.state, .verifying)
        XCTAssertTrue(motor.tick(at: start + 250).isEmpty)
    }

    /// Po výpadku signálu sa nesmie prirátať celá diera — v nej sa mohlo aj stáť.
    func testDieraMedziMeraniamiSaDoCasuNadPrahomNepocita() {
        let motor = engine()
        _ = motor.wake(at: start)
        jazdi(motor, od: start, po: start + 20)
        _ = motor.ingest(fix(start + 60, speed: 60), at: start + 60)

        XCTAssertEqual(motor.sekundyNadPrahom, 20)
        XCTAssertNil(motor.trip)
    }

    /// Poistka pre batériu: overovanie sa nesmie natiahnuť donekonečna len
    /// preto, že merania nad prahom stále chodia.
    func testOverovanieMaTvrdyStrop() {
        let motor = engine()
        _ = motor.wake(at: start)
        // Striedavo nad a pod prahom — séria troch sa nenazbiera nikdy,
        // ale okno by sa bez stropu obnovovalo stále.
        var t = start
        while t <= start + 700 {
            let rychlost: Double = t.truncatingRemainder(dividingBy: 10) == 0 ? 60 : 5
            _ = motor.ingest(fix(t, speed: rychlost), at: t)
            t += 5
        }

        XCTAssertEqual(motor.state, .idle)
        XCTAssertNil(motor.trip)
    }

    func testZapornaRychlostSeriuNepretrhne() {
        let motor = engine()
        _ = motor.wake(at: start)
        jazdi(motor, od: start, po: start + 25)
        // iOS občas rýchlosť nevie určiť — také meranie sa zahodí, ale sériu
        // nesmie zhodiť.
        _ = motor.ingest(fix(start + 30, speed: -1), at: start + 30)
        let ukony = jazdi(motor, od: start + 35, po: start + 60)

        XCTAssertNotNil(zaciatokJazdy(ukony))
        // Meranie bez rýchlosti sa do trasy nedostane.
        XCTAssertEqual(motor.trip?.points.count, 12)
    }

    func testZlaPresnostSeriuPretrhne() {
        let motor = engine()
        _ = motor.wake(at: start)
        jazdi(motor, od: start, po: start + 25)
        _ = motor.ingest(fix(start + 30, speed: 60, accuracy: 80), at: start + 30)
        jazdi(motor, od: start + 35, po: start + 60)

        // Séria sa počíta odznova od 1035, takže po 60 sekundách od prebudenia
        // jazda ešte potvrdená nie je.
        XCTAssertEqual(motor.state, .verifying)
        XCTAssertNil(motor.trip)
    }

    func testNepresneMeranieSaDoTrasyNedostane() {
        let motor = engine()
        _ = motor.wake(at: start)
        _ = motor.ingest(fix(start, speed: 60, accuracy: 500), at: start)
        jazdi(motor, od: start + 5, po: start + 65)

        let body = motor.trip?.points ?? []
        XCTAssertFalse(body.isEmpty)
        XCTAssertTrue(body.allSatisfy { $0.accuracy < 50 })
    }

    func testPohyboveSenzorySkracujuDrzaniePrahu() {
        let motor = engine()
        _ = motor.wake(at: start)
        motor.setAutomotive(true)
        let ukony = jazdi(motor, od: start, po: start + 30)

        XCTAssertNotNil(zaciatokJazdy(ukony))
        XCTAssertTrue(ukony.contains(.stopMotionUpdates))
    }

    func testPohyboveSenzoryNepredlzujuKratsieNastavenie() {
        // Keď si appka nastaví kratšie držanie ako 30 s, senzory ho nesmú predĺžiť.
        let motor = engine { $0.sustainedSeconds = 15 }
        _ = motor.wake(at: start)
        motor.setAutomotive(true)
        let ukony = jazdi(motor, od: start, po: start + 15)

        XCTAssertNotNil(zaciatokJazdy(ukony))
    }

    // MARK: - Priebeh a ukončenie

    func testJazdaSaUkonciPoDlhomStati() {
        let motor = engine()
        _ = motor.wake(at: start)
        jazdi(motor, od: start, po: start + 60)

        XCTAssertTrue(motor.tick(at: start + 300).isEmpty)
        let ukony = motor.tick(at: start + 360)

        let jazda = koniecJazdy(ukony)
        XCTAssertNotNil(jazda)
        XCTAssertEqual(jazda?.endedAt, start + 360)
        XCTAssertTrue(ukony.contains(.stopPreciseUpdates))
        XCTAssertEqual(motor.state, .idle)
        XCTAssertNil(motor.trip)
    }

    func testStojaceAutoBezMeraniSaTiezUkonci() {
        // Pri filtri na 30 metrov stojace auto neposiela vôbec nič. Keby sa
        // koniec počítal len z meraní, jazda by nikdy neskončila.
        let motor = engine()
        _ = motor.wake(at: start)
        jazdi(motor, od: start, po: start + 60)

        XCTAssertNotNil(koniecJazdy(motor.tick(at: start + 400)))
    }

    func testPomalaJazdaVKolonePokracuje() {
        let motor = engine()
        _ = motor.wake(at: start)
        jazdi(motor, od: start, po: start + 60)
        // Popolzávanie v kolóne je stále jazda — rýchlosť nad `stopSpeedKmh`.
        jazdi(motor, od: start + 65, po: start + 400, krok: 20, speed: 8)

        XCTAssertEqual(motor.state, .driving)
    }

    func testTrasaMaVzdialenostAMaximalnuRychlost() {
        let motor = engine()
        _ = motor.wake(at: start)
        var t = start
        var lat = 48.15
        while t <= start + 60 {
            _ = motor.ingest(fix(t, speed: t == start + 30 ? 95 : 60, lat: lat), at: t)
            lat += 0.001
            t += 5
        }

        XCTAssertEqual(motor.trip?.maxSpeedKmh, 95)
        XCTAssertGreaterThan(motor.trip?.distanceMeters ?? 0, 1_000)
        XCTAssertGreaterThan(motor.trip?.avgSpeedKmh ?? 0, 0)
    }

    // MARK: - Zamietnutie a debounce

    func testPoZamietnutiSaDetekciaChvilkuNespusta() {
        let motor = engine()
        _ = motor.wake(at: start)
        jazdi(motor, od: start, po: start + 60)
        guard let id = motor.trip?.id else { return XCTFail("jazda nevznikla") }

        let ukony = motor.discard(tripId: id, at: start + 70)
        XCTAssertTrue(ukony.contains(.stopPreciseUpdates))
        XCTAssertNil(motor.trip)

        // 30 minút ticho.
        XCTAssertTrue(motor.wake(at: start + 70 + 29 * 60).isEmpty)
        XCTAssertFalse(motor.wake(at: start + 70 + 31 * 60).isEmpty)
    }

    func testZamietnutieUzUkoncenejJazdyNastaviLenDebounce() {
        let motor = engine()
        _ = motor.wake(at: start)
        jazdi(motor, od: start, po: start + 60)
        _ = motor.tick(at: start + 400)

        _ = motor.discard(tripId: "jazda-1", at: start + 410)
        XCTAssertTrue(motor.wake(at: start + 500).isEmpty)
    }

    func testPocasJazdySaDruhaDetekciaNespusti() {
        let motor = engine()
        _ = motor.wake(at: start)
        jazdi(motor, od: start, po: start + 60)
        let id = motor.trip?.id

        XCTAssertTrue(motor.wake(at: start + 120).isEmpty)
        XCTAssertEqual(motor.trip?.id, id)
    }

    // MARK: - Ručná jazda a obnova

    func testRucnaJazdaNemaNotifikaciuANekonciSama() {
        let motor = engine()
        let ukony = motor.startManualTrip(at: start)

        guard case .tripStarted(let jazda, let notify)? = ukony.last else {
            return XCTFail("ručná jazda nezačala")
        }
        XCTAssertFalse(notify)
        XCTAssertTrue(jazda.manual)

        // Státie ručne spustenú jazdu neukončí — kto ju spustil, ten ju ukončí.
        XCTAssertTrue(motor.tick(at: start + 900).isEmpty)
        XCTAssertEqual(motor.state, .driving)

        XCTAssertNotNil(koniecJazdy(motor.endTrip(at: start + 950)))
    }

    func testRucneSpustenieNezacneDruhuJazdu() {
        let motor = engine()
        _ = motor.wake(at: start)
        jazdi(motor, od: start, po: start + 60)
        let id = motor.trip?.id

        XCTAssertTrue(motor.startManualTrip(at: start + 70).isEmpty)
        XCTAssertEqual(motor.trip?.id, id)
    }

    func testObnovenaJazdaPokracuje() {
        let motor = engine()
        let ulozena = BufferedTrip(
            id: "z-databazy",
            startedAt: start,
            points: [TripPoint(lat: 48.15, lng: 17.11, speedKmh: 60, accuracy: 10, altitude: nil, timestamp: start)],
            distanceMeters: 120,
            maxSpeedKmh: 60)

        let ukony = motor.resume(trip: ulozena, debounceUntil: nil, at: start + 3_600)
        XCTAssertEqual(ukony, [.startPreciseUpdates])
        XCTAssertEqual(motor.state, .driving)

        jazdi(motor, od: start + 3_600, po: start + 3_620)
        XCTAssertEqual(motor.trip?.points.count, 6)
        XCTAssertEqual(motor.trip?.id, "z-databazy")
    }

    func testZaradenieJazduNeukonci() {
        let motor = engine()
        _ = motor.wake(at: start)
        jazdi(motor, od: start, po: start + 60)
        guard let id = motor.trip?.id else { return XCTFail("jazda nevznikla") }

        let zaradena = motor.classify(tripId: id, as: .business)
        XCTAssertEqual(zaradena?.classification, .business)
        XCTAssertEqual(motor.state, .driving)
    }
}
