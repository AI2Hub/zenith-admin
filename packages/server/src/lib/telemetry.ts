import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { config } from '../config';
import logger from './logger';

let telemetrySdk: NodeSDK | null = null;
let telemetryInitialized = false;

export const initTelemetry = async (): Promise<boolean> => {
  if (!config.otel.enabled) {
    return false;
  }

  if (telemetryInitialized) {
    return true;
  }

  try {
    telemetrySdk = new NodeSDK({
      serviceName: config.otel.serviceName,
      traceExporter: new OTLPTraceExporter(),
    });
    await telemetrySdk.start();
    telemetryInitialized = true;

    logger.info('OpenTelemetry tracing enabled', {
      serviceName: config.otel.serviceName,
      serviceVersion: config.otel.serviceVersion,
    });

    return true;
  } catch (error) {
    telemetrySdk = null;
    telemetryInitialized = false;
    logger.error('Failed to initialize OpenTelemetry tracing', error);
    return false;
  }
};

export const shutdownTelemetry = async (): Promise<void> => {
  if (!telemetrySdk || !telemetryInitialized) {
    return;
  }

  try {
    await telemetrySdk.shutdown();
  } catch (error) {
    logger.error('Failed to shutdown OpenTelemetry tracing', error);
  } finally {
    telemetrySdk = null;
    telemetryInitialized = false;
  }
};
