import { cert, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import type { Db } from "mongodb";

export type Identity = { uid: string; name: string };

// Turns a Firebase ID token sent by the client into the player's account,
// undefined for guests and invalid or expired tokens.
export type Authenticate = (token: string) => Promise<Identity | undefined>;

export function firebaseAuthenticator(
  serviceAccountPath: string,
  db: Db,
): Authenticate {
  const auth = getAuth(
    initializeApp({ credential: cert(serviceAccountPath) }, "tribe"),
  );
  const users = db.collection<{ uid: string; name: string }>("users");

  return async (token) => {
    try {
      const { uid } = await auth.verifyIdToken(token);
      const user = await users.findOne({ uid }, { projection: { name: 1 } });
      // a firebase account that never finished monkeytype's sign up
      if (!user) return undefined;
      return { uid, name: user.name };
    } catch {
      return undefined;
    }
  };
}
