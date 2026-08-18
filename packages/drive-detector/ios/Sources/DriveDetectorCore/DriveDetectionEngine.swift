import Foundation

/// Kaskáda detekcie jazdy. Žiadny CoreLocation, žiadny CoreMotion, žiadne
/// hodiny — čas aj merania prídu zvonku, takže sa celé správanie dá prejsť
/// v unit testoch za milisekundy namiesto hodiny v aute.
///
/// Motor drží buffer, ale nič neukladá a nikoho neupozorňuje: vracia zoznam
/// úkonov (`DetectorEffect`), ktoré vykoná obslužná vrstva.
public final class DriveDetectionEngine {
    public private(set) var config: DetectorConfig
    public private(set) var state: DetectorState = .idle
    /// Prebiehajúca jazda. Po ukončení sa čistí — ukončená jazda odchádza
    /// v úkone `.tripEnded`.
    public private(set) var trip: BufferedTrip?
    /// Dokedy sa detekcia nespúšťa po zamietnutí jazdy.
    public private(set) var debounceUntil: TimeInterval?

    /// Koľko sekúnd nad prahom už overovanie nazbieralo a koľko ich potrebuje.
    /// Je to jediné, čo zvonku prezradí, prečo sa jazda (ne)potvrdila.
    public var sekundyNadPrahom: Double { aboveTotal }
    public var potrebnychSekund: Double { requiredSustained }

    /// Body zbierané od prebudenia. Keď prah prejde, jazda ich zdedí aj s
    /// úsekom pred potvrdením; keď neprejde, zahodia sa.
    private var pending: [TripPoint] = []
    private var verifyStartedAt: TimeInterval?
    /// Koľko sekúnd sme počas tohto overovania dokopy videli nad prahom.
    ///
    /// Zámerne súčet, nie súvislý úsek. Prvá verzia vyžadovala minútu bez
    /// jediného poklesu — semafor, kruhový objazd či odbočka počítanie
    /// vynulovali a v meste sa jazda nepotvrdila prakticky nikdy.
    private var aboveTotal: Double = 0
    /// Posledné použiteľné meranie a či bolo nad prahom — z toho sa počíta,
    /// koľko času sa má prirátať.
    private var lastFixAt: TimeInterval?
    private var predchadzajuciBolNadPrahom = false
    /// Posledné meranie nad prahom. Nenuluje sa pri poklese — drží okno
    /// overovania otvorené, kým sa zjavne jazdí.
    private var lastAboveAt: TimeInterval?
    private var consecutive = 0
    private var automotive = false
    /// Kedy sa naposledy hýbalo. Nie je to to isté ako čas posledného merania:
    /// stojace auto pri filtri na 30 m neposiela nič, takže ticho sa musí
    /// počítať ako státie, inak by sa jazda neukončila nikdy.
    private var lastMovingAt: TimeInterval?

    private let makeId: () -> String

    public init(
        config: DetectorConfig = DetectorConfig(),
        makeId: @escaping () -> String = { UUID().uuidString }
    ) {
        self.config = config
        self.makeId = makeId
    }

    // MARK: - Nastavenia a obnova

    public func update(config: DetectorConfig) {
        self.config = config
    }

    /// Po reštarte zariadenia pokračuje rozpracovaná jazda tam, kde skončila.
    public func resume(trip: BufferedTrip, debounceUntil: TimeInterval?, at now: TimeInterval) -> [DetectorEffect] {
        self.trip = trip
        self.debounceUntil = debounceUntil
        state = .driving
        // Zámerne od teraz: telefón mohol byť hodinu vypnutý a jazda by sa
        // ukončila v tej istej sekunde, v ktorej sa obnovila.
        lastMovingAt = now
        return [.startPreciseUpdates]
    }

    public func setDebounce(until: TimeInterval?) {
        debounceUntil = until
    }

    /// Pohybové senzory hlásia jazdu autom (confidence aspoň `.medium`).
    public func setAutomotive(_ value: Bool) {
        automotive = value
    }

    // MARK: - Vstupy

