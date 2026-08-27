import sql from 'mssql'

let pool: sql.ConnectionPool | undefined
export async function getPool() {
  const connectionString = process.env.SQL_CONNECTION_STRING
  if (!connectionString) throw new Error('未配置 SQL_CONNECTION_STRING')
  pool ??= await sql.connect(connectionString)
  return pool
}
export { sql }
