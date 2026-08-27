-- ZJE-Lens Azure SQL 初始化脚本。请在 Azure Portal 的 SQL 查询编辑器中执行一次。
CREATE TABLE members (id INT IDENTITY(1,1) PRIMARY KEY, name NVARCHAR(100) NOT NULL UNIQUE);
CREATE TABLE equipment (id INT IDENTITY(1,1) PRIMARY KEY, name NVARCHAR(200) NOT NULL, category NVARCHAR(100) NOT NULL CONSTRAINT DF_equipment_category DEFAULT N'其他', status VARCHAR(20) NOT NULL CONSTRAINT CK_equipment_status CHECK (status IN ('available','borrowed')), image_url NVARCHAR(500) NULL, description NVARCHAR(500) NULL);
CREATE TABLE borrow_records (id INT IDENTITY(1,1) PRIMARY KEY, equipment_id INT NOT NULL FOREIGN KEY REFERENCES equipment(id), member_id INT NOT NULL FOREIGN KEY REFERENCES members(id), borrow_time DATETIME2 NOT NULL, return_time DATETIME2 NULL);
CREATE UNIQUE INDEX UX_borrow_records_active_equipment ON borrow_records(equipment_id) WHERE return_time IS NULL;
INSERT INTO members (name) VALUES (N'Bowen'), (N'Alice'), (N'Bob');
INSERT INTO equipment (name, category, status, description) VALUES (N'Sony ZV-E1',N'相机','available',N'全画幅 Vlog 相机，含电池与存储卡。'),(N'Sony 24-70 GM II',N'镜头','available',N'F2.8 标准变焦镜头。'),(N'DJI Mic 2',N'麦克风','available',N'双通道无线麦克风套装。');
