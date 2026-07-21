import pino from "pino";

const isProduction = process.env.NODE_ENV === "production";
const logFormat = process.env.LOG_FORMAT || (isProduction ? "json" : "pretty");
const logLevel = process.env.LOG_LEVEL || "info";

function createLogger(name?: string): pino.Logger {
  const options: pino.LoggerOptions = {
    level: logLevel,
    name: name || "memecoin",
  };

  if (logFormat === "pretty" && !isProduction) {
    return pino({
      ...options,
      transport: {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "SYS:standard",
          ignore: "pid,hostname",
        },
      },
    });
  }

  return pino(options);
}

const rootLogger = createLogger();

function logger(name: string): pino.Logger {
  return rootLogger.child({ module: name });
}

export { rootLogger, logger, createLogger };
export type Logger = pino.Logger;
