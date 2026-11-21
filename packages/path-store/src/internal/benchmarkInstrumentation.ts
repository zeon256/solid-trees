export interface BenchmarkInstrumentation {
  measurePhase: <TValue>(name: string, fn: () => TValue) => TValue;
  setCounter: (name: string, value: number) => void;
}

const BENCHMARK_INSTRUMENTATION = Symbol('benchmarkInstrumentation');

type BenchmarkInstrumentationCarrier = {
  [BENCHMARK_INSTRUMENTATION]?: BenchmarkInstrumentation;
};

/** Attaches instrumentation without changing the public option shape. */
export function attachBenchmarkInstrumentation<TValue extends object>(
  value: TValue,
  instrumentation: BenchmarkInstrumentation | null | undefined
): TValue {
  if (instrumentation === null || instrumentation === undefined) {
    return value;
  }

  Object.defineProperty(value, BENCHMARK_INSTRUMENTATION, {
    configurable: true,
    enumerable: false,
    value: instrumentation,
    writable: false,
  });
  return value;
}

function hasBenchmarkInstrumentationSlot<TValue extends object>(
  value: TValue
): value is TValue & BenchmarkInstrumentationCarrier {
  return BENCHMARK_INSTRUMENTATION in value;
}

export function getBenchmarkInstrumentation<TValue extends object>(
  value: TValue | null | undefined
): BenchmarkInstrumentation | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (!hasBenchmarkInstrumentationSlot(value)) {
    return null;
  }

  return value[BENCHMARK_INSTRUMENTATION] ?? null;
}

/** Executes phase timing only when a benchmark fixture injects instrumentation. */
export function withBenchmarkPhase<TValue>(
  instrumentation: BenchmarkInstrumentation | null | undefined,
  name: string,
  fn: () => TValue
): TValue {
  if (instrumentation === null || instrumentation === undefined) {
    return fn();
  }

  return instrumentation.measurePhase(name, fn);
}

export function setBenchmarkCounter(
  instrumentation: BenchmarkInstrumentation | null | undefined,
  name: string,
  value: number
): void {
  if (
    !Number.isFinite(value) ||
    instrumentation === null ||
    instrumentation === undefined
  ) {
    return;
  }

  instrumentation.setCounter(name, value);
}
