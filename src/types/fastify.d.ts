import "fastify";

declare module "fastify" {
  interface FastifyInstance {
    auth: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
  interface FastifyRequest {
    user?: { sub: string; role?: string };
  }
}
