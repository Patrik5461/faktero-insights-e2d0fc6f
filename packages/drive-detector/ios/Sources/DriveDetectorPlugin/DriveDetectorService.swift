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
    private static let metaDennik = "dennik"
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

    /// Denník detekcie — jediné, čo po neúspešnej jazde vie povedať, kde sa to
    /// zaseklo. Musí prežiť zabitie appky: detekcia beží aj vtedy, keď appka
    /// nebeží, takže počítadlá v pamäti by sa do Diagnostiky nikdy nedostali.
    private var dennik = Dennik()
    private var dennikZapisanyO: TimeInterval = 0
    /// Zamietnutie jazdy človekom nie je neúspešné overovanie — a do pluginu
    /// prichádza tým istým úkonom.
    private var zamietaClovek = false

    struct Dennik {
        var prebudeni = 0
        var poslednePrebudenie: TimeInterval?
        var neuspesnychOvereni = 0
        var posledneNeuspesne: TimeInterval?
        var poslednaJazda: TimeInterval?
        /// Najvyššia rýchlosť videná počas posledného overovania.
        var najvyssiaRychlost: Double = 0
        /*
          Najvyššia rýchlosť za celý čas. `najvyssiaRychlost` sa pri každom
          prebudení nuluje, takže sama o sebe nepovie nič o tom, či detekcia
          niekedy nejakú jazdu videla — a vedľa počtu overovaní to zvádza
          čítať, že za sto pokusov nevidela nikdy nič.
        */
        var najvyssiaRychlostVobec: Double = 0
        /*
          Koľko meraní počas posledného overovania prišlo a koľko z nich malo
          dosť dobrú presnosť. Toto rozlíši tri celkom rôzne príčiny, ktoré
          zvonku vyzerajú rovnako: iOS po prebudení nedodá nič, dodá len hrubé
          sieťové polohy (GPS sa nezapne), alebo dodá dobré merania a auto
          naozaj stálo.
        */
        /*
          Koľkokrát sa proces spustil a koľko meraní odvtedy prišlo. Rozlíši
          dve veci, ktoré zvonku vyzerajú rovnako: systém appku po každom
          prebudení spúšťa nanovo (vtedy sa počítadlo spustení blíži počtu
          prebudení), alebo ju len uspáva (spustení je málo, meraní tiež).
        */
        var spusteniProcesu = 0
        var fixovOdSpustenia = 0
        var fixovVOvereni = 0
        var pouzitelnychVOvereni = 0
        /// Najlepšia (najmenšia) presnosť videná počas posledného overovania.
        var najlepsiaPresnost: Double?
        var poslednyFix: TimeInterval?

        var dictionary: [String: Any] {
            var d: [String: Any] = [
                "prebudeni": prebudeni,
                "neuspesnychOvereni": neuspesnychOvereni,
                "najvyssiaRychlost": najvyssiaRychlost,
                "najvyssiaRychlostVobec": najvyssiaRychlostVobec,
                "spusteniProcesu": spusteniProcesu,
                "fixovOdSpustenia": fixovOdSpustenia,
                "fixovVOvereni": fixovVOvereni,
                "pouzitelnychVOvereni": pouzitelnychVOvereni
            ]
            if let v = najlepsiaPresnost { d["najlepsiaPresnost"] = v }
            if let v = poslednePrebudenie { d["poslednePrebudenie"] = v }
            if let v = posledneNeuspesne { d["posledneNeuspesne"] = v }
            if let v = poslednaJazda { d["poslednaJazda"] = v }
            if let v = poslednyFix { d["poslednyFix"] = v }
            return d
        }

        init() {}

        init(dictionary d: [String: Any]) {
            prebudeni = (d["prebudeni"] as? NSNumber)?.intValue ?? 0
            neuspesnychOvereni = (d["neuspesnychOvereni"] as? NSNumber)?.intValue ?? 0
            najvyssiaRychlost = (d["najvyssiaRychlost"] as? NSNumber)?.doubleValue ?? 0
            najvyssiaRychlostVobec = (d["najvyssiaRychlostVobec"] as? NSNumber)?.doubleValue ?? 0
            spusteniProcesu = (d["spusteniProcesu"] as? NSNumber)?.intValue ?? 0
            fixovVOvereni = (d["fixovVOvereni"] as? NSNumber)?.intValue ?? 0
            pouzitelnychVOvereni = (d["pouzitelnychVOvereni"] as? NSNumber)?.intValue ?? 0
            najlepsiaPresnost = (d["najlepsiaPresnost"] as? NSNumber)?.doubleValue
            poslednePrebudenie = (d["poslednePrebudenie"] as? NSNumber)?.doubleValue
            posledneNeuspesne = (d["posledneNeuspesne"] as? NSNumber)?.doubleValue
            poslednaJazda = (d["poslednaJazda"] as? NSNumber)?.doubleValue
            poslednyFix = (d["poslednyFix"] as? NSNumber)?.doubleValue
        }
    }

    private var now: TimeInterval { Date().timeIntervalSince1970 }

    /*
      Držanie procesu pri živote počas overovania.

      Keď appku zobudí významná zmena polohy, iOS jej dá len pár sekúnd behu.
      Samotné `startUpdatingLocation()` na jej udržanie nestačilo: z Patrikovej
      diagnostiky prišlo počas celej rannej jazdy **jediné meranie na jedno
      overovanie**, hoci GPS merala s presnosťou 14 m a rýchlosť videla 52 km/h.
      Motor pritom potrebuje tri merania po sebe a desiatky sekúnd nad prahom —
      s jedným sa jazda nepotvrdí nikdy.

      Táto značka povie systému, že práca ešte nie je hotová, a kúpi čas na to,
      aby sa prúd meraní rozbehol. Musí sa vždy ukončiť, inak ju systém ukončí
      sám a appku potrestá.
    */
    private var drzanieProcesu: UIBackgroundTaskIdentifier = .invalid

    private func zacniDrzatProces() {
        guard drzanieProcesu == .invalid else { return }
        let zacni = {
            self.drzanieProcesu = UIApplication.shared.beginBackgroundTask(
                withName: "faktero.detekcia-jazdy"
            ) { [weak self] in
                // Systém dochádza s trpezlivosťou — značku treba pustiť sám,
                // inak appku zabije.
                self?.prestanDrzatProces()
            }
        }
        if Thread.isMainThread { zacni() } else { DispatchQueue.main.sync(execute: zacni) }
    }

    private func prestanDrzatProces() {
        let znacka = drzanieProcesu
        guard znacka != .invalid else { return }
        drzanieProcesu = .invalid
        let skonci = { UIApplication.shared.endBackgroundTask(znacka) }
        if Thread.isMainThread { skonci() } else { DispatchQueue.main.async(execute: skonci) }
    }

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
        zapisDennik(force: true)
        store.flush()
    }

    /// Denník sa zapisuje škrtene — merania chodia počas jazdy každú sekundu
    /// a zápis pri každom by budil flash pamäť zbytočne.
    private func zapisDennik(force: Bool = false) {
        let teraz = now
        guard force || teraz - dennikZapisanyO >= 30 else { return }
        dennikZapisanyO = teraz
        store.setMeta(Self.metaDennik, json(dennik.dictionary))
    }

    /// Čo detekcia naozaj robila — pre obrazovku Diagnostika.
    var diagnostika: [String: Any] {
        bootstrap()
        var d = dennik.dictionary
        // V úložisku sú sekundy, JavaScript počíta v milisekundách.
        for kluc in ["poslednePrebudenie", "posledneNeuspesne", "poslednaJazda", "poslednyFix"] {
            if let v = d[kluc] as? Double { d[kluc] = (v * 1000).rounded() }
        }
        d["stav"] = engine.trip != nil ? "jazdi" : (preciseOn ? "overuje" : "caka")
        d["sekundyNadPrahom"] = engine.sekundyNadPrahom
        d["potrebnychSekund"] = engine.potrebnychSekund
        return d
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
        if let raw = store.meta(Self.metaDennik), let d = jsonObject(raw) {
            dennik = Dennik(dictionary: d)
        }
        // `fixovOdSpustenia` sa zámerne neobnovuje — patrí k tomuto behu.
        dennik.spusteniProcesu += 1
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

    /// Ukončené jazdy, ktoré si aplikácia ešte neprevzala.
    func unresolvedTrips() -> [BufferedTrip] {
        bootstrap()
        return store.unresolvedTrips()
    }

    /// Aplikácia jazdu uložila do knihy jázd — plugin ju už nemá komu ponúkať.
    func markSynced(tripId: String) {
        bootstrap()
        notifications.remove(tripId: tripId)
        store.setStatus(tripId: tripId, status: .synced)
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
        zamietaClovek = true
        apply(engine.discard(tripId: tripId, at: now))
        zamietaClovek = false
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

        // Znížená presnosť je tichý zabijak detekcie: merania chodia s
        // odchýlkou v kilometroch, `isUsable` ich zahodí všetky a jazda sa
        // nepotvrdí nikdy. Zvonku sa to nedá rozoznať od vypnutej detekcie.
        let presna = manager.accuracyAuthorization == .fullAccuracy ? "granted" : "denied"

        /*
          Obnovovanie na pozadí je druhý tichý zabijak. Keď ho má človek
          vypnuté, systém appku pri väčšom presune vôbec nespustí — lacné
          prebudenie nepríde, presná poloha sa nezapne a nerozpozná sa nič.
          V nastaveniach appky pritom všetky povolenia svietia zeleno, takže
          zvonku to vyzerá ako pokazená detekcia.
         */
        let obnovovanie: String
        switch Self.backgroundRefresh() {
        case .available: obnovovanie = "granted"
        case .denied, .restricted: obnovovanie = "denied"
        @unknown default: obnovovanie = "prompt"
        }

        return [
            "location": poloha,
            "background": pozadie,
            "motion": pohyb,
            "precise": presna,
            "backgroundRefresh": obnovovanie,
            // Nie je to povolenie, ale prácu na pozadí obmedzuje rovnako.
            "lowPower": ProcessInfo.processInfo.isLowPowerModeEnabled ? "on" : "off"
        ]
    }

    /// `UIApplication` sa smie čítať len z hlavného vlákna a metódy pluginu
    /// bežia na vlastnom fronte — bez tohto by to bolo tiché porušenie UIKitu.
    private static func backgroundRefresh() -> UIBackgroundRefreshStatus {
        if Thread.isMainThread { return UIApplication.shared.backgroundRefreshStatus }
        return DispatchQueue.main.sync { UIApplication.shared.backgroundRefreshStatus }
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

    /// Kľúč z `NSLocationTemporaryUsageDescriptionDictionary`. Keď v Info.plist
    /// chýba, iOS žiadosť ticho zahodí — nič sa neopýta a nič sa nevráti ako
    /// chyba.
    static let ucelPresnejPolohy = "KnihaJazd"

    /// Zníženú presnosť si človek nastaví raz a appka o nej vie len z hlásenia
    /// v diagnostike. Požiadať sa dá len dočasne — trvalé zapnutie je v
    /// Nastaveniach a odtiaľ ho appka nevypýta.
    func requestPrecise(completion: @escaping () -> Void) {
        bootstrap()
        guard manager.accuracyAuthorization == .reducedAccuracy else { return completion() }
        guard manager.authorizationStatus == .authorizedAlways
            || manager.authorizationStatus == .authorizedWhenInUse
        else { return completion() }
        manager.requestTemporaryFullAccuracyAuthorization(withPurposeKey: Self.ucelPresnejPolohy) {
            _ in
            DispatchQueue.main.async(execute: completion)
        }
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
        // Bez toho appku systém uspí skôr, než sa prúd meraní rozbehne.
        zacniDrzatProces()
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
        prestanDrzatProces()
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
                dennik.poslednaJazda = now
                zapisDennik(force: true)
                store.insert(trip: jazda, status: .active)
                if notify, let t = texts {
                    notifications.fire(tripId: jazda.id, texts: t)
                }
                delegate?.driveDetected(tripId: jazda.id, startedAt: jazda.startedAt)
                oznam(.fakteroDriveStarted, [
                    DriveEventKey.tripId: jazda.id,
                    DriveEventKey.startedAt: jazda.startedAt,
                    DriveEventKey.manual: jazda.manual
                ])

            case .pointAppended(let tripId, let bod):
                store.append(point: bod, tripId: tripId)
                emitTripUpdatedThrottled()

            case .tripEnded(let jazda):
                // Kto na notifikáciu odpovedal hneď na začiatku cesty, má
                // jazdu vybavenú — nemá sa čo znovu pýtať po príchode.
                store.update(trip: jazda, status: jazda.classification == nil ? .ended : .confirmed)
                store.flush()
                delegate?.tripEnded(jazda)
                oznam(.fakteroDriveEnded, [
                    DriveEventKey.tripId: jazda.id,
                    DriveEventKey.distanceMeters: jazda.distanceMeters
                ])

            case .bufferDiscarded:
                // Rozpracovaný buffer overovania nebol nikde uložený — jazda
                // vzniká až potvrdením prahu. Zamietnutie už uloženej jazdy
                // rieši `discardTrip(tripId:)`.
                if !zamietaClovek {
                    dennik.neuspesnychOvereni += 1
                    dennik.posledneNeuspesne = now
                    zapisDennik(force: true)
                }
            }
        }
    }

    private func emitTripUpdatedThrottled() {
        guard let jazda = engine.trip else { return }
        let teraz = now
        guard teraz - lastTripUpdateAt >= Self.tripUpdateThrottle else { return }
        lastTripUpdateAt = teraz
        delegate?.tripUpdated(jazda)
        oznam(.fakteroDriveUpdated, [
            DriveEventKey.tripId: jazda.id,
            DriveEventKey.startedAt: jazda.startedAt,
            DriveEventKey.distanceMeters: jazda.distanceMeters,
            DriveEventKey.manual: jazda.manual
        ])
    }

    /// Ohlásenie do appky. Vždy na hlavnom vlákne — na druhom konci je
    /// kreslenie a ActivityKit, a tie inam nepatria.
    private func oznam(_ meno: Notification.Name, _ udaje: [String: Any]) {
        DispatchQueue.main.async {
            NotificationCenter.default.post(name: meno, object: nil, userInfo: udaje)
        }
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
                let ukony = engine.wake(at: teraz)
                if !ukony.isEmpty {
                    dennik.prebudeni += 1
                    dennik.poslednePrebudenie = teraz
                    // Rýchlosť sa meria za jedno overovanie — inak by po prvej
                    // diaľnici ostalo v denníku číslo, ktoré s ničím nesúvisí.
                    dennik.najvyssiaRychlost = 0
                    dennik.fixovVOvereni = 0
                    dennik.pouzitelnychVOvereni = 0
                    dennik.najlepsiaPresnost = nil
                    zapisDennik(force: true)
                }
                apply(ukony)
            }
            dennik.poslednyFix = fix.timestamp
            dennik.fixovOdSpustenia += 1
            if engine.state == .verifying {
                dennik.fixovVOvereni += 1
                // Rovnaká podmienka, akú používa motor — meranie s horšou
                // presnosťou sa do trasy nedostane a sériu prerušuje.
                if fix.accuracy >= 0, fix.accuracy < config.maxAccuracyMeters {
                    dennik.pouzitelnychVOvereni += 1
                }
                if fix.accuracy >= 0, dennik.najlepsiaPresnost.map({ fix.accuracy < $0 }) ?? true {
                    dennik.najlepsiaPresnost = fix.accuracy
                }
                if fix.speedKmh > dennik.najvyssiaRychlost {
                    dennik.najvyssiaRychlost = fix.speedKmh
                }
                if fix.speedKmh > dennik.najvyssiaRychlostVobec {
                    dennik.najvyssiaRychlostVobec = fix.speedKmh
                }
            }
            zapisDennik()
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
