import { RainbowRush } from "./rainbow-rush.ts";
import type { WavedashSDK } from "@wvdsh/sdk-js";

const main = () => {
  RainbowRush.launch(document.querySelector<HTMLCanvasElement>("#game"));

  (window.Wavedash as WavedashSDK | undefined)?.init({
    debug: false,
  });
};

main();
