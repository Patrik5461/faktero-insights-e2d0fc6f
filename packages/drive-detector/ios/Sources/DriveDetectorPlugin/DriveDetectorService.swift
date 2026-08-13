import Foundation
import CoreLocation
import UIKit
import DriveDetectorCore

public protocol DriveDetectorServiceDelegate: AnyObject {
    func driveDetected(tripId: String, startedAt: TimeInterval)
    func tripUpdated(_ trip: BufferedTrip)
    func tripEnded(_ trip: BufferedTrip)
    func permissionRevoked()
}

/// Jediné miesto v celej appke, ktoré vlastní `CLLocationManager`.
///
/// Je to singleton naschvál: pri prebudení na pozadí (významná zmena polohy)
/// systém spustí proces a zavolá `application(_:didFinishLaunchingWithOptions:)`.
/// Správcu polohy treba vytvoriť **hneď tam** — kým sa nabootuje WebView
/// a JavaScript zavolá `start()`, zaradená poloha je dávno preč. Pri Faktere
/// to platí dvojnásobne: WebView ťahá stránku zo siete a na pozadí sa nemusí
/// načítať vôbec.
public final class DriveDetectorService: NSObject {
    public static let shared = DriveDetectorService()

    private static let metaMonitoring = "monitoring"
    private static let metaConfig = "config"
    private static let metaNotification = "notification"
    private static let metaDebounce = "debounceUntil"
    /// Ukončené jazdy sa držia týždeň — appka si ich medzitým vyzdvihne.
    private static let retention: TimeInterval = 7 * 24 * 3600
    private static let tripUpdateThrottle: TimeInterval = 10
    private static let tickInterval: TimeInterval = 10
    /// Staršie meranie je zvyšok z fronty systému a do trasy nepatrí.
    private static let maxFixAge: TimeInterval = 60

    weak var delegate: DriveDetectorServiceDelegate?

    private let manager = CLLocationManager()
    private let store = TripStore()
    private let motion = MotionActivityProvider()
    private let notifications = DriveNotifications()
    private let engine = DriveDetectionEngine()

    private var config = DetectorConfig()
    private var texts: DriveNotificationTexts?
    private var monitoring = false
    private var preciseOn = false
    private var bootstrapped = false
    private var timer: DispatchSourceTimer?
    private var lastTripUpdateAt: TimeInterval = 0
    private var permissionCallbacks: [() -> Void] = []
    private var seenAuthorization: CLAuthorizationStatus?

    private var now: TimeInterval { Date().timeIntervalSince1970 }

    /// Bez `location` v `UIBackgroundModes` vyhodí `allowsBackgroundLocationUpdates`
    /// výnimku a zhodí celú appku. Radšej beží detekcia len v popredí, než by
    /// mal používateľ spadnutú appku.
    private var backgroundCapable: Bool {
        let modes = Bundle.main.object(forInfoDictionaryKey: "UIBackgroundModes") as? [String]
        return modes?.contains("location") ?? false
    }

    // MARK: - Štart procesu

    /// Volá sa z `AppDelegate` pri každom spustení procesu vrátane prebudenia
    /// na pozadí.
    public func applicationLaunched(options _: [UIApplication.LaunchOptionsKey: Any]? = nil) {
        bootstrap()
    }

