const { createClient } = require("redis");

function createRedisClient(redisUrl) {
  const client = createClient({
    url: redisUrl,
    socket: {
      connectTimeout: 3_000,
      reconnectStrategy: (retries) => Math.min(retries * 100, 2_000),
    },
  });

  client.on("error", (err) => {
    console.error("[redis] error:", err?.message || err);
  });

  const connectPromise = client.connect();

  return { client, connectPromise };
}

module.exports = {
  createRedisClient,
};

