import { FastifyInstance } from "fastify";
import { z } from "zod";
import { BatchesService } from "./batches.service";

const createSchema = z.object({
  batchId: z.string().min(3),
  farmId: z.string().min(1),
  volumeLiters: z.number().positive(),
  lastFarmTempC: z.number().optional()
});

const transportSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  temperatureC: z.number().optional(),
  volumeLiters: z.number().positive().optional()
});

const labResultSchema = z.object({
  cbt: z.number().optional(),
  ccs: z.number().optional(),
  acidity: z.number().optional(),
  density: z.number().optional(),
  antibiotics: z.boolean().optional(),
  fraudFlags: z.array(z.string()).optional()
});

const approveSchema = z.object({
  approved: z.boolean()
});

const processSchema = z.object({
  processingType: z.enum(["UHT", "PASTEURIZED"]),
  expiresAtISO: z.string().min(1)
});

const shipSchema = z.object({
  retailerId: z.string().min(1),
  temperatureC: z.number().optional()
});

export default async function routes(app: FastifyInstance) {
  const service = new BatchesService();

  // Criar lote -> chama chaincode CreateBatch
  app.post("/", { preHandler: app.auth }, async (req, reply) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send(parsed.error.flatten());
    if (!req.user || typeof req.user !== "object" || !("sub" in req.user)) {
      return reply.code(401).send({ message: "Unauthorized" });
    }
    const userId = (req.user as { sub: string }).sub;
    const { batchId, farmId, volumeLiters, lastFarmTempC } = parsed.data;
    const createRes = await service.createBatch(userId, { batchId, farmId, volumeLiters, lastFarmTempC });
    return reply.code(201).send(createRes);
  });

  // Listar todos os lotes -> chama chaincode GetAllBatches
  app.get("/", { preHandler: app.auth }, async (req, reply) => {
    if (!req.user || typeof req.user !== "object" || !("sub" in req.user)) {
      return reply.code(401).send({ message: "Unauthorized" });
    }
    const userId = (req.user as { sub: string }).sub;
    const allBatchesRes = await service.getAllBatches(userId);
    return reply.send(allBatchesRes);
  });

  // Ler lote -> chama chaincode ReadBatch
  app.get("/:id", { preHandler: app.auth }, async (req, reply) => {
    if (!req.user || typeof req.user !== "object" || !("sub" in req.user)) {
      return reply.code(401).send({ message: "Unauthorized" });
    }
    const userId = (req.user as { sub: string }).sub;
    const id = (req.params as any).id as string;
    const readRes = await service.readBatch(userId, id);
    return reply.send(readRes);
  });

  // VISÃO PÚBLICA PARA CONSUMIDOR (ex: leitura via QR Code)
  // Não exige JWT, usa identidade de leitura definida em FABRIC_USER ou 'appUser'
  app.get("/:id/public", async (req, reply) => {
    const id = (req.params as any).id as string;
    const publicUserId = process.env.FABRIC_USER ?? "appUser";

    try {
      const readRes = await service.readBatch(publicUserId, id);
      const historyRes = await service.getHistory(publicUserId, id);

      const batch = JSON.parse(readRes.payload as unknown as string);
      const history = JSON.parse(historyRes.payload as unknown as string);

      const labResults = Array.isArray((batch as any).labResults)
        ? (batch as any).labResults
        : [];
      const lastLab = labResults.length > 0 ? labResults[labResults.length - 1] : undefined;

      let qualityStatus: "APROVADO" | "REPROVADO" | "EM_ANALISE" = "EM_ANALISE";
      if ((batch as any).approved === true) qualityStatus = "APROVADO";
      if ((batch as any).approved === false) qualityStatus = "REPROVADO";

      let qualityNote = "Nenhuma análise laboratorial registrada.";
      if (lastLab) {
        const hasIssues = !!lastLab.antibiotics || (Array.isArray(lastLab.fraudFlags) && lastLab.fraudFlags.length > 0);
        if (hasIssues) {
          qualityNote = "Foram detectadas irregularidades na análise de qualidade.";
        } else {
          qualityNote = "Análise laboratorial registrada sem irregularidades.";
        }
      }

      const finalStatus = qualityStatus;

      const publicView = {
        batchId: (batch as any).batchId,
        origin: {
          producerId: (batch as any).producerId
        },
        collection: {
          collectedAt: (batch as any).createdAt
        },
        quality: {
          status: qualityStatus,
          note: qualityNote
        },
        processing: {
          type: (batch as any).processing ?? null,
          processedAt: (batch as any).processedAt ?? null,
          expiresAt: (batch as any).expiresAt ?? null
        },
        finalStatus,
        history
      };

      return reply.send(publicView);
    } catch (err: any) {
      if (err && typeof err.message === "string" && err.message.includes("Lote não encontrado")) {
        return reply.code(404).send({ message: "Lote não encontrado" });
      }
      req.log.error({ err }, "Erro ao buscar visão pública do lote");
      return reply.code(500).send({ message: "Erro ao buscar informações do lote" });
    }
  });

  // Histórico do lote -> chama chaincode GetHistory
  app.get("/:id/history", { preHandler: app.auth }, async (req, reply) => {
    if (!req.user || typeof req.user !== "object" || !("sub" in req.user)) {
      return reply.code(401).send({ message: "Unauthorized" });
    }
    const userId = (req.user as { sub: string }).sub;
    const id = (req.params as any).id as string;
    const historyRes = await service.getHistory(userId, id);
    return reply.send(historyRes);
  });

  // Evento de transporte -> chama chaincode AddTransportEvent
  app.post("/:id/transport", { preHandler: app.auth }, async (req, reply) => {
    const parsed = transportSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send(parsed.error.flatten());
    if (!req.user || typeof req.user !== "object" || !("sub" in req.user)) {
      return reply.code(401).send({ message: "Unauthorized" });
    }
    const userId = (req.user as { sub: string }).sub;
    const id = (req.params as any).id as string;
    const txRes = await service.addTransportEvent(userId, {
      batchId: id,
      ...parsed.data
    });
    return reply.code(201).send(txRes);
  });

  // Resultado de laboratório -> chama chaincode AddLabResult
  app.post("/:id/lab-results", { preHandler: app.auth }, async (req, reply) => {
    const parsed = labResultSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send(parsed.error.flatten());
    if (!req.user || typeof req.user !== "object" || !("sub" in req.user)) {
      return reply.code(401).send({ message: "Unauthorized" });
    }
    const userId = (req.user as { sub: string }).sub;
    const id = (req.params as any).id as string;
    const txRes = await service.addLabResult(userId, {
      batchId: id,
      payload: parsed.data
    });
    return reply.code(201).send(txRes);
  });

  // Aprovar/reprovar lote -> chama chaincode ApproveBatch
  app.post("/:id/approve", { preHandler: app.auth }, async (req, reply) => {
    const parsed = approveSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send(parsed.error.flatten());
    if (!req.user || typeof req.user !== "object" || !("sub" in req.user)) {
      return reply.code(401).send({ message: "Unauthorized" });
    }
    const userId = (req.user as { sub: string }).sub;
    const id = (req.params as any).id as string;
    const txRes = await service.approveBatch(userId, {
      batchId: id,
      approved: parsed.data.approved
    });
    return reply.code(201).send(txRes);
  });

  // Processar lote -> chama chaincode ProcessBatch
  app.post("/:id/process", { preHandler: app.auth }, async (req, reply) => {
    const parsed = processSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send(parsed.error.flatten());
    if (!req.user || typeof req.user !== "object" || !("sub" in req.user)) {
      return reply.code(401).send({ message: "Unauthorized" });
    }
    const userId = (req.user as { sub: string }).sub;
    const id = (req.params as any).id as string;
    const txRes = await service.processBatch(userId, {
      batchId: id,
      processingType: parsed.data.processingType,
      expiresAtISO: parsed.data.expiresAtISO
    });
    return reply.code(201).send(txRes);
  });

  // Enviar para varejo -> chama chaincode ShipToRetail
  app.post("/:id/ship-to-retail", { preHandler: app.auth }, async (req, reply) => {
    const parsed = shipSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send(parsed.error.flatten());
    if (!req.user || typeof req.user !== "object" || !("sub" in req.user)) {
      return reply.code(401).send({ message: "Unauthorized" });
    }
    const userId = (req.user as { sub: string }).sub;
    const id = (req.params as any).id as string;
    const txRes = await service.shipToRetail(userId, {
      batchId: id,
      retailerId: parsed.data.retailerId,
      temperatureC: parsed.data.temperatureC
    });
    return reply.code(201).send(txRes);
  });

  // Receber no varejo -> chama chaincode ReceiveAtRetail
  app.post("/:id/receive-at-retail", { preHandler: app.auth }, async (req, reply) => {
    if (!req.user || typeof req.user !== "object" || !("sub" in req.user)) {
      return reply.code(401).send({ message: "Unauthorized" });
    }
    const userId = (req.user as { sub: string }).sub;
    const id = (req.params as any).id as string;
    const txRes = await service.receiveAtRetail(userId, id);
    return reply.code(201).send(txRes);
  });
}
