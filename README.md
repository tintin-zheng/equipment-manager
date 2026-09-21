# ZJE-Lens 团队工作台

为小型摄影团队制作的手机优先器材借还网页。用户首次选择或注册身份后，浏览器只保存该身份；器材状态、借还人和历史记录由后端数据库保存。

## 本地运行（Phase 1）

```bash
npm install
npm run dev
```

访问 http://localhost:5173 。默认使用内存 mock API，适合演示完整的选择身份、借出和归还流程。刷新页面会重置 mock 借还数据；身份仍会保留在 localStorage。

```text
src/App.tsx          页面与交互
src/api.ts           唯一的前端 API 入口
src/mockApi.ts       第一阶段的内存模拟数据
src/types.ts         前后端共享的数据形状
api/                 Azure Functions（Phase 2）
database/schema.sql  Azure SQL 表、约束和种子数据
database/equipment-quantity.sql  已部署数据库的库存数量升级脚本
```

## 切换至真实 Azure Functions

在前端构建环境设置 `VITE_USE_MOCK_API=false`。此时 `src/api.ts` 会请求 `/api/*`，Azure Static Web Apps 会将该路径代理到 `api/` 中的 Functions。

进入 `api` 后安装和本地运行：

```bash
npm install
cp local.settings.json.example local.settings.json
# 填写 local.settings.json 的 SQL_CONNECTION_STRING
npm run build
func start
```

全新数据库先在 Azure SQL Database 的查询编辑器执行 `database/schema.sql`。已经运行中的数据库不要重新执行初始化脚本，只需执行一次 `database/equipment-quantity.sql` 来增加库存数量。借出接口会在事务内锁定器材并重新统计当前借出数量，只有库存仍有剩余时才会创建记录，从而避免多人同时借出超过库存。

管理模式的删除接口为 `DELETE /api/equipment/:id`。为了保留借还历史，只有从未借出且当前可借的器材可以删除；借出中或已有借还记录的器材会被拒绝删除。

## 部署到 Azure

1. 创建 Azure SQL Database（小型/免费额度优先），执行 `database/schema.sql`。
2. 创建 Azure Static Web App，连接 GitHub 仓库，构建预设选 **React**。
3. 在 Static Web App 的应用设置加入 `SQL_CONNECTION_STRING`。生产工作流已经在构建时设置 `VITE_USE_MOCK_API=false`，无需在 Portal 再填写它。
4. 将 Azure 创建时给出的部署令牌保存到 GitHub Actions Secret：`AZURE_STATIC_WEB_APPS_API_TOKEN`。
5. 推送到 `main`，`.github/workflows/azure-static-web-apps.yml` 自动构建和部署。
6. 部署成功后，用 Azure 给出的 `https://<name>.azurestaticapps.net` 地址生成一个普通二维码，张贴为团队入口即可。

没有登录、OAuth、Redis、Docker 或复杂状态管理。API 目前保持匿名访问，符合熟人小团队的低摩擦使用场景。
