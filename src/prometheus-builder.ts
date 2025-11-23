export interface AbstractMetric {
  help: string;
  labels?: Record<string, string>;
  name: string;
}

export interface GaugeMetric extends AbstractMetric {
  type: 'gauge',
  value: number
}

export interface CounterMetric extends AbstractMetric {
  type: 'counter',
  value: number
}

export type Metric = CounterMetric | GaugeMetric

export function buildMetrics (metrics: Metric[]): string {
  const sortedMetrics = [...metrics].sort((a, b) => a.name.localeCompare(b.name))

  let result = ''
  for (const metric of sortedMetrics) {
    result += `# HELP ${metric.name} ${metric.help}\n# TYPE ${metric.name} ${metric.type}\n`
    const labels = Object.entries(metric.labels ?? {})
      .map(([labelKey, labelValue]) => `${labelKey}=${JSON.stringify(labelValue)}`).join(',')
    result += `${metric.name}${labels.length > 0 ? `{${labels}}` : ''} ${metric.value}\n`
  }

  return result
}
