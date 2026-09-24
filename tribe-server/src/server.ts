import type { Server as HttpServer } from "node:http";
import { Server, type DefaultEventsMap, type Socket } from "socket.io";
import { DEFAULT_TIMINGS, Room, type Timings } from "./room.ts";
import {
  guestName,
  isRecord,
  newRoomId,
  parseProgress,
  parseResult,
  sanitizeName,
  sanitizeRoomName,
} from "./utils.ts";

export type TribeServerOptions = {
  // shown in the tribe menu
  version: string;
  // client versions (tribe.ts expectedVersion) allowed to connect
  clientVersions: string[];
  corsOrigin: string[] | true;
  maxUsersPerRoom: number;
  timings: Timings;
};

export const DEFAULT_OPTIONS: TribeServerOptions = {
  version: "monkeyclash",
  clientVersions: ["25.12.4", "dev"],
  corsOrigin: true,
  maxUsersPerRoom: 10,
  timings: DEFAULT_TIMINGS,
};

const CHAT_COOLDOWN_MS = 250;
const MAX_CONFIG_BYTES = 200_000;

type SocketData = {
  name: string;
  roomId: string | undefined;
  lastChatAt: number;
};

type TribeIo = Server<
  DefaultEventsMap,
  DefaultEventsMap,
  DefaultEventsMap,
  SocketData
>;
type TribeSocket = Socket<
  DefaultEventsMap,
  DefaultEventsMap,
  DefaultEventsMap,
  SocketData
>;
type Ack = (response: unknown) => void;

