import { createFileRoute } from "@tanstack/react-router";
import { MobilnaApka } from "@/components/faktero/mobil/MobilApp";

export const Route = createFileRoute("/app")({
  head: () => ({
    meta: [
      { title: "Faktero" },
      // Bez `viewport-fit=cover` sa na iPhone nedá odsadiť od výrezu.
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
    ],
  }),
  component: MobilnaApka,
});
