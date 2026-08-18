# Pád smerovača pri presmerovaní z trasy s `ssr: false`

Zistené pri audite 2026-08-18. **Nie je to naša chyba** a zámerne sa neopravuje —
tu je zapísané prečo, aby sa to o pol roka nezačalo hľadať odznova.

## Čo sa deje

Odhlásený návštevník otvorí `/dashboard` alebo `/faktury`. Stránka sa nakoniec
vykreslí správne (prihlásenie), ale v konzole pristanú tri hlásenia:

```
TypeError: Cannot read properties of undefined (reading 'routeId')
Minified React error #520
Minified React error #422
```

Prvé dve čísla nie sú chyba, ale hlásenie o **zotavení**: #520 je „there was an
error during concurrent rendering but React was able to recover by instead
synchronously rendering the entire root", #422 to isté od najbližšej `Suspense`
hranice. Skutočná chyba je ten `TypeError`.

## Kde presne

`@tanstack/react-router`, `dist/esm/Match.js`:

```js
var Match = React.memo(function MatchImpl({ routeId }) {
  return jsx(MatchView, { match: useStore(router.stores.getMatchStore(routeId), (v) => v) });
});

function MatchView({ router, match }) {
  const route = router.routesById[match.routeId];   // ← `match` je undefined
```

Vrstva `_authenticated` má `ssr: false` a jej `beforeLoad` hádže
`redirect({ to: "/prihlasenie" })`. Smerovač pritom zmaže záznam o zhode
z úložiska, kým ho komponent ešte vykresľuje — `useStore` vráti `undefined`
a `match.routeId` spadne. React sa zotaví prekreslením koreňa, preto to nikto
nevidí.

Je to preteky, nie pevná vlastnosť trasy: pri jednom behu chytila chyba
`/bankove-ucty/pripojit`, pri ďalšom `/dashboard` a `/faktury`.

## Čo bolo overené

- **Vo vývojovom builde sa to nedeje.** Všetky tri trasy presmerujú čisto —
  ide o cestu súbežného vykresľovania, ktorá je len v produkčnom builde.
- **Povýšenie nepomôže.** V najnovšej verzii (1.170.30, nasadená 1.170.19) je
  ten riadok rovnako bez poistky.

## Prečo sa to neopravuje

Zvažované boli tri cesty:

1. **Nechať tak** — stojí to jedno synchrónne prekreslenie pri presmerovaní na
   prihlásenie, používateľ nevidí nič. _Toto je zvolená cesta._
2. **Prerobiť bránu prihlásenia** — nehádzať presmerovanie z `beforeLoad`, ale
   vrátiť `user: null` a presmerovať z komponentu. Preteky zmiznú, ale odhlásenému
   sa potom spustia loadery podradených trás a začnú volať serverové funkcie bez
   prihlásenia. Za tichú hlášku v konzole zlá výmena.
3. **Zaplátať knižnicu** (`if (!match) return null;` cez `patch-package`) —
   presné, ale pridáva závislosť a `postinstall` do produkčného nasadenia.

Keby sa raz robila trojka, patrí sem odkaz na patch. Ak upstream doplní poistku,
tento súbor môže zmiznúť.

## Text hlásenia pre autorov knižnice

> **`MatchView` reads `match.routeId` without a guard, crashing when a redirect
> removes the match mid-render**
>
> With a client-only route (`ssr: false`) whose `beforeLoad` throws
> `redirect(...)`, the match is deleted from the store while its `Match`
> component is still rendering. `useStore(router.stores.getMatchStore(routeId))`
> then yields `undefined` and `MatchView` throws
> `TypeError: Cannot read properties of undefined (reading 'routeId')`.
> React recovers (errors #520 and #422), so the page renders, but the whole root
> re-renders synchronously.
>
> Reproduces only in a production build (concurrent rendering); a dev server is
> clean. Present in 1.170.19 and unchanged in 1.170.30.
>
> A guard in `MatchView` (`if (!match) return null`) would be enough — the match
> is gone and the pending navigation will render the new tree anyway.
