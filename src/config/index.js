const config = {
  ragServiceUrl:
    process.env.RAG_SERVICE_URL || "http://localhost:5000",

  port: process.env.PORT || 4000,

  proxyCount: parseInt(process.env.PROXY_COUNT || "0", 10),

  uploadLimitMax: parseInt(
    process.env.RATE_LIMIT_UPLOAD_MAX || "10",
    10
  ),

  slowDownAfter: parseInt(
    process.env.RATE_LIMIT_SLOWDOWN_AFTER || "10",
    10
  ),

  inferenceMax: parseInt(
    process.env.RATE_LIMIT_INFERENCE_MAX || "30",
    10
  ),

  nodeEnv: process.env.NODE_ENV || "development",
};

module.exports = config;