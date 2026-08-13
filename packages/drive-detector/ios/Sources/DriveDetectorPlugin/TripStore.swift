import Foundation
import SQLite3
import DriveDetectorCore

/// Trvalé úložisko rozpracovanej jazdy.
///
/// UserDefaults sem nepatria: hodinová jazda má stovky bodov a plist sa
/// prepisuje celý pri každom zápise. SQLite v `Application Support` znesie
/// dávkový zápis aj zabitie procesu uprostred.
///
/// Body sa zapisujú **po dvadsiatich**, nie po jednom — zápis na disk pri
/// každom meraní by na dlhej ceste zbytočne budil flash pamäť.
final class TripStore {
    enum Status: String {
        case active
        case ended
        case confirmed
        case discarded
        /// Aplikácia si jazdu prevzala a uložila do knihy jázd.
        case synced
    }

    private static let transient = unsafeBitCast(-1, to: sqlite3_destructor_type.self)
    private static let batchSize = 20

    private var db: OpaquePointer?
    private let queue = DispatchQueue(label: "sk.faktero.drivedetector.store")
    private var buffered: [(tripId: String, seq: Int, point: TripPoint)] = []
    private var nextSeq: [String: Int] = [:]

    // MARK: - Otvorenie

    func open() {
        queue.sync {
            guard db == nil else { return }
            let fm = FileManager.default
            guard let base = fm.urls(for: .applicationSupportDirectory, in: .userDomainMask).first else { return }
            let dir = base.appendingPathComponent("FakteroDriveDetector", isDirectory: true)
            try? fm.createDirectory(at: dir, withIntermediateDirectories: true)
            let url = dir.appendingPathComponent("trips.sqlite")

            if sqlite3_open_v2(url.path, &db, SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE | SQLITE_OPEN_FULLMUTEX, nil) != SQLITE_OK {
                db = nil
                return
            }

            // Až po vytvorení súboru. Bez tohto by sa po reštarte telefónu
            // (kým ho nikto neodomkol) nedalo zapisovať — a práve vtedy nás
            // budí významná zmena polohy.
            try? fm.setAttributes(
                [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication],
                ofItemAtPath: url.path)
            exec("pragma journal_mode = wal;")
            exec("pragma synchronous = normal;")
            exec("""
                create table if not exists trips (
                    id text primary key,
                    started_at real not null,
                    ended_at real,
                    distance_meters real not null default 0,
                    max_speed_kmh real not null default 0,
                    classification text,
                    manual integer not null default 0,
                    status text not null
                );
                """)
            exec("""
                create table if not exists points (
                    trip_id text not null,
                    seq integer not null,
                    lat real not null,
                    lng real not null,
                    speed_kmh real not null,
                    accuracy real not null,
                    altitude real,
                    ts real not null,
                    primary key (trip_id, seq)
                );
                """)
            exec("create table if not exists meta (key text primary key, value text not null);")
        }
    }

    // MARK: - Jazdy

    func insert(trip: BufferedTrip, status: Status) {
        queue.sync {
            exec("begin immediate;")
            if let stmt = prepare("""
                insert or replace into trips
                (id, started_at, ended_at, distance_meters, max_speed_kmh, classification, manual, status)
                values (?, ?, ?, ?, ?, ?, ?, ?);
                """) {
                bind(stmt, 1, trip.id)
                sqlite3_bind_double(stmt, 2, trip.startedAt)
                if let koniec = trip.endedAt { sqlite3_bind_double(stmt, 3, koniec) } else { sqlite3_bind_null(stmt, 3) }
                sqlite3_bind_double(stmt, 4, trip.distanceMeters)
                sqlite3_bind_double(stmt, 5, trip.maxSpeedKmh)
                if let z = trip.classification { bind(stmt, 6, z.rawValue) } else { sqlite3_bind_null(stmt, 6) }
                sqlite3_bind_int(stmt, 7, trip.manual ? 1 : 0)
                bind(stmt, 8, status.rawValue)
                sqlite3_step(stmt)
                sqlite3_finalize(stmt)
            }
            // Body zdedené z overovacej fázy — jazda ich má hneď pri založení.
            for (i, bod) in trip.points.enumerated() {
                writePoint(tripId: trip.id, seq: i, point: bod)
            }
            nextSeq[trip.id] = trip.points.count
            exec("commit;")
        }
    }

    func update(trip: BufferedTrip, status: Status) {
        queue.sync {
            flushLocked()
            guard let stmt = prepare("""
                update trips set ended_at = ?, distance_meters = ?, max_speed_kmh = ?,
                    classification = ?, status = ? where id = ?;
                """) else { return }
            if let koniec = trip.endedAt { sqlite3_bind_double(stmt, 1, koniec) } else { sqlite3_bind_null(stmt, 1) }
            sqlite3_bind_double(stmt, 2, trip.distanceMeters)
            sqlite3_bind_double(stmt, 3, trip.maxSpeedKmh)
            if let z = trip.classification { bind(stmt, 4, z.rawValue) } else { sqlite3_bind_null(stmt, 4) }
            bind(stmt, 5, status.rawValue)
            bind(stmt, 6, trip.id)
            sqlite3_step(stmt)
            sqlite3_finalize(stmt)
        }
    }

