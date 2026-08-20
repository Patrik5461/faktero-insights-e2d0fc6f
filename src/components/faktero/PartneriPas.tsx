/**
 * Pás partnerov, ktorý sa sám posúva.
 *
 * Zoznam je v páse **dvakrát** a animácia ho posunie presne o polovicu — vtedy
 * je druhá kópia tam, kde bola prvá na začiatku, takže sa dá skočiť späť na
 * nulu a nikto si toho nevšimne. Robí to CSS (`.faktero-pas` v `styles.css`),
 * nie JavaScript: beží to na grafickej karte, nezaťažuje to stránku a funguje
 * to aj bez toho, aby sa čokoľvek prekresľovalo.
 *
 * Partner môže mať logo alebo len meno — logo sa použije, keď je, inak sa
 * vypíše názov. To je zámer, nie provizórium: nový partner sa dá pridať hneď,
 * aj keď od neho logo ešte nemáme.
 */
import type { Partner } from "@/lib/partneri.functions";

/** Koľko sekúnd trvá jeden prechod na jedného partnera. */
const SEKUND_NA_PARTNERA = 5;

/** Koľko položiek musí mať jeden prechod, nech pás pokryje aj širokú obrazovku. */
const NAJMENEJ_POLOZIEK = 8;

function Polozka({ partner }: { partner: Partner }) {
  const obsah = partner.logo_url ? (
    <img
      src={partner.logo_url}
      alt={partner.name}
      loading="lazy"
      className="h-10 w-auto max-w-[160px] object-contain opacity-70 grayscale transition group-hover:opacity-100 group-hover:grayscale-0"
    />
  ) : (
    <span className="whitespace-nowrap text-lg font-semibold text-muted-foreground transition group-hover:text-foreground">
      {partner.name}
    </span>
  );

  if (!partner.website) {
    return <div className="group flex h-14 shrink-0 items-center px-8">{obsah}</div>;
  }
  return (
    <a
      href={partner.website}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex h-14 shrink-0 items-center px-8"
      aria-label={partner.name}
    >
      {obsah}
    </a>
  );
}

export function PartneriPas({ partneri }: { partneri: Partner[] }) {
  // Prázdny pás je horší než žiadny — sekcia sa vtedy nevykreslí vôbec.
  if (!partneri.length) return null;

  /*
    Pri dvoch partneroch by pás bol užší než obrazovka a posun o polovicu by
    odhalil prázdno. Zoznam sa preto najprv zopakuje toľkokrát, aby bol
    dostatočne dlhý, a až potom sa zdvojí kvôli plynulému napojeniu.
  */
  const nasobok = Math.max(1, Math.ceil(NAJMENEJ_POLOZIEK / partneri.length));
  const jedenPrechod = Array.from({ length: nasobok }, () => partneri).flat();
  const trvanie = `${jedenPrechod.length * SEKUND_NA_PARTNERA}s`;

  return (
    <section id="partneri" className="border-y border-border/60 bg-card/40 backdrop-blur">
      <div className="mx-auto max-w-7xl px-6 py-10 md:py-12">
        <p className="text-center text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Partneri
        </p>

        <div
          className="faktero-pas-obal relative mt-6 overflow-hidden"
          /*
            Okraje sa nechávajú vytratiť do stránky, nech pás nezačína a
            nekončí useknutým logom.
          */
          style={{
            maskImage: "linear-gradient(to right, transparent, black 8%, black 92%, transparent)",
            WebkitMaskImage:
              "linear-gradient(to right, transparent, black 8%, black 92%, transparent)",
          }}
        >
          <div className="faktero-pas flex w-max" style={{ "--pas-trvanie": trvanie } as never}>
            {/*
              Druhá kópia je pre plynulé napojenie, nie pre človeka — čítačke
              obrazovky sa preto schová, aby zoznam nečítala dvakrát.
            */}
            {jedenPrechod.map((p, i) => (
              <Polozka key={`${p.id}-${i}`} partner={p} />
            ))}
            <div className="flex" aria-hidden="true">
              {jedenPrechod.map((p, i) => (
                <Polozka key={`kopia-${p.id}-${i}`} partner={p} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
