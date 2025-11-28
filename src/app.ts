import Fastify from "fastify";
import fastifyJwt from "@fastify/jwt";
import batchesController from "./batches/batches.controller";

const app = Fastify({ logger: true });

const start = async () => {
  await app.register(fastifyJwt, { secret: process.env.JWT_SECRET ?? "dev-secret" });

  app.decorate("auth", async (req, reply) => {
    try {
      await req.jwtVerify();
    } catch {
      return reply.code(401).send({ message: "unauthorized" });
    }
  });

  app.post('/auth/dev-login', async (req, reply) => {
  const sub = (req.body as any)?.sub || process.env.FABRIC_USER || 'appUser';
  const token = await reply.jwtSign({ sub, role: 'dev' }, { expiresIn: '1h' });
  return { token };
});

  app.get("/health", async () => ({ ok: true }));

  await app.register(batchesController, { prefix: "/batches" });

  const port = Number(process.env.PORT ?? 3000);
  await app.listen({ port, host: "0.0.0.0" });
};

start().catch((err) => {
  app.log.error(err);
  process.exit(1);
});
