import { FabricClient } from "../core/fabricClient";

type CreateDTO = { batchId: string; farmId: string; volumeLiters: number; fatPercent: number };

export class BatchesService {
  private fabric = new FabricClient({
    ccpPath: process.env.CCP_PATH ?? "./connection-org1.json",
    walletPath: process.env.WALLET_PATH ?? "./wallet",
    channel: process.env.CHANNEL ?? "mychannel",
    chaincode: process.env.CHAINCODE ?? "milkcc"
  });

  async createBatch(userId: string, dto: CreateDTO) {
    const tx = await this.fabric.submit(
      userId,
      "CreateBatch",
      dto.batchId,
      dto.farmId,
      String(dto.volumeLiters),
      String(dto.fatPercent)
    );
    return { ok: true, txId: tx.txId, payload: tx.payload };
  }

  async readBatch(userId: string, batchId: string) {
    const res = await this.fabric.evaluate(userId, "ReadBatch", batchId);
    return { ok: true, payload: res };
  }

  async getAllBatches(userId: string) {
    const res = await this.fabric.evaluate(userId, "GetAllBatches");
    return { ok: true, payload: res };
  }
}
