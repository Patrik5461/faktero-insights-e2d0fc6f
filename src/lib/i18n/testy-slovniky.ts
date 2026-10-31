/**
 * Spoločná príprava testov (vitest `setupFiles` vo `vite.config.ts`):
 * slovníky DE a CS sa inak načítavajú až na požiadanie.
 */
import { nacitajVsetkySlovniky } from "./jazyk";

await nacitajVsetkySlovniky();
