import { FastifyInstance } from "fastify";
import { z } from "zod";
import { BatchesService } from "./batches.service";

const createSchema = z.object({
  batchId: z.string().min(3),
  farmId: z.string().min(1),
  volumeLiters: z.number().int().positive(),
  fatPercent: z.number().positive()
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
    const { batchId, farmId, volumeLiters, fatPercent } = parsed.data;
    const createRes = await service.createBatch(userId, { batchId, farmId, volumeLiters, fatPercent });
    return reply.code(201).send(createRes);
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
}