    /// Lacné prebudenie (významná zmena polohy). Púšťa druhý stupeň kaskády.
    public func wake(at now: TimeInterval) -> [DetectorEffect] {
        // Počas jazdy sa druhá detekcia nespúšťa nikdy.
        guard state == .idle else { return [] }
        if let dokedy = debounceUntil, now < dokedy { return [] }

        state = .verifying
        verifyStartedAt = now
        pending = []
        aboveTotal = 0
        lastFixAt = nil
        lastAboveAt = nil
        predchadzajuciBolNadPrahom = false
        consecutive = 0
        automotive = false
        return [.startPreciseUpdates, .startMotionUpdates]
    }

    public func ingest(_ fix: Fix, at now: TimeInterval) -> [DetectorEffect] {
        switch state {
        case .idle:
            return []
        case .verifying:
            return ingestWhileVerifying(fix, at: now)
        case .driving:
            return ingestWhileDriving(fix, at: now)
        }
    }

    /// Pravidelné ťuknutie. Bez neho by sa nezistil ani strop overovania, ani
    /// koniec jazdy — v oboch prípadoch je typické, že merania prestanú chodiť.
    public func tick(at now: TimeInterval) -> [DetectorEffect] {
        switch state {
        case .idle:
            return []
        case .verifying:
            guard jeCasVzdatOverovanie(at: now) else { return [] }
            return abortVerification()
        case .driving:
            guard trip?.manual == false else { return [] }
            guard let m = lastMovingAt, now - m >= config.stopAfterSeconds else { return [] }
            return finishTrip(at: now)
        }
    }

    // MARK: - Príkazy zvonku

    /// Ručné spustenie tlačidlom. Keď jazda beží, nerobí nič.
    public func startManualTrip(at now: TimeInterval) -> [DetectorEffect] {
        guard trip == nil else { return [] }
        let jazda = BufferedTrip(id: makeId(), startedAt: now, manual: true)
        trip = jazda
        state = .driving
        pending = []
        vycistiOverovanie()
        lastMovingAt = now
        return [.startPreciseUpdates, .tripStarted(jazda, notify: false)]
    }

    /// Ručné ukončenie. Vracia prázdno, keď nič nebeží.
    public func endTrip(at now: TimeInterval) -> [DetectorEffect] {
        guard state == .driving else { return [] }
        return finishTrip(at: now)
    }

    /// Zamietnutie jazdy. Debounce platí aj vtedy, keď sa zamieta už ukončená
    /// jazda — človek práve povedal, že o takéto jazdy nestojí.
    public func discard(tripId: String?, at now: TimeInterval) -> [DetectorEffect] {
        debounceUntil = now + config.debounceMinutes * 60

        guard let bezi = trip, tripId == nil || bezi.id == tripId else {
            // Zamietla sa jazda, ktorá už nebeží — stačí debounce.
            return []
        }
        trip = nil
        pending = []
        vycistiOverovanie()
        lastMovingAt = nil
        state = .idle
        return [.stopPreciseUpdates, .stopMotionUpdates, .bufferDiscarded]
    }

    /// Zaradenie jazdy nič neukončuje — človek odpovedá na notifikáciu hneď na
    /// začiatku cesty a nahrávanie musí ísť ďalej.
    @discardableResult
    public func classify(tripId: String, as classification: Classification) -> BufferedTrip? {
        guard var bezi = trip, bezi.id == tripId else { return nil }
        bezi.classification = classification
        trip = bezi
        return bezi
    }

    // MARK: - Vnútro

    private var requiredSustained: Double {
        automotive ? min(config.sustainedSeconds, config.automotiveSustainedSeconds) : config.sustainedSeconds
    }

    /// Meranie s neznámou alebo horšou presnosťou ako povolená sa do trasy
    /// nedostane a sériu prerušuje — je to skutočný výpadok signálu.
    private func isUsable(_ fix: Fix) -> Bool {
        fix.accuracy >= 0 && fix.accuracy < config.maxAccuracyMeters
    }

    /// Okno overovania sa neráta od prebudenia, ale od posledného merania nad
    /// prahom. Pevné okno od prebudenia znamenalo, že jazda musela prah udržať
    /// takmer bez prestávky hneď v prvej minúte — a keď to nestihla, presná
    /// poloha sa vypla a čakalo sa na ďalšie prebudenie, ktoré príde až po
    /// stovkách metrov. Strop je poistka pre batériu.
    private func jeCasVzdatOverovanie(at now: TimeInterval) -> Bool {
        guard let zaciatok = verifyStartedAt else { return false }
        if now - zaciatok >= config.verificationMaxSeconds { return true }
        return now - (lastAboveAt ?? zaciatok) >= config.verificationWindowSeconds
    }

