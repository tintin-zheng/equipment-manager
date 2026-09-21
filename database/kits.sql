-- 为已部署的 ZJE-Lens 数据库增加 Kit（整套器材）功能。
-- 请在 Azure SQL 查询编辑器中只执行本文件一次。

CREATE TABLE kits (
  id INT IDENTITY(1,1) PRIMARY KEY,
  name NVARCHAR(200) NOT NULL,
  description NVARCHAR(500) NULL,
  created_at DATETIME2 NOT NULL
);

CREATE TABLE kit_items (
  kit_id INT NOT NULL FOREIGN KEY REFERENCES kits(id),
  equipment_id INT NOT NULL FOREIGN KEY REFERENCES equipment(id),
  CONSTRAINT PK_kit_items PRIMARY KEY (kit_id, equipment_id)
);

CREATE TABLE kit_borrow_records (
  id INT IDENTITY(1,1) PRIMARY KEY,
  kit_id INT NOT NULL FOREIGN KEY REFERENCES kits(id),
  member_id INT NOT NULL FOREIGN KEY REFERENCES members(id),
  borrow_time DATETIME2 NOT NULL,
  return_time DATETIME2 NULL
);

ALTER TABLE borrow_records ADD kit_borrow_record_id INT NULL;
ALTER TABLE borrow_records ADD CONSTRAINT FK_borrow_records_kit_borrow_record FOREIGN KEY (kit_borrow_record_id) REFERENCES kit_borrow_records(id);
CREATE UNIQUE INDEX UX_kit_borrow_records_active_kit ON kit_borrow_records(kit_id) WHERE return_time IS NULL;
