import { MedplumClient } from "@medplum/core";
import { config } from "./config.js";

let client: MedplumClient | undefined;
let loginPromise: Promise<MedplumClient> | undefined;

export function medplumConfigured(): boolean {
  return Boolean(config.MEDPLUM_CLIENT_ID && config.MEDPLUM_CLIENT_SECRET);
}

export async function getMedplum(): Promise<MedplumClient> {
  if (!medplumConfigured()) throw new Error("medplum_not_configured");
  if (client) return client;
  if (!loginPromise) {
    loginPromise = (async () => {
      const instance = new MedplumClient({
        baseUrl: config.MEDPLUM_BASE_URL,
        clientId: config.MEDPLUM_CLIENT_ID,
        clientSecret: config.MEDPLUM_CLIENT_SECRET,
      });
      await instance.startClientLogin(config.MEDPLUM_CLIENT_ID!, config.MEDPLUM_CLIENT_SECRET!);
      client = instance;
      return instance;
    })().catch((error) => {
      loginPromise = undefined;
      throw error;
    });
  }
  return loginPromise;
}
