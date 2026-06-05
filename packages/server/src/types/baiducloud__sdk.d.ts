declare module '@baiducloud/sdk' {
  interface BosClientOptions {
    endpoint: string;
    credentials: { ak: string; sk: string };
  }
  class BosClient {
    constructor(options: BosClientOptions);
    putObjectFromString(bucket: string, key: string, data: string, options?: Record<string, unknown>): Promise<unknown>;
    getObject(bucket: string, key: string): Promise<{ body: string }>;
    deleteObject(bucket: string, key: string): Promise<unknown>;
  }
  export default BosClient;
}
