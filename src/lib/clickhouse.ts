export function hasClickHouseEnv() {
  return Boolean(
    process.env.CLICKHOUSE_HOST &&
      process.env.CLICKHOUSE_USERNAME &&
      process.env.CLICKHOUSE_PASSWORD &&
      process.env.CLICKHOUSE_DATABASE
  );
}

export async function clickhouseClient(options: { readonly?: boolean } = { readonly: true }) {
  if (!hasClickHouseEnv()) {
    throw new Error("ClickHouse environment variables are missing. Use fixture mode or configure .env.local.");
  }

  const { createClient } = await import("@clickhouse/client");

  return createClient({
    url: process.env.CLICKHOUSE_HOST,
    username: process.env.CLICKHOUSE_USERNAME,
    password: process.env.CLICKHOUSE_PASSWORD,
    database: process.env.CLICKHOUSE_DATABASE,
    clickhouse_settings: options.readonly === false ? undefined : {
      readonly: "2",
      max_result_rows: "1000"
    }
  });
}