    func setStatus(tripId: String, status: Status) {
        queue.sync {
            guard let stmt = prepare("update trips set status = ? where id = ?;") else { return }
            bind(stmt, 1, status.rawValue)
            bind(stmt, 2, tripId)
            sqlite3_step(stmt)
            sqlite3_finalize(stmt)
        }
    }

    /// Stav sa tu zámerne nemení: jazda sa zaraďuje hneď na začiatku cesty
    /// z notifikácie a musí ostať `active`, inak by ju reštart nenašiel.
    func setClassification(tripId: String, classification: Classification) {
        queue.sync {
            guard let stmt = prepare("update trips set classification = ? where id = ?;") else { return }
            bind(stmt, 1, classification.rawValue)
            bind(stmt, 2, tripId)
            sqlite3_step(stmt)
            sqlite3_finalize(stmt)
        }
    }

    func append(point: TripPoint, tripId: String) {
        queue.sync {
            let seq = nextSeq[tripId] ?? nextSeqLocked(for: tripId)
            nextSeq[tripId] = seq + 1
            buffered.append((tripId, seq, point))
            if buffered.count >= Self.batchSize { flushLocked() }
        }
    }

    /// Dopísať všetko rozpísané. Volá sa pri uspaní, konci jazdy a pred čítaním.
    func flush() {
        queue.sync { flushLocked() }
    }

    func trip(id: String) -> BufferedTrip? {
        queue.sync {
            flushLocked()
            return loadTrip(where: "id = ?", bindings: [id])
        }
    }

    func activeTrip() -> BufferedTrip? {
        queue.sync {
            flushLocked()
            return loadTrip(where: "status = ?", bindings: [Status.active.rawValue], order: "started_at desc")
        }
    }

    /// Posledná ukončená, ktorú ešte nikto nezaradil ani nezamietol.
    func latestUnresolvedTrip() -> BufferedTrip? {
        queue.sync {
            flushLocked()
            return loadTrip(where: "status = ?", bindings: [Status.ended.rawValue], order: "ended_at desc")
        }
    }

    /// Všetky ukončené jazdy, ktoré si aplikácia ešte neprevzala — vrátane
    /// tých, ktoré človek zaradil z notifikácie. Cez víkend ich môže byť aj
    /// desať a stratiť sa nesmie ani jedna.
    func unresolvedTrips(limit: Int = 50) -> [BufferedTrip] {
        queue.sync {
            flushLocked()
            guard let stmt = prepare("""
                select id from trips where status in ('ended', 'confirmed')
                order by coalesce(ended_at, started_at) asc limit ?;
                """) else { return [] }
            sqlite3_bind_int64(stmt, 1, Int64(limit))
            var ids: [String] = []
            while sqlite3_step(stmt) == SQLITE_ROW {
                if let c = sqlite3_column_text(stmt, 0) { ids.append(String(cString: c)) }
            }
            sqlite3_finalize(stmt)
            return ids.compactMap { loadTrip(where: "id = ?", bindings: [$0]) }
        }
    }

    /// Zamietnuté ideme zmazať hneď, zvyšok si necháme týždeň — appka si ich
    /// medzitým vyzdvihne a uloží do knihy jázd.
    func purge(olderThan seconds: TimeInterval, now: TimeInterval) {
        queue.sync {
            exec("delete from points where trip_id in (select id from trips where status = 'discarded');")
            exec("delete from trips where status = 'discarded';")
            guard let stmt = prepare("select id from trips where status in ('ended','confirmed','synced') and coalesce(ended_at, started_at) < ?;") else { return }
            sqlite3_bind_double(stmt, 1, now - seconds)
            var ids: [String] = []
            while sqlite3_step(stmt) == SQLITE_ROW {
                if let c = sqlite3_column_text(stmt, 0) { ids.append(String(cString: c)) }
            }
            sqlite3_finalize(stmt)
            for id in ids {
                if let s = prepare("delete from points where trip_id = ?;") {
                    bind(s, 1, id); sqlite3_step(s); sqlite3_finalize(s)
                }
                if let s = prepare("delete from trips where id = ?;") {
                    bind(s, 1, id); sqlite3_step(s); sqlite3_finalize(s)
                }
                nextSeq.removeValue(forKey: id)
            }
        }
    }

    // MARK: - Meta (nastavenia, príznaky)

    func meta(_ key: String) -> String? {
        queue.sync {
            guard let stmt = prepare("select value from meta where key = ?;") else { return nil }
            bind(stmt, 1, key)
            var out: String?
            if sqlite3_step(stmt) == SQLITE_ROW, let c = sqlite3_column_text(stmt, 0) {
                out = String(cString: c)
            }
            sqlite3_finalize(stmt)
            return out
        }
    }

