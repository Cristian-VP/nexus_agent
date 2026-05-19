const localBackendBridgeUrl = "http://localhost:4000";

export function getBackendBridgeUrl(): string {
  return process.env.BACKEND_BRIDGE_URL ?? localBackendBridgeUrl;
}