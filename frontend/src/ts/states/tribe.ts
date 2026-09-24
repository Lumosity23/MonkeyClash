import { createSignal } from "solid-js";

export const [getIsInARoom, setIsInARoom] = createSignal(false);
// the current room code, undefined outside of a room
export const [getTribeRoomId, setTribeRoomId] = createSignal<
  string | undefined
>(undefined);
export const [getIsTribeLeader, setIsTribeLeader] = createSignal(false);
