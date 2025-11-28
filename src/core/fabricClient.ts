import { Wallets, Gateway, DefaultEventHandlerStrategies } from "fabric-network";
import fs from "fs";

type Cfg = { ccpPath: string; walletPath: string; channel: string; chaincode: string };

export class FabricClient {
  private ccp: any;
  private walletPath: string;
  private channel: string;
  private chaincode: string;

  constructor(cfg: Cfg) {
    this.ccp = JSON.parse(fs.readFileSync(cfg.ccpPath, "utf8"));
    this.walletPath = cfg.walletPath;
    this.channel = cfg.channel;
    this.chaincode = cfg.chaincode;
  }

  private async withGateway<T>(userId: string, fn: (g: Gateway) => Promise<T>): Promise<T> {
    const wallet = await Wallets.newFileSystemWallet(this.walletPath);
    const identity = await wallet.get(userId);
    if (!identity) throw new Error(`Identidade '${userId}' não encontrada na wallet (${this.walletPath}).`);

    const gateway = new Gateway();
    await gateway.connect(this.ccp, {
      wallet,
      identity: userId,
      discovery: { enabled: true, asLocalhost: true },
      eventHandlerOptions: { strategy: DefaultEventHandlerStrategies.NETWORK_SCOPE_ALLFORTX }
    });

    try {
      return await fn(gateway);
    } finally {
      gateway.disconnect();
    }
  }

  async evaluate(userId: string, fn: string, ...args: string[]): Promise<string> {
    return this.withGateway(userId, async g => {
      const network = await g.getNetwork(this.channel);
      const contract = network.getContract(this.chaincode);
      const buf = await contract.evaluateTransaction(fn, ...args);
      return buf.toString();
    });
  }

  async submit(userId: string, fn: string, ...args: string[]): Promise<{ txId: string; payload: string }> {
    return this.withGateway(userId, async g => {
      const network = await g.getNetwork(this.channel);
      const contract = network.getContract(this.chaincode);
      const tx = contract.createTransaction(fn);
      const payload = await tx.submit(...args);
      return { txId: tx.getTransactionId(), payload: payload.toString() };
    });
  }
}