    private func ingestWhileVerifying(_ fix: Fix, at now: TimeInterval) -> [DetectorEffect] {
        if jeCasVzdatOverovanie(at: now) {
            return abortVerification()
        }
        guard isUsable(fix) else {
            consecutive = 0
            predchadzajuciBolNadPrahom = false
            return []
        }
        // Rýchlosť sa nedá určiť — meranie sa zahadzuje, ale sériu nepretŕha.
        guard fix.speedKmh >= 0 else { return [] }

        pending.append(TripPoint(fix: fix))

        if fix.speedKmh >= config.speedThresholdKmh {
            // Čas sa prirátava medzi dvoma meraniami nad prahom. Po výpadku
            // signálu by sa inak prirátala celá diera, v ktorej sa mohlo aj stáť.
            if predchadzajuciBolNadPrahom, let predchadzajuce = lastFixAt {
                let medzera = fix.timestamp - predchadzajuce
                if medzera > 0, medzera <= config.maxGapSeconds { aboveTotal += medzera }
            }
            consecutive += 1
            lastAboveAt = fix.timestamp
            predchadzajuciBolNadPrahom = true
        } else {
            consecutive = 0
            predchadzajuciBolNadPrahom = false
        }
        lastFixAt = fix.timestamp

        guard consecutive >= config.minConsecutiveFixes,
              aboveTotal >= requiredSustained
        else { return [] }

        return confirmTrip(at: now)
    }

    private func ingestWhileDriving(_ fix: Fix, at now: TimeInterval) -> [DetectorEffect] {
        guard var bezi = trip else { return [] }
        guard isUsable(fix), fix.speedKmh >= 0 else { return [] }

        let bod = TripPoint(fix: fix)
        if let posledny = bezi.points.last {
            bezi.distanceMeters += Distance.meters(from: posledny, to: bod)
        }
        bezi.points.append(bod)
        bezi.maxSpeedKmh = max(bezi.maxSpeedKmh, bod.speedKmh)
        trip = bezi

        if bod.speedKmh >= config.stopSpeedKmh {
            lastMovingAt = max(now, bod.timestamp)
        }

        var ukony: [DetectorEffect] = [.pointAppended(tripId: bezi.id, point: bod)]
        if !bezi.manual, let m = lastMovingAt, now - m >= config.stopAfterSeconds {
            ukony += finishTrip(at: now)
        }
        return ukony
    }

    private func confirmTrip(at now: TimeInterval) -> [DetectorEffect] {
        let body = pending
        let jazda = BufferedTrip(
            id: makeId(),
            startedAt: body.first?.timestamp ?? now,
            points: body,
            distanceMeters: Distance.total(of: body),
            maxSpeedKmh: Distance.maxSpeed(of: body),
            manual: false)

        trip = jazda
        state = .driving
        pending = []
        vycistiOverovanie()
        lastMovingAt = now

        // Pohybové senzory už netreba — svoju úlohu (skrátenie držania prahu)
        // splnili a na pozadí stoja batériu.
        return [.stopMotionUpdates, .tripStarted(jazda, notify: true)]
    }

    private func abortVerification() -> [DetectorEffect] {
        state = .idle
        pending = []
        vycistiOverovanie()
        automotive = false
        return [.stopPreciseUpdates, .stopMotionUpdates, .bufferDiscarded]
    }

    private func vycistiOverovanie() {
        aboveTotal = 0
        lastFixAt = nil
        lastAboveAt = nil
        predchadzajuciBolNadPrahom = false
        consecutive = 0
        verifyStartedAt = nil
    }

    private func finishTrip(at now: TimeInterval) -> [DetectorEffect] {
        guard var jazda = trip else { return [] }
        jazda.endedAt = now
        trip = nil
        state = .idle
        lastMovingAt = nil
        return [.tripEnded(jazda), .stopPreciseUpdates]
    }
}
