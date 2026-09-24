import { JSXElement, Show } from "solid-js";

import {
  showErrorNotification,
  showSuccessNotification,
} from "../../../states/notifications";
import { getFocus } from "../../../states/test";
import { getTribeRoomId } from "../../../states/tribe";
import { cn } from "../../../utils/cn";
import { Button } from "../../common/Button";

// Room code in the top right corner while in a tribe room, click copies the invite link.
export function TribeRoomBadge(): JSXElement {
  const copyInviteLink = async (roomId: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(`${location.origin}/tribe/${roomId}`);
      showSuccessNotification("Invite link copied");
    } catch (e) {
      showErrorNotification(`Could not copy to clipboard: ${String(e)}`);
    }
  };

  return (
    <Show when={getTribeRoomId()}>
      {(roomId) => (
        <Button
          variant="text"
          class={cn("text-sub", {
            "opacity-(--nav-focus-opacity)": getFocus(),
          })}
          balloon={{ text: "copy invite link", position: "down" }}
          dataset={{ "data-nav-item": "tribeRoom" }}
          fa={{ icon: "fa-link", fixedWidth: true }}
          onClick={() => void copyInviteLink(roomId())}
        >
          <span>
            room <span class="text-main">{roomId()}</span>
          </span>
        </Button>
      )}
    </Show>
  );
}
