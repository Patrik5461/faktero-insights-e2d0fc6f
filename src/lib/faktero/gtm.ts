/**
 * Google Tag Manager.
 *
 * Kontajner sa načíta na webe, **nie v mobilnej appke** — tá beží na vlastnej
 * schéme (`capacitor://localhost`), kde je meranie návštevnosti webu
 * bezpredmetné a externý skript by tam navyše narazil na politiku obsahu.
 *
 * Faktero má vlastnú lištu súhlasu s cookies. Surový útržok od Googlu ju
 * nepozná a značky by sa spustili aj tomu, kto klikol „Iba nevyhnutné".
 * Preto je pred kontajnerom režim súhlasu (Consent Mode v2): predvolene je
 * **všetko zamietnuté** a povolí sa až tým, čo si človek naozaj odklikol.
 */

export const GTM_ID = "GTM-WDT9V5V4";

/** Kľúč, pod ktorým lišta súhlasu drží voľbu. Musí sedieť s `cookie-consent.tsx`. */
const KLUC_SUHLASU = "faktero-cookie-consent";

/**
 * Beží v hlavičke pred kontajnerom, teda ešte pred hydratáciou.
 *
 * Poradie je dôležité: `consent default` musí byť v dataLayer skôr, než sa
 * GTM načíta. Keby prišiel neskôr, značky by sa medzitým stihli spustiť.
 */
export const SKRIPT_SUHLASU = `(function(){try{
if(!/^https?:$/.test(location.protocol))return;
window.dataLayer=window.dataLayer||[];
function gtag(){dataLayer.push(arguments);}
window.gtag=window.gtag||gtag;
var s={};try{s=JSON.parse(localStorage.getItem(${JSON.stringify(KLUC_SUHLASU)})||"{}")}catch(e){}
var a=s.analytics?"granted":"denied",m=s.marketing?"granted":"denied";
gtag('consent','default',{
 ad_storage:m,ad_user_data:m,ad_personalization:m,
 analytics_storage:a,functionality_storage:'granted',
 personalization_storage:a,security_storage:'granted',
 wait_for_update:500
});
}catch(e){}})();`;

/** Útržok od Googlu, doplnený o to, aby v appke nebežal. */
export const SKRIPT_GTM = `(function(w,d,s,l,i){
if(!/^https?:$/.test(location.protocol))return;
w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});
var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';
j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;
f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer',${JSON.stringify(GTM_ID)});`;

export const GTM_NOSCRIPT_SRC = `https://www.googletagmanager.com/ns.html?id=${GTM_ID}`;

/**
 * Oznámi zmenu súhlasu.
 *
 * Bez tohto by sa nová voľba prejavila až po obnovení stránky — človek klikne
 * „Prijať všetko" a meranie sa aj tak nespustí, kým niekam neprejde.
 */
export function oznamSuhlas(analytics: boolean, marketing: boolean): void {
  if (typeof window === "undefined") return;
  const w = window as any;
  if (!Array.isArray(w.dataLayer)) return;
  const a = analytics ? "granted" : "denied";
  const m = marketing ? "granted" : "denied";
  /*
    Do dataLayer nesmie ísť obyčajné pole. `gtag` tam vkladá objekt
    `arguments` a GTM príkazy rozpoznáva práve podľa neho — pole by prečítal
    ako bežnú udalosť a súhlas by sa neaktualizoval.
  */
  const gtag =
    typeof w.gtag === "function"
      ? w.gtag
      : function () {
          // eslint-disable-next-line prefer-rest-params
          w.dataLayer.push(arguments);
        };
  gtag("consent", "update", {
    ad_storage: m,
    ad_user_data: m,
    ad_personalization: m,
    analytics_storage: a,
    personalization_storage: a,
  });
  w.dataLayer.push({ event: "faktero_consent_update", analytics, marketing });
}
