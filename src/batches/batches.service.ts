import { FabricClient } from "../core/fabricClient";

type CreateDTO = {
  batchId: string;
  farmId: string;
  volumeLiters: number;
  lastFarmTempC?: number;
};

type TransportDTO = {
  batchId: string;
  from: string;
  to: string;
  temperatureC?: number;
  volumeLiters?: number;
};

type LabResultDTO = {
  batchId: string;
  payload: any;
};

type ApproveDTO = {
  batchId: string;
  approved: boolean;
};

type ProcessDTO = {
  batchId: string;
  processingType: "UHT" | "PASTEURIZED";
  expiresAtISO: string;
};

type ShipToRetailDTO = {
  batchId: string;
  retailerId: string;
  temperatureC?: number;
};

export class BatchesService {
  private fabric = new FabricClient({
    ccpPath: process.env.CCP_PATH ?? "./connection-org1.json",
    walletPath: process.env.WALLET_PATH ?? "./wallet",
    channel: process.env.CHANNEL ?? "mychannel",
    chaincode: process.env.CHAINCODE ?? "milkcc"
  });

  async createBatch(userId: string, dto: CreateDTO) {
    const args: string[] = [
      dto.batchId,
      dto.farmId,
      String(dto.volumeLiters),
    ];
    if (dto.lastFarmTempC !== undefined) {
      args.push(String(dto.lastFarmTempC));
    }

    const tx = await this.fabric.submit(userId, "CreateBatch", ...args);
    return { ok: true, txId: tx.txId, payload: tx.payload };
  }

  async readBatch(userId: string, batchId: string) {
    const res = await this.fabric.evaluate(userId, "ReadBatch", batchId);
    return { ok: true, payload: res };
  }

   async getHistory(userId: string, batchId: string) {
    const res = await this.fabric.evaluate(userId, "GetHistory", batchId);
    return { ok: true, payload: res };
  }

  async getAllBatches(userId: string) {
    const res = await this.fabric.evaluate(userId, "GetAllBatches");
    return { ok: true, payload: res };
  }

  async addTransportEvent(userId: string, dto: TransportDTO) {
    const args: string[] = [dto.batchId, dto.from, dto.to];
    if (dto.temperatureC !== undefined) {
      args.push(String(dto.temperatureC));
    }
    if (dto.volumeLiters !== undefined) {
      args.push(String(dto.volumeLiters));
    }

    const tx = await this.fabric.submit(userId, "AddTransportEvent", ...args);
    return { ok: true, txId: tx.txId, payload: tx.payload };
  }

  async addLabResult(userId: string, dto: LabResultDTO) {
    const tx = await this.fabric.submit(
      userId,
      "AddLabResult",
      dto.batchId,
      JSON.stringify(dto.payload)
    );
    return { ok: true, txId: tx.txId, payload: tx.payload };
  }

  async approveBatch(userId: string, dto: ApproveDTO) {
    const tx = await this.fabric.submit(
      userId,
      "ApproveBatch",
      dto.batchId,
      dto.approved ? "true" : "false"
    );
    return { ok: true, txId: tx.txId, payload: tx.payload };
  }

  async processBatch(userId: string, dto: ProcessDTO) {
    const tx = await this.fabric.submit(
      userId,
      "ProcessBatch",
      dto.batchId,
      dto.processingType,
      dto.expiresAtISO
    );
    return { ok: true, txId: tx.txId, payload: tx.payload };
  }

  async shipToRetail(userId: string, dto: ShipToRetailDTO) {
    const args: string[] = [dto.batchId, dto.retailerId];
    if (dto.temperatureC !== undefined) {
      args.push(String(dto.temperatureC));
    }

    const tx = await this.fabric.submit(
      userId,
      "ShipToRetail",
      ...args
    );
    return { ok: true, txId: tx.txId, payload: tx.payload };
  }

  async receiveAtRetail(userId: string, batchId: string) {
    const tx = await this.fabric.submit(userId, "ReceiveAtRetail", batchId);
    return { ok: true, txId: tx.txId, payload: tx.payload };
  }
}
