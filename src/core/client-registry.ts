export interface FlushableNeatlogsClient {
  readonly workflowName?: string;
  flush(): Promise<boolean>;
}

const clients = new Set<FlushableNeatlogsClient>();

export function registerClient(client: FlushableNeatlogsClient): void {
  clients.add(client);
}

export function unregisterClient(client: FlushableNeatlogsClient): void {
  clients.delete(client);
}

export function getRegisteredClients(): FlushableNeatlogsClient[] {
  return [...clients];
}
