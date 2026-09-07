-- ZJE-Lens 团队任务功能迁移脚本。
-- 已执行过 database/schema.sql 的现有数据库，只需额外执行本文件一次。

CREATE TABLE tasks (
  id INT IDENTITY(1,1) PRIMARY KEY,
  title NVARCHAR(200) NOT NULL,
  task_time DATETIME2 NULL,
  location NVARCHAR(200) NULL,
  note NVARCHAR(1000) NULL,
  created_by_member_id INT NULL FOREIGN KEY REFERENCES members(id),
  created_at DATETIME2 NOT NULL,
  updated_at DATETIME2 NOT NULL,
  archived_at DATETIME2 NULL
);

CREATE TABLE task_participants (
  task_id INT NOT NULL FOREIGN KEY REFERENCES tasks(id),
  member_id INT NOT NULL FOREIGN KEY REFERENCES members(id),
  joined_at DATETIME2 NOT NULL,
  CONSTRAINT PK_task_participants PRIMARY KEY (task_id, member_id)
);

CREATE INDEX IX_tasks_time ON tasks(task_time);
