import { qs } from "../utils/dom";
import * as Commandline from "../commandline/commandline";
import * as TribeState from "../tribe/tribe-state";
import { ConfigKey } from "@monkeytype/schemas/configs";

qs(".pageTribe .tribePage.lobby .currentConfig")?.onChild(
  "click",
  "button",
  (e) => {
    const command = (e.childTarget as HTMLElement | null)?.getAttribute(
      "data-commands-key",
    );
    // buttons of the test config bar have no commands key
    if (command === undefined || command === null) return;
    if (!TribeState.isLeader()) return;
    if (command === "") {
      Commandline.show();
      return;
    }
    Commandline.show({ subgroupOverride: command as ConfigKey });
  },
);
