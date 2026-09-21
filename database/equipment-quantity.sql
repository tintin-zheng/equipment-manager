-- 为已部署的 ZJE-Lens 数据库增加器材库存数量功能。
-- 请在 Azure SQL 查询编辑器中只执行本文件一次。

ALTER TABLE equipment
ADD quantity INT NOT NULL
    CONSTRAINT DF_equipment_quantity DEFAULT 1;
GO

ALTER TABLE equipment
ADD CONSTRAINT CK_equipment_quantity CHECK (quantity >= 1);
GO

DROP INDEX UX_borrow_records_active_equipment ON borrow_records;
GO

CREATE INDEX IX_borrow_records_active_equipment
ON borrow_records(equipment_id)
WHERE return_time IS NULL;
GO
