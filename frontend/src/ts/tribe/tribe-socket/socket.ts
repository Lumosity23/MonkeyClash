import { io } from "socket.io-client";
import { envConfig } from "virtual:env-config";

export default io(
  envConfig.tribeUrl !== "" ? envConfig.tribeUrl : window.location.origin,
  {
    autoConnect: false,
    secure: true,
    reconnectionAttempts: 0,
    reconnection: false,
    query: {
      name: "Guest",
    },
  },
);