    func setMeta(_ key: String, _ value: String?) {
        queue.sync {
            if let value {
                guard let stmt = prepare("insert or replace into meta (key, value) values (?, ?);") else { return }
                bind(stmt, 1, key)
                bind(stmt, 2, value)
                sqlite3_step(stmt)
                sqlite3_finalize(stmt)
            } else {
                guard let stmt = prepare("delete from meta where key = ?;") else { return }
                bind(stmt, 1, key)
                sqlite3_step(stmt)
                sqlite3_finalize(stmt)
            }
        }
    }

    // MARK: - Vnútro (všetko beží na `queue`)

    private func flushLocked() {
        guard !buffered.isEmpty else { return }
        exec("begin immediate;")
        for zaznam in buffered {
            writePoint(tripId: zaznam.tripId, seq: zaznam.seq, point: zaznam.point)
        }
        exec("commit;")
        buffered.removeAll(keepingCapacity: true)
    }

    private func writePoint(tripId: String, seq: Int, point: TripPoint) {
        guard let stmt = prepare("""
            insert or replace into points (trip_id, seq, lat, lng, speed_kmh, accuracy, altitude, ts)
            values (?, ?, ?, ?, ?, ?, ?, ?);
            """) else { return }
        bind(stmt, 1, tripId)
        sqlite3_bind_int64(stmt, 2, Int64(seq))
        sqlite3_bind_double(stmt, 3, point.lat)
        sqlite3_bind_double(stmt, 4, point.lng)
        sqlite3_bind_double(stmt, 5, point.speedKmh)
        sqlite3_bind_double(stmt, 6, point.accuracy)
        if let v = point.altitude { sqlite3_bind_double(stmt, 7, v) } else { sqlite3_bind_null(stmt, 7) }
        sqlite3_bind_double(stmt, 8, point.timestamp)
        sqlite3_step(stmt)
        sqlite3_finalize(stmt)
    }

    private func nextSeqLocked(for tripId: String) -> Int {
        guard let stmt = prepare("select coalesce(max(seq), -1) + 1 from points where trip_id = ?;") else { return 0 }
        bind(stmt, 1, tripId)
        var out = 0
        if sqlite3_step(stmt) == SQLITE_ROW { out = Int(sqlite3_column_int64(stmt, 0)) }
        sqlite3_finalize(stmt)
        return out
    }

    private func loadTrip(where podmienka: String, bindings: [String], order: String = "started_at desc") -> BufferedTrip? {
        guard let stmt = prepare("""
            select id, started_at, ended_at, distance_meters, max_speed_kmh, classification, manual
            from trips where \(podmienka) order by \(order) limit 1;
            """) else { return nil }
        for (i, hodnota) in bindings.enumerated() { bind(stmt, Int32(i + 1), hodnota) }
        defer { sqlite3_finalize(stmt) }
        guard sqlite3_step(stmt) == SQLITE_ROW, let idText = sqlite3_column_text(stmt, 0) else { return nil }

        let id = String(cString: idText)
        var zaradenie: Classification?
        if sqlite3_column_type(stmt, 5) != SQLITE_NULL, let c = sqlite3_column_text(stmt, 5) {
            zaradenie = Classification(rawValue: String(cString: c))
        }
        return BufferedTrip(
            id: id,
            startedAt: sqlite3_column_double(stmt, 1),
            endedAt: sqlite3_column_type(stmt, 2) == SQLITE_NULL ? nil : sqlite3_column_double(stmt, 2),
            points: loadPoints(tripId: id),
            distanceMeters: sqlite3_column_double(stmt, 3),
            maxSpeedKmh: sqlite3_column_double(stmt, 4),
            classification: zaradenie,
            manual: sqlite3_column_int(stmt, 6) == 1)
    }

    private func loadPoints(tripId: String) -> [TripPoint] {
        guard let stmt = prepare("""
            select lat, lng, speed_kmh, accuracy, altitude, ts from points
            where trip_id = ? order by seq asc;
            """) else { return [] }
        bind(stmt, 1, tripId)
        var body: [TripPoint] = []
        while sqlite3_step(stmt) == SQLITE_ROW {
            body.append(TripPoint(
                lat: sqlite3_column_double(stmt, 0),
                lng: sqlite3_column_double(stmt, 1),
                speedKmh: sqlite3_column_double(stmt, 2),
                accuracy: sqlite3_column_double(stmt, 3),
                altitude: sqlite3_column_type(stmt, 4) == SQLITE_NULL ? nil : sqlite3_column_double(stmt, 4),
                timestamp: sqlite3_column_double(stmt, 5)))
        }
        sqlite3_finalize(stmt)
        return body
    }

    private func exec(_ sql: String) {
        guard let db else { return }
        sqlite3_exec(db, sql, nil, nil, nil)
    }

    private func prepare(_ sql: String) -> OpaquePointer? {
        guard let db else { return nil }
        var stmt: OpaquePointer?
        guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK else {
            sqlite3_finalize(stmt)
            return nil
        }
        return stmt
    }

    private func bind(_ stmt: OpaquePointer, _ index: Int32, _ value: String) {
        sqlite3_bind_text(stmt, index, value, -1, Self.transient)
    }
}
