import { appConfig } from '../../config/appConfig';

type MonitorContext = Record<string, unknown>;

export interface MonitoringProvider {
  captureError(error: unknown, context?: MonitorContext): void;
  captureEvent(name: string, context?: MonitorContext): void;
  identify?(userId: string, traits?: MonitorContext): void;
}

class ConsoleMonitoringProvider implements MonitoringProvider {
  captureError(error: unknown, context?: MonitorContext) {
    console.error('[QuickBite]', error, context);
  }

  captureEvent(name: string, context?: MonitorContext) {
    console.info('[QuickBite event]', name, context);
  }

  identify(userId: string, traits?: MonitorContext) {
    console.info('[QuickBite identify]', userId, traits);
  }
}

class DeferredMonitoringProvider implements MonitoringProvider {
  constructor(private readonly providerName: string) {}

  captureError(error: unknown, context?: MonitorContext) {
    console.warn(`[QuickBite] ${this.providerName} provider is not installed`, { error, context });
  }

  captureEvent(name: string, context?: MonitorContext) {
    console.warn(`[QuickBite] ${this.providerName} provider is not installed`, { name, context });
  }

  identify(userId: string, traits?: MonitorContext) {
    console.warn(`[QuickBite] ${this.providerName} provider is not installed`, { userId, traits });
  }
}

function createMonitoringProvider(): MonitoringProvider {
  switch (appConfig.monitoringProvider) {
    case 'sentry':
    case 'posthog':
    case 'opentelemetry':
      return new DeferredMonitoringProvider(appConfig.monitoringProvider);
    default:
      return new ConsoleMonitoringProvider();
  }
}

export const monitoring: MonitoringProvider = createMonitoringProvider();
