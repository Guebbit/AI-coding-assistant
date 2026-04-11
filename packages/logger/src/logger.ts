import { createLogger, format, transports, type Logger } from "winston";

function asBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) {
    return defaultValue;
  }

  return value.toLowerCase() === "true";
}

const LOG_ENABLED = asBoolean(process.env.LOG_ENABLED, true);
const LOG_LEVEL = process.env.LOG_LEVEL ?? "info";
const LOG_PRETTY = asBoolean(process.env.LOG_PRETTY, false);

const jsonFormat = format.combine(
  format.timestamp(),
  format.errors({ stack: true }),
  format.splat(),
  format.json()
);

const prettyFormat = format.combine(
  format.colorize(),
  format.timestamp(),
  format.printf(({ timestamp, level, message, ...meta }) => {
    const details = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : "";
    return `${timestamp} ${level}: ${message}${details}`;
  })
);

export const logger = createLogger({
  level: LOG_LEVEL,
  silent: !LOG_ENABLED,
  defaultMeta: { service: "ai-assistant" },
  format: LOG_PRETTY ? prettyFormat : jsonFormat,
  transports: [new transports.Console()],
});

export function getLogger(component: string): Logger {
  return logger.child({ component });
}