export function createTribeServer(
  httpServer: HttpServer,
  options: Partial<TribeServerOptions> = {},
): { io: TribeIo; close: () => Promise<void> } {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const io: TribeIo = new Server(httpServer, {
    cors: { origin: opts.corsOrigin },
  });
  const rooms = new Map<string, Room>();

  function roomOf(socket: TribeSocket): Room | undefined {
    const { roomId } = socket.data;
    return roomId === undefined ? undefined : rooms.get(roomId);
  }

  function leaveRoom(socket: TribeSocket): void {
    const room = roomOf(socket);
    socket.data.roomId = undefined;
    if (!room) return;
    room.removeUser(socket.id);
    if (room.users.size === 0) {
      room.dispose();
      rooms.delete(room.id);
    }
  }

  function notify(socket: TribeSocket, message: string, level = -1): void {
    socket.emit("system_notification", { message, level });
  }

  io.on("connection", (rawSocket) => {
    const socket: TribeSocket = rawSocket;
    const requested = sanitizeName(socket.handshake.query["name"]);
    socket.data = {
      name:
        requested === undefined || requested === "Guest"
          ? guestName()
          : requested,
      roomId: undefined,
      lastChatAt: 0,
    };
    socket.emit("user_update_name", { name: socket.data.name });

    // Registers a handler that never takes the server down on a bad payload.
    const on = (event: string, handler: (...args: unknown[]) => void): void => {
      socket.on(event, (...args: unknown[]) => {
        try {
          handler(...args);
        } catch (error) {
          console.error(`[tribe] ${event} from ${socket.id} failed`, error);
        }
      });
    };

    // Same, for actions only the room leader may do.
    const onLeader = (
      event: string,
      handler: (room: Room, data: Record<string, unknown>) => void,
    ): void => {
      on(event, (data) => {
        const room = roomOf(socket);
        if (!room?.isLeader(socket.id)) return;
        handler(room, isRecord(data) ? data : {});
      });
    };

    // Same, for actions of any room member.
    const onMember = (
      event: string,
      handler: (room: Room, data: Record<string, unknown>) => void,
    ): void => {
      on(event, (data) => {
        const room = roomOf(socket);
        if (!room) return;
        handler(room, isRecord(data) ? data : {});
      });
    };

    // ----------------------------------------------------------- system

    on("system_version_check", (data, ack) => {
      if (typeof ack !== "function") return;
      const version = isRecord(data) ? data["version"] : undefined;
      const ok =
        typeof version === "string" && opts.clientVersions.includes(version);
      (ack as Ack)({ status: ok ? "ok" : "mismatch", version: opts.version });
    });

    on("system_stats", (ack) => {
      if (typeof ack !== "function") return;
      const publicRooms = [...rooms.values()].filter((r) => !r.isPrivate);
      (ack as Ack)({
        stats: [
          io.engine.clientsCount,
          // custom: [all rooms (create button), public rooms (browse button)]
          { mm: [0, 0, 0, 0], custom: [rooms.size, publicRooms.length] },
          [0, 0, 0, 0],
          opts.version,
        ],
      });
    });

    on("user_set_name", (data) => {
      const name = sanitizeName(isRecord(data) ? data["name"] : undefined);
      if (name === undefined) {
        notify(socket, "Invalid name");
        return;
      }
      if (socket.data.roomId !== undefined) {
        notify(socket, "Leave the room to change your name", 0);
        return;
      }
      socket.data.name = name;
      socket.emit("user_update_name", { name });
    });

    // ------------------------------------------------------------ rooms

    on("room_get_public_rooms", (data, ack) => {
      if (typeof ack !== "function") return;
      const search =
        isRecord(data) && typeof data["search"] === "string"
          ? data["search"].toLowerCase()
          : "";
      (ack as Ack)({
        rooms: [...rooms.values()]
          .filter((r) => !r.isPrivate && r.name.toLowerCase().includes(search))
          .map((r) => r.toPublicData()),
      });
    });

    on("room_create", (data) => {
      const config = isRecord(data) ? data["config"] : undefined;
      if (
        !isRecord(config) ||
        JSON.stringify(config).length > MAX_CONFIG_BYTES
      ) {
        notify(socket, "Invalid room config");
        return;
      }
      leaveRoom(socket);
      const room = new Room(
        io,
        opts.timings,
        newRoomId((id) => rooms.has(id)),
        { id: socket.id, name: socket.data.name },
        config,
      );
      rooms.set(room.id, room);
      socket.data.roomId = room.id;
      void socket.join(room.id);
      socket.emit("room_joined", { room: room.toData() });
    });

    on("room_join", (data, ack) => {
      if (typeof ack !== "function") return;
      const roomId = isRecord(data) ? data["roomId"] : undefined;
      const room =
        typeof roomId === "string"
          ? rooms.get(roomId.toLowerCase())
          : undefined;

      const error = !room
        ? "Room not found"
        : room.isBanned(socket.id)
          ? "You are banned from this room"
          : room.users.size >= opts.maxUsersPerRoom
            ? "Room is full"
            : undefined;
      if (error !== undefined || !room) {
        notify(socket, error ?? "Room not found");
        (ack as Ack)({ status: error });
        return;
      }
      if (socket.data.roomId === room.id) {
        (ack as Ack)({ room: room.toData() });
        return;
      }

      leaveRoom(socket);
      room.addUser({ id: socket.id, name: socket.data.name });
      socket.data.roomId = room.id;
      void socket.join(room.id);
      (ack as Ack)({ room: room.toData() });
    });

    on("room_leave", () => leaveRoom(socket));

    on("dev_room", () => undefined);

    // ------------------------------------------------------ leader only

    onLeader("room_init_race", (room) => room.initRace());
    onLeader("room_back_to_lobby", (room) => room.backToLobby());
    onLeader("room_toggle_visibility", (room) => room.toggleVisibility());

    onLeader("room_update_name", (room, data) => {
      const name = sanitizeRoomName(data["name"]);
      if (name !== undefined) room.setName(name);
    });

    onLeader("room_update_config", (room, data) => {
      const config = data["config"];
      if (
        !isRecord(config) ||
        JSON.stringify(config).length > MAX_CONFIG_BYTES
      ) {
        notify(socket, "Invalid room config");
        return;
      }
      room.updateConfig(config);
    });

    onLeader("room_give_leader", (room, data) => {
      const userId = data["userId"];
      if (typeof userId === "string" && userId !== socket.id) {
        room.setLeader(userId);
      }
    });

    onLeader("room_ban_user", (room, data) => {
      const userId = data["userId"];
      if (typeof userId !== "string" || userId === socket.id) return;
      if (!room.users.has(userId)) return;
      const target = io.sockets.sockets.get(userId);
      if (target) target.data.roomId = undefined;
      room.ban(userId);
    });

    // --------------------------------------------------------- members

    onMember("room_ready_update", (room) => room.setReady(socket.id));

    onMember("room_afk_update", (room, data) => {
      room.setAfk(socket.id, data["isAfk"] === true);
    });

    onMember("room_chatting_update", (room, data) => {
      room.setChatting(socket.id, data["isChatting"] === true);
    });

    onMember("room_chat_message", (room, data) => {
      const message = data["message"];
      if (typeof message !== "string") return;
      const trimmed = message.trim().slice(0, 512);
      const now = Date.now();
      if (trimmed === "" || now - socket.data.lastChatAt < CHAT_COOLDOWN_MS) {
        return;
      }
      socket.data.lastChatAt = now;
      room.chat(socket.id, trimmed);
    });

    onMember("room_progress_update", (room, data) => {
      const progress = parseProgress(data);
      if (progress) room.setProgress(socket.id, progress);
    });

    onMember("room_result", (room, data) => {
      const result = parseResult(data["result"]);
      if (result) room.setResult(socket.id, result);
    });

    socket.on("disconnect", () => leaveRoom(socket));
  });

  return {
    io,
    close: async () => {
      // rooms keep timers running, stop them before closing
      for (const room of rooms.values()) room.dispose();
      rooms.clear();
      await io.close();
    },
  };
}
