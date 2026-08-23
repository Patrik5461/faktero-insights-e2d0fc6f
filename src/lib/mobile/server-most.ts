/**
 * Most na server — verzia pre web.
 *
 * Na webe je operácia obyčajná serverová funkcia, takže sa len nájde v zozname
 * a odovzdá TanStacku. V zabalenej appke sa tento súbor nahradí za
 * `server-most.mobile.ts` (alias vo `vite.config.mobile.ts`), aby sa serverové
 * jadro do balíčka vôbec nedostalo.
 */
import { useServerFn } from "@tanstack/react-start";
import { nacitajBlocekFn } from "@/lib/faktero/blocek.functions";
import { createExpenseFn } from "@/lib/faktero/expenses.functions";
import { bankaPrehladFn } from "@/lib/faktero/mobil-banka.functions";
import { syncBankTransactions } from "@/lib/faktero/tatrabanka.functions";
import { vystaveneFakturyFn } from "@/lib/faktero/mobil-faktura.functions";
import { generateInvoicePdf } from "@/lib/faktero/pdf.functions";
import { sendInvoiceEmailFn } from "@/lib/faktero/email.functions";
import { bulkMarkPaidFn } from "@/lib/faktero/invoice-bulk.functions";
import { sendReminderFn } from "@/lib/faktero/reminders.functions";
import {
  listExpensesFn,
  updateExpenseFn,
  deleteExpenseFn,
  getExpenseFileUrlFn,
} from "@/lib/faktero/expenses.functions";
import { podkladyFakturyFn, poslednaFakturaFn } from "@/lib/faktero/mobil-faktura.functions";
import { vystavFakturuFn } from "@/lib/faktero/faktura-vystavenie.functions";
import {
  rezervujCislaFn,
  stavRezervaciiFn,
  uvolniCislaFn,
} from "@/lib/faktero/cisla-rezervacia.functions";
import { getPriceContext } from "@/lib/faktero/ceny.functions";
import { lookupCompanyByIcoFn } from "@/lib/faktero/company-lookup.functions";
import { presunDokladDoPrijatychFn } from "@/lib/faktero/doklad-presun.functions";
import {
  stavZrusenieUctuFn,
  poziadajOZrusenieUctuFn,
  odvolajZrusenieUctuFn,
} from "@/lib/faktero/ucet-zrusenie.functions";
import { posliSpatnuVazbu } from "@/lib/faktero/spatna-vazba.functions";
import { recordLegalAcceptance } from "@/lib/legal.functions";
import type { Operacia } from "./operacie";

/** Jediné miesto, kde sa kľúč operácie stretáva so serverovou funkciou. */
export const SERVEROVE_FUNKCIE: Record<Operacia, any> = {
  "blocek-precitaj": nacitajBlocekFn,
  "vydavok-uloz": createExpenseFn,
  "banka-prehlad": bankaPrehladFn,
  "banka-stiahni": syncBankTransactions,
  "faktury-zoznam": vystaveneFakturyFn,
  "faktura-pdf": generateInvoicePdf,
  "faktura-email": sendInvoiceEmailFn,
  "faktury-uhradene": bulkMarkPaidFn,
  "faktura-upomienka": sendReminderFn,
  "vydavky-zoznam": listExpensesFn,
  "vydavok-uprav": updateExpenseFn,
  "vydavok-zmaz": deleteExpenseFn,
  "vydavok-subor": getExpenseFileUrlFn,
  "faktura-podklady": podkladyFakturyFn,
  "faktura-posledna": poslednaFakturaFn,
  "faktura-vystav": vystavFakturuFn,
  "cisla-rezervuj": rezervujCislaFn,
  "cisla-uvolni": uvolniCislaFn,
  "cisla-stav": stavRezervaciiFn,
  "cennik-kontext": getPriceContext,
  "firma-podla-ica": lookupCompanyByIcoFn,
  "doklad-presun": presunDokladDoPrijatychFn,
  "ucet-stav-zrusenia": stavZrusenieUctuFn,
  "ucet-poziadaj-o-zrusenie": poziadajOZrusenieUctuFn,
  "ucet-odvolaj-zrusenie": odvolajZrusenieUctuFn,
  "spatna-vazba": posliSpatnuVazbu,
  "pravne-suhlasy": recordLegalAcceptance,
};

export function useOperacia<T = any>(kluc: Operacia): (vstup: { data: any }) => Promise<T> {
  return useServerFn(SERVEROVE_FUNKCIE[kluc]) as any;
}
