import { createFileRoute } from "@tanstack/react-router";
import { KnihaJazdApka } from "@/components/faktero/mobil/jazdy/KnihaJazdApka";

/**
 * Náhľad samostatnej appky Kniha jázd.
 *
 * To isté, čo `/app` robí pre Faktero: obrazovky sa dajú pozrieť v prehliadači
 * bez inštalácie. Do telefónu ide tá istá appka zabalená zvlášť
 * (`vite.config.jazdy.ts`), táto trasa je len na pozeranie.
 */
export const Route = createFileRoute("/app-jazdy")({
  head: () => ({
    meta: [
      { title: "Kniha jázd" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
    ],
  }),
  component: KnihaJazdApka,
});
