-- Timeline anomaly band
WITH buckets AS (
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
ORDER BY minute, service;

-- AggregatingMergeTree rollup proof
SELECT
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
LIMIT 20;

-- Before / after service diff
WITH baseline AS (
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
ORDER BY amplification DESC;

-- AggregatingMergeTree rollup proof (State/Merge)
SELECT
    minute,
    service,
    endpoint,
    quantileMerge(0.5)(p50_state) AS p50_ms,
    quantileMerge(0.95)(p95_state) AS p95_ms,
    quantileMerge(0.99)(p99_state) AS p99_ms,
    sumMerge(error_count_state) AS errors,
    countMerge(request_count_state) AS requests
FROM latency_rollup_1m
WHERE minute BETWEEN {windowStart:DateTime} AND {windowEnd:DateTime}
GROUP BY minute, service, endpoint
ORDER BY minute, service, endpoint;