    func bootstrap() {
        guard !bootstrapped else { return }
        bootstrapped = true

        store.open()
        loadPersistedSettings()

        manager.delegate = self
        manager.pausesLocationUpdatesAutomatically = false
        manager.activityType = .automotiveNavigation

        motion.onAutomotive = { [weak self] jazdaAutom in
            self?.engine.setAutomotive(jazdaAutom)
        }

        notifications.onAction = { [weak self] tripId, akcia in
            guard let self else { return }
            switch akcia {
            case .business: _ = self.confirmTrip(tripId: tripId, classification: .business)
            case .privateDrive: _ = self.confirmTrip(tripId: tripId, classification: .privateDrive)
            case .discard: self.discardTrip(tripId: tripId)
            }
        }
        notifications.install()
        if let t = texts { notifications.registerCategory(texts: t) }

        // Rozpracovaná jazda prežila reštart — pokračuje sa v nej.
        if let rozpracovana = store.activeTrip() {
            apply(engine.resume(trip: rozpracovana, debounceUntil: engine.debounceUntil, at: now))
        }
        if monitoring {
            startSignificantChanges()
        }

        for meno in [UIApplication.didEnterBackgroundNotification, UIApplication.willTerminateNotification] {
            NotificationCenter.default.addObserver(
                self, selector: #selector(flushStore), name: meno, object: nil)
        }
        store.purge(olderThan: Self.retention, now: now)
    }

    @objc private func flushStore() {
        store.flush()
    }

    private func loadPersistedSettings() {
        monitoring = store.meta(Self.metaMonitoring) == "1"
        if let raw = store.meta(Self.metaConfig), let d = jsonObject(raw) {
            config = Self.config(from: d, base: DetectorConfig())
        }
        if let raw = store.meta(Self.metaNotification), let d = jsonObject(raw) {
            texts = DriveNotificationTexts(dictionary: d)
        }
        if let raw = store.meta(Self.metaDebounce), let hodnota = Double(raw) {
            engine.setDebounce(until: hodnota)
        }
        engine.update(config: config)
    }

    // MARK: - Rozhranie pre plugin

    func configure(values: [String: Any]) {
        bootstrap()
        config = Self.config(from: values, base: config)
        engine.update(config: config)
        store.setMeta(Self.metaConfig, json(Self.dictionary(from: config)))

        if let noveTexty = DriveNotificationTexts(dictionary: values["notification"] as? [String: Any]) {
            texts = noveTexty
            notifications.registerCategory(texts: noveTexty)
            store.setMeta(Self.metaNotification, json(noveTexty.dictionary))
        }
        if preciseOn {
            manager.distanceFilter = config.distanceFilterMeters
        }
    }

    func start() {
        bootstrap()
        monitoring = true
        store.setMeta(Self.metaMonitoring, "1")
        // Povolenie na notifikácie sa pýta až tu — pred prvým reálnym použitím
        // by to bolo len ďalšie okno pri štarte.
        notifications.requestAuthorization()
        startSignificantChanges()
    }

    func stop() {
        bootstrap()
        monitoring = false
        store.setMeta(Self.metaMonitoring, "0")
        // Rozpracovanú jazdu neututláme — ukončí sa a appka ju dostane.
        apply(engine.endTrip(at: now))
        manager.stopMonitoringSignificantLocationChanges()
        stopPrecise()
        motion.stop()
    }

    var isMonitoring: Bool { monitoring }

    var activeTrip: BufferedTrip? { engine.trip }

    /// Rozpracovaná jazda; keď žiadna nebeží, posledná ukončená a nezaradená.
    func bufferedTrip() -> BufferedTrip? {
        bootstrap()
        return engine.trip ?? store.latestUnresolvedTrip()
    }

    @discardableResult
    func confirmTrip(tripId: String, classification: Classification) -> BufferedTrip? {
        bootstrap()
        notifications.remove(tripId: tripId)
        store.setClassification(tripId: tripId, classification: classification)

        if let aktualizovana = engine.classify(tripId: tripId, as: classification) {
            // Jazda beží ďalej — človek len povedal, o akú ide.
            return aktualizovana
        }
        store.setStatus(tripId: tripId, status: .confirmed)
        return store.trip(id: tripId)
    }

    func discardTrip(tripId: String) {
        bootstrap()
        notifications.remove(tripId: tripId)
        apply(engine.discard(tripId: tripId, at: now))
        store.setStatus(tripId: tripId, status: .discarded)
        if let dokedy = engine.debounceUntil {
            store.setMeta(Self.metaDebounce, String(dokedy))
        }
    }

    func startManualTrip() -> BufferedTrip? {
        bootstrap()
        apply(engine.startManualTrip(at: now))
        return engine.trip
    }

    func endTrip() -> BufferedTrip? {
        bootstrap()
        let ukony = engine.endTrip(at: now)
        apply(ukony)
        for ukon in ukony {
            if case .tripEnded(let jazda) = ukon { return jazda }
        }
        return nil
    }

    // MARK: - Povolenia

    func permissions() -> [String: String] {
        let stav = manager.authorizationStatus
        let poloha: String
        let pozadie: String
        switch stav {
        case .authorizedAlways:
            poloha = "granted"
            pozadie = "granted"
        case .authorizedWhenInUse:
            poloha = "granted"
            // Či sa dá eskalovať, systém nepovie — appka to má ponúknuť a uvidí.
            pozadie = "prompt"
        case .denied, .restricted:
            poloha = "denied"
            pozadie = "denied"
        default:
            poloha = "prompt"
            pozadie = "prompt"
        }

        let pohyb: String
        switch MotionActivityProvider.authorization {
        case .authorized: pohyb = "granted"
        case .denied, .restricted: pohyb = "denied"
        default: pohyb = MotionActivityProvider.isAvailable ? "prompt" : "denied"
        }

        return ["location": poloha, "background": pozadie, "motion": pohyb]
    }

    /// Najprv „počas používania". Na „vždy" sa eskaluje až samostatným
    /// volaním po prvom reálnom použití — Apple žiadosť o „vždy" hneď pri
    /// štarte pri kontrole odmieta.
    func requestWhenInUse(completion: @escaping () -> Void) {
        bootstrap()
        guard manager.authorizationStatus == .notDetermined else { return completion() }
        permissionCallbacks.append(completion)
        manager.requestWhenInUseAuthorization()
    }

    func requestAlways(completion: @escaping () -> Void) {
        bootstrap()
        guard manager.authorizationStatus == .authorizedWhenInUse else { return completion() }
        permissionCallbacks.append(completion)
        manager.requestAlwaysAuthorization()
    }

    // MARK: - Hardvér

    private func startSignificantChanges() {
        guard CLLocationManager.significantLocationChangeMonitoringAvailable() else { return }
        manager.startMonitoringSignificantLocationChanges()
    }

    private func startPrecise() {
        guard !preciseOn else { return }
        preciseOn = true
        manager.desiredAccuracy = kCLLocationAccuracyBestForNavigation
        manager.distanceFilter = config.distanceFilterMeters
        manager.activityType = .automotiveNavigation
        manager.pausesLocationUpdatesAutomatically = false
        if backgroundCapable, manager.authorizationStatus == .authorizedAlways {
            manager.allowsBackgroundLocationUpdates = true
        }
        manager.startUpdatingLocation()
        startTimer()
    }

    private func stopPrecise() {
        guard preciseOn else { return }
        preciseOn = false
        manager.stopUpdatingLocation()
        if backgroundCapable {
            manager.allowsBackgroundLocationUpdates = false
        }
        stopTimer()
        store.flush()
    }

    /// Bez ťukania by sa nezistil koniec jazdy: stojace auto pri filtri na
    /// 30 metrov neposiela žiadne merania, takže by sa čakalo donekonečna.
    private func startTimer() {
        guard timer == nil else { return }
        let t = DispatchSource.makeTimerSource(queue: .main)
        t.schedule(deadline: .now() + Self.tickInterval, repeating: Self.tickInterval)
        t.setEventHandler { [weak self] in
            guard let self else { return }
            self.apply(self.engine.tick(at: self.now))
        }
        t.resume()
        timer = t
    }

    private func stopTimer() {
        timer?.cancel()
        timer = nil
    }

    // MARK: - Vykonanie úkonov motora

    private func apply(_ effects: [DetectorEffect]) {
        for ukon in effects {
            switch ukon {
            case .startPreciseUpdates:
                startPrecise()
            case .stopPreciseUpdates:
                stopPrecise()
            case .startMotionUpdates:
                motion.start()
            case .stopMotionUpdates:
                motion.stop()

            case .tripStarted(let jazda, let notify):
                store.insert(trip: jazda, status: .active)
                if notify, let t = texts {
                    notifications.fire(tripId: jazda.id, texts: t)
                }
                delegate?.driveDetected(tripId: jazda.id, startedAt: jazda.startedAt)

            case .pointAppended(let tripId, let bod):
                store.append(point: bod, tripId: tripId)
                emitTripUpdatedThrottled()

            case .tripEnded(let jazda):
                // Kto na notifikáciu odpovedal hneď na začiatku cesty, má
                // jazdu vybavenú — nemá sa čo znovu pýtať po príchode.
                store.update(trip: jazda, status: jazda.classification == nil ? .ended : .confirmed)
                store.flush()
                delegate?.tripEnded(jazda)

            case .bufferDiscarded:
                // Rozpracovaný buffer overovania nebol nikde uložený — jazda
                // vzniká až potvrdením prahu. Zamietnutie už uloženej jazdy
                // rieši `discardTrip(tripId:)`.
                break
            }
        }
    }

    private func emitTripUpdatedThrottled() {
        guard let jazda = engine.trip else { return }
        let teraz = now
        guard teraz - lastTripUpdateAt >= Self.tripUpdateThrottle else { return }
        lastTripUpdateAt = teraz
        delegate?.tripUpdated(jazda)
    }

    // MARK: - Nastavenia ako slovník

    private func jsonObject(_ raw: String) -> [String: Any]? {
        guard let data = raw.data(using: .utf8) else { return nil }
        return (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
    }

    private func json(_ dictionary: [String: Any]) -> String {
        guard let data = try? JSONSerialization.data(withJSONObject: dictionary) else { return "{}" }
        return String(data: data, encoding: .utf8) ?? "{}"
    }

    /// Z JavaScriptu chodia čísla ako `NSNumber` — `as? Double` by pri celom
    /// čísle (32 namiesto 32.0) mohlo ticho vrátiť `nil` a nastavenie by sa
    /// nepoužilo.
    private static func cislo(_ hodnota: Any?) -> Double? {
        if let n = hodnota as? NSNumber { return n.doubleValue }
        if let d = hodnota as? Double { return d }
        if let i = hodnota as? Int { return Double(i) }
        return nil
    }

    static func config(from values: [String: Any], base: DetectorConfig) -> DetectorConfig {
        var c = base
        if let v = cislo(values["speedThresholdKmh"]) { c.speedThresholdKmh = v }
        if let v = cislo(values["sustainedSeconds"]) { c.sustainedSeconds = v }
        if let v = cislo(values["minConsecutiveFixes"]) { c.minConsecutiveFixes = Int(v) }
        if let v = cislo(values["maxAccuracyMeters"]) { c.maxAccuracyMeters = v }
        if let v = cislo(values["debounceMinutes"]) { c.debounceMinutes = v }
        if let v = cislo(values["stopSpeedKmh"]) { c.stopSpeedKmh = v }
        if let v = cislo(values["stopAfterSeconds"]) { c.stopAfterSeconds = v }
        if let v = cislo(values["distanceFilterMeters"]) { c.distanceFilterMeters = v }
        return c
    }

    static func dictionary(from config: DetectorConfig) -> [String: Any] {
        [
            "speedThresholdKmh": config.speedThresholdKmh,
            "sustainedSeconds": config.sustainedSeconds,
            "minConsecutiveFixes": config.minConsecutiveFixes,
            "maxAccuracyMeters": config.maxAccuracyMeters,
            "debounceMinutes": config.debounceMinutes,
            "stopSpeedKmh": config.stopSpeedKmh,
            "stopAfterSeconds": config.stopAfterSeconds,
            "distanceFilterMeters": config.distanceFilterMeters
        ]
    }
}

// MARK: - CLLocationManagerDelegate

extension DriveDetectorService: CLLocationManagerDelegate {
    public func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        let teraz = now
        for poloha in locations {
            let vek = teraz - poloha.timestamp.timeIntervalSince1970
            guard vek < Self.maxFixAge else { continue }

            let fix = Fix(
                lat: poloha.coordinate.latitude,
                lng: poloha.coordinate.longitude,
                // iOS dáva zápornú rýchlosť, keď ju nevie určiť — do jadra ide
                // taká, aká je, a to si s ňou poradí.
                speedKmh: poloha.speed < 0 ? -1 : poloha.speed * 3.6,
                accuracy: poloha.horizontalAccuracy,
                altitude: poloha.verticalAccuracy >= 0 ? poloha.altitude : nil,
                timestamp: poloha.timestamp.timeIntervalSince1970)

            // Prebudenie: prišla poloha a nič nebeží — začína sa overovanie.
            if engine.state == .idle, monitoring {
                apply(engine.wake(at: teraz))
            }
            apply(engine.ingest(fix, at: teraz))
        }
    }

    public func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        // Jednotlivé zlyhanie merania jazdu nezhadzuje; systém pošle ďalšie.
    }

    public func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        let stav = manager.authorizationStatus
        let predtym = seenAuthorization
        seenAuthorization = stav

        let cakajuce = permissionCallbacks
        permissionCallbacks = []
        cakajuce.forEach { $0() }

        switch stav {
        case .denied, .restricted:
            if monitoring {
                monitoring = false
                store.setMeta(Self.metaMonitoring, "0")
                manager.stopMonitoringSignificantLocationChanges()
                stopPrecise()
                motion.stop()
                delegate?.permissionRevoked()
            }
        case .authorizedWhenInUse:
            // Na pozadí sa merať nedá. Detekcia beží len v popredí a appka
            // musí vedieť, že to už nie je to, čo si objednala.
            if backgroundCapable {
                manager.allowsBackgroundLocationUpdates = false
            }
            if monitoring, predtym == .authorizedAlways {
                delegate?.permissionRevoked()
            }
        case .authorizedAlways:
            if monitoring {
                startSignificantChanges()
                if preciseOn, backgroundCapable {
                    manager.allowsBackgroundLocationUpdates = true
                }
            }
        default:
            break
        }
    }
}
