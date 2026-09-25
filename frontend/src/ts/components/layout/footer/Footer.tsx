import { JSXElement } from "solid-js";

import { getIsScreenshotting } from "../../../states/core";
import { getFocus } from "../../../states/test";
import { cn } from "../../../utils/cn";
import { Button } from "../../common/Button";
import { Keytips } from "./Keytips";
import { ThemeIndicator } from "./ThemeIndicator";
import { VersionButton } from "./VersionButton";

export function Footer(): JSXElement {
  return (
    <footer
      class={cn("relative text-xs text-sub", {
        "opacity-0": getIsScreenshotting(),
      })}
    >
      <Keytips />

      <div
        class="-m-2 flex justify-between gap-8 transition-opacity"
        classList={{
          "opacity-0": getFocus(),
        }}
      >
        <div class="grid grid-cols-1 justify-items-start xs:grid-cols-2 sm:grid-cols-4 lg:flex">
          <Button
            variant="text"
            text="github"
            fa={{
              icon: "fa-code",
              fixedWidth: true,
            }}
            href="https://github.com/Lumosity23/MonkeyClash"
          />
          <Button
            variant="text"
            text="support monkeyclash"
            fa={{
              icon: "fa-mug-hot",
              fixedWidth: true,
            }}
            href="https://buymeacoffee.com/lumosity23"
          />
          <Button
            variant="text"
            text="powered by monkeytype"
            fa={{
              icon: "fa-keyboard",
              fixedWidth: true,
            }}
            href="https://monkeytype.com"
          />
        </div>
        <div class="flex flex-col items-end text-right lg:flex-row">
          <ThemeIndicator />
          <VersionButton />
        </div>
      </div>
    </footer>
  );
}
