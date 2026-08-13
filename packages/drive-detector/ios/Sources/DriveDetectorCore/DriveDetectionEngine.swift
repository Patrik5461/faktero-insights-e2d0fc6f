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

    /// Body zbierané od prebudenia. Keď prah prejde, jazda ich zdedí aj s
    /// úsekom pred potvrdením; keď neprejde, zahodia sa.
    private var pending: [TripPoint] = []
    private var verifyStartedAt: TimeInterval?
    private var aboveSince: TimeInterval?
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
        aboveSince = nil
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
            guard let od = verifyStartedAt, now - od >= config.verificationWindowSeconds else { return [] }
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
        verifyStartedAt = nil
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
        aboveSince = nil
        consecutive = 0
        verifyStartedAt = nil
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

    private func ingestWhileVerifying(_ fix: Fix, at now: TimeInterval) -> [DetectorEffect] {
        if let od = verifyStartedAt, now - od >= config.verificationWindowSeconds {
            return abortVerification()
        }
        guard isUsable(fix) else {
            consecutive = 0
            aboveSince = nil
            return []
        }
        // Rýchlosť sa nedá určiť — meranie sa zahadzuje, ale sériu nepretŕha.
        guard fix.speedKmh >= 0 else { return [] }

        pending.append(TripPoint(fix: fix))

        if fix.speedKmh >= config.speedThresholdKmh {
            consecutive += 1
            if aboveSince == nil { aboveSince = fix.timestamp }
        } else {
            consecutive = 0
            aboveSince = nil
        }

        guard consecutive >= config.minConsecutiveFixes,
              let od = aboveSince,
              now - od >= requiredSustained
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
        aboveSince = nil
        consecutive = 0
        verifyStartedAt = nil
        lastMovingAt = now

        // Pohybové senzory už netreba — svoju úlohu (skrátenie držania prahu)
        // splnili a na pozadí stoja batériu.
        return [.stopMotionUpdates, .tripStarted(jazda, notify: true)]
    }

    private func abortVerification() -> [DetectorEffect] {
        state = .idle
        pending = []
        aboveSince = nil
        consecutive = 0
        verifyStartedAt = nil
        automotive = false
        return [.stopPreciseUpdates, .stopMotionUpdates, .bufferDiscarded]
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
