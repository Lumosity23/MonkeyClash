import Page from "./page";
import * as Skeleton from "../utils/skeleton";
import { qs, qsr } from "../utils/dom";

const pageEl = qs(".page.pageLoading");
const barEl = pageEl?.qs(".bar");
const errorEl = pageEl?.qs(".error");
const spinnerEl = pageEl?.qs(".spinner");
const textEl = pageEl?.qs(".text");
const introEl = pageEl?.qs(".clashIntro");

// MonkeyClash: the first load of the visit plays the intro (the README banner
// animation) and lasts until it is over
export async function waitForIntro(): Promise<void> {
  const el = introEl?.native;
  if (el?.isConnected !== true) return;
  // its animations only start once the app is on screen
  for (let i = 0; i < 40 && !el.checkVisibility(); i++) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  await Promise.all(
    el
      .getAnimations({ subtree: true })
      .map(async (animation) => animation.finished.catch(() => undefined)),
  );
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
