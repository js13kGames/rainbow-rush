import { RainbowRush } from "./rainbow-rush.ts";

const main = () => {
  const context = document.querySelector<HTMLCanvasElement>("#game")?.getContext("2d");

  if (!context) {
    alert("unsupported");
    return;
  }

  new RainbowRush(context);
};

main();
