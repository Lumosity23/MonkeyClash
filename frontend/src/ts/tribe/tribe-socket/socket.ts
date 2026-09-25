import { io } from "socket.io-client";
import { envConfig } from "virtual:env-config";
import { getIdToken } from "../../firebase";

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
    // logged in players prove who they are, their duels count in the stats
    auth: (callback) => {
      void sendToken(callback);
    },
  },
);

async function sendToken(
  callback: (data: Record<string, string>) => void,
): Promise<void> {
  const token = await getIdToken().catch(() => null);
  callback(token === null ? {} : { token });
}
