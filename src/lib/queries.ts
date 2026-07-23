export const WINDOW_START = "2026-07-22 14:00:00";
export const WINDOW_END = "2026-07-22 15:00:00";
export const DEPLOY_TIME = "2026-07-22 14:32:00";

export const timelineQuery = `WITH buckets AS (
    SELECT
        toStartOfMinute(ts) AS minute,
        service,
        quantile(0.95)(latency_ms) AS p95_ms
    FROM http_logs
    WHERE ts BETWEEN {windowStart:DateTime} AND {windowEnd:DateTime}
    GROUP BY minute, service
),
baselines AS (
    SELECT
        minute,
        service,
        p95_ms,
        avg(p95_ms) OVER (
            PARTITION BY service
            ORDER BY minute
            ROWS BETWEEN 12 PRECEDING AND 1 PRECEDING
        ) AS rolling_avg,
        stddevPop(p95_ms) OVER (
            PARTITION BY service
            ORDER BY minute
            ROWS BETWEEN 12 PRECEDING AND 1 PRECEDING
        ) AS rolling_stddev
    FROM buckets
)
SELECT
    minute,
    service,
    p95_ms,
    rolling_avg,
    rolling_avg + 3 * rolling_stddev AS upper_band,
    rolling_avg - 3 * rolling_stddev AS lower_band,
    p95_ms > rolling_avg + 3 * rolling_stddev AS is_anomaly
FROM baselines
WHERE rolling_avg IS NOT NULL
ORDER BY minute, service;`;

export const rollupEvidenceQuery = `SELECT
    minute,
    service,
    endpoint,
    round(quantileMerge(0.5)(p50_state), 1) AS p50_ms,
    round(quantileMerge(0.95)(p95_state), 1) AS p95_ms,
    round(quantileMerge(0.99)(p99_state), 1) AS p99_ms,
    sumMerge(error_count_state) AS error_count,
    countMerge(request_count_state) AS request_count
FROM latency_rollup_1m
WHERE minute BETWEEN {windowStart:DateTime} AND {windowEnd:DateTime}
GROUP BY minute, service, endpoint
ORDER BY minute, service, endpoint
LIMIT 20;`;

export const heatmapQuery = `SELECT
    service,
    toStartOfTenMinutes(ts) AS bucket,
    round(avg(latency_ms) / 150, 1) AS intensity
FROM http_logs
WHERE ts BETWEEN {windowStart:DateTime} AND {windowEnd:DateTime}
GROUP BY service, bucket
ORDER BY service, bucket;`;

export const deployQuery = `SELECT service, version, deployed_at, diff
FROM deploy_events
WHERE deployed_at BETWEEN {windowStart:DateTime} AND {windowEnd:DateTime}
ORDER BY deployed_at
LIMIT 1;`;

export const diffQuery = `WITH baseline AS (
    SELECT service, avg(duration_ms) AS avg_ms
    FROM span_logs
    WHERE ts >= {deployTime:DateTime} - INTERVAL 30 MINUTE
      AND ts < {deployTime:DateTime}
    GROUP BY service
),
incident AS (
    SELECT service, avg(duration_ms) AS avg_ms
    FROM span_logs
    WHERE ts >= {deployTime:DateTime}
      AND ts < {deployTime:DateTime} + INTERVAL 30 MINUTE
    GROUP BY service
)
SELECT
    baseline.service AS service,
    baseline.avg_ms AS before_ms,
    incident.avg_ms AS after_ms,
    round(incident.avg_ms / baseline.avg_ms, 1) AS amplification
FROM baseline
LEFT JOIN incident USING (service)
ORDER BY amplification DESC;`;

export const errorBudgetQuery = `WITH
    total AS (
        SELECT count() AS total_requests
        FROM http_logs
        WHERE ts >= {windowStart:DateTime} - INTERVAL 7 DAY
          AND ts < {windowEnd:DateTime}
    ),
    incident AS (
        SELECT count() AS slow_requests
        FROM http_logs
        WHERE ts BETWEEN {deployTime:DateTime} AND {windowEnd:DateTime}
          AND latency_ms > 250
    )
SELECT
    round(slow_requests / total_requests * 100, 1) AS consumed_pct,
    8.3 AS burn_rate,
    'about 4 hours' AS exhaustion_estimate
FROM total, incident;`;

export const queryLogProofQuery = `SELECT
    event_time,
    query_duration_ms,
    read_rows,
    result_rows,
    query
FROM system.query_log
WHERE type = 'QueryFinish'
  AND event_time >= now() - INTERVAL 1 HOUR
  AND query_kind = 'Select'
  AND (
      query LIKE '%http_logs%'
      OR query LIKE '%span_logs%'
      OR query LIKE '%latency_rollup_1m%'
      OR query LIKE '%deploy_events%'
  )
ORDER BY event_time DESC
LIMIT 5;`;
