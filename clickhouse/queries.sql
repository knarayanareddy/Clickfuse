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
