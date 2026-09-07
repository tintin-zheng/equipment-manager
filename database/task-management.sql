-- 为已创建 tasks 表的数据库添加归档功能。
-- 在 Azure SQL 查询编辑器中只需执行本文件一次。

ALTER TABLE tasks ADD archived_at DATETIME2 NULL;
