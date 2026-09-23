import sql from 'mssql'

// 缓存“正在连接”的 Promise，避免冷启动时多个并行请求各自创建连接池。
// 如果首次连接失败则清空缓存，让页面的自动重试可以重新建立连接。
let poolPromise: Promise<sql.ConnectionPool> | undefined
export function getPool() {
  const connectionString = process.env.SQL_CONNECTION_STRING
  if (!connectionString) throw new Error('未配置 SQL_CONNECTION_STRING')
  if (!poolPromise) {
    const pool = new sql.ConnectionPool(connectionString)
    poolPromise = pool.connect().catch((error) => {
      poolPromise = undefined
      throw error
    })
  }
  return poolPromise
}
export { sql }
