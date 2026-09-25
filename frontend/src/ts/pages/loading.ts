import Page from "./page";
import * as Skeleton from "../utils/skeleton";
import { qs, qsr } from "../utils/dom";

const pageEl = qs(".page.pageLoading");
const barEl = pageEl?.qs(".bar");
const errorEl = pageEl?.qs(".error");
const spinnerEl = pageEl?.qs(".spinner");
const textEl = pageEl?.qs(".text");
const introEl = pageEl?.qs(".clashIntro");

// MonkeyClash: the first load of the visit plays the README banner animation
// and lasts until it is over. The svg animates as soon as it loads, so it only
// gets its src once on screen, and is fetched early so that is instant.
const INTRO_SRC = "/images/monkeyclash-banner.svg";
const INTRO_MS = 1300;
const sleep = async (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));
new Image().src = INTRO_SRC;

export async function waitForIntro(): Promise<void> {
  const el = introEl?.native as HTMLImageElement | undefined;
  if (el?.isConnected !== true || el.src !== "") return;
  for (let i = 0; i < 40 && !el.checkVisibility(); i++) await sleep(50);
  // let the app fade in first
  await sleep(250);
  el.src = INTRO_SRC;
  await el.decode().catch(() => undefined);
  await sleep(INTRO_MS);
}

export async function updateBar(
  percentage: number,
  duration: number,
): Promise<void> {
  await barEl?.qs(".fill")?.promiseAnimate({
    width: `${percentage}%`,
    duration,
  });
}

export function updateText(text: string): void {
  textEl?.show()?.setHtml(text);
}

export function showSpinner(): void {
  barEl?.hide();
  errorEl?.hide();
  spinnerEl?.show();
  textEl?.hide();
}

export function showError(): void {
  barEl?.hide();
  spinnerEl?.hide();
  errorEl?.show();
  textEl?.hide();
}

export async function showBar(): Promise<void> {
  barEl?.show();
  errorEl?.hide();
  spinnerEl?.hide();
  textEl?.hide();
}

export const page = new Page({
  id: "loading",
  element: qsr(".page.pageLoading"),
  path: "/",
  afterHide: async (): Promise<void> => {
    Skeleton.remove("pageLoading");
    // later loads (account page, ...) go straight to the bar
    introEl?.remove();
  },
  beforeShow: async (): Promise<void> => {
    Skeleton.append("pageLoading", "main");
  },
});
