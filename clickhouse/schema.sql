CREATE TABLE IF NOT EXISTS http_logs
(
    ts DateTime64(3),
    request_id String,
    service LowCardinality(String),
    endpoint LowCardinality(String),
    status UInt16,
    latency_ms UInt32
)
ENGINE = MergeTree()
ORDER BY (service, endpoint, ts);

CREATE TABLE IF NOT EXISTS span_logs
(
    ts DateTime64(3),
    trace_id String,
    span_id String,
    parent_span_id String,
    service LowCardinality(String),
    operation String,
    duration_ms UInt32,
    status LowCardinality(String)
)
ENGINE = MergeTree()
ORDER BY (service, ts, trace_id);

CREATE TABLE IF NOT EXISTS deploy_events
(
    deployed_at DateTime64(3),
    service LowCardinality(String),
    version String,
    diff String
)
ENGINE = MergeTree()
ORDER BY (service, deployed_at);

CREATE TABLE IF NOT EXISTS latency_rollup_1m
(
    minute DateTime,
    service LowCardinality(String),
    endpoint LowCardinality(String),
    p50_state AggregateFunction(quantile(0.5), UInt32),
    p95_state AggregateFunction(quantile(0.95), UInt32),
    p99_state AggregateFunction(quantile(0.99), UInt32),
    error_count_state AggregateFunction(sum, UInt64),
    request_count_state AggregateFunction(count)
)
ENGINE = AggregatingMergeTree()
ORDER BY (service, endpoint, minute);

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_latency_rollup_1m
TO latency_rollup_1m
AS SELECT
    toStartOfMinute(ts) AS minute,
    service,
    endpoint,
    quantileState(0.5)(latency_ms) AS p50_state,
    quantileState(0.95)(latency_ms) AS p95_state,
    quantileState(0.99)(latency_ms) AS p99_state,
    sumState(toUInt64(status >= 500)) AS error_count_state,
    countState() AS request_count_state
FROM http_logs
GROUP BY minute, service, endpoint;
