-- ZJE-Lens Azure SQL 初始化脚本。请在 Azure Portal 的 SQL 查询编辑器中执行一次。
CREATE TABLE members (id INT IDENTITY(1,1) PRIMARY KEY, name NVARCHAR(100) NOT NULL UNIQUE);
CREATE TABLE equipment (id INT IDENTITY(1,1) PRIMARY KEY, name NVARCHAR(200) NOT NULL, category NVARCHAR(100) NOT NULL CONSTRAINT DF_equipment_category DEFAULT N'其他', status VARCHAR(20) NOT NULL CONSTRAINT CK_equipment_status CHECK (status IN ('available','borrowed')), image_url NVARCHAR(500) NULL, description NVARCHAR(500) NULL);
CREATE TABLE borrow_records (id INT IDENTITY(1,1) PRIMARY KEY, equipment_id INT NOT NULL FOREIGN KEY REFERENCES equipment(id), member_id INT NOT NULL FOREIGN KEY REFERENCES members(id), borrow_time DATETIME2 NOT NULL, return_time DATETIME2 NULL);
CREATE UNIQUE INDEX UX_borrow_records_active_equipment ON borrow_records(equipment_id) WHERE return_time IS NULL;
CREATE TABLE tasks (id INT IDENTITY(1,1) PRIMARY KEY, title NVARCHAR(200) NOT NULL, task_time DATETIME2 NULL, location NVARCHAR(200) NULL, note NVARCHAR(1000) NULL, created_by_member_id INT NULL FOREIGN KEY REFERENCES members(id), created_at DATETIME2 NOT NULL, updated_at DATETIME2 NOT NULL, archived_at DATETIME2 NULL);
CREATE TABLE task_participants (task_id INT NOT NULL FOREIGN KEY REFERENCES tasks(id), member_id INT NOT NULL FOREIGN KEY REFERENCES members(id), joined_at DATETIME2 NOT NULL, CONSTRAINT PK_task_participants PRIMARY KEY (task_id, member_id));
CREATE INDEX IX_tasks_time ON tasks(task_time);
CREATE TABLE kits (id INT IDENTITY(1,1) PRIMARY KEY, name NVARCHAR(200) NOT NULL, description NVARCHAR(500) NULL, created_at DATETIME2 NOT NULL);
CREATE TABLE kit_items (kit_id INT NOT NULL FOREIGN KEY REFERENCES kits(id), equipment_id INT NOT NULL FOREIGN KEY REFERENCES equipment(id), CONSTRAINT PK_kit_items PRIMARY KEY (kit_id, equipment_id));
CREATE TABLE kit_borrow_records (id INT IDENTITY(1,1) PRIMARY KEY, kit_id INT NOT NULL FOREIGN KEY REFERENCES kits(id), member_id INT NOT NULL FOREIGN KEY REFERENCES members(id), borrow_time DATETIME2 NOT NULL, return_time DATETIME2 NULL);
ALTER TABLE borrow_records ADD kit_borrow_record_id INT NULL;
ALTER TABLE borrow_records ADD CONSTRAINT FK_borrow_records_kit_borrow_record FOREIGN KEY (kit_borrow_record_id) REFERENCES kit_borrow_records(id);
CREATE UNIQUE INDEX UX_kit_borrow_records_active_kit ON kit_borrow_records(kit_id) WHERE return_time IS NULL;
INSERT INTO members (name) VALUES (N'Bowen'), (N'Alice'), (N'Bob');
INSERT INTO equipment (name, category, status, description) VALUES (N'Sony ZV-E1',N'相机','available',N'全画幅 Vlog 相机，含电池与存储卡。'),(N'Sony 24-70 GM II',N'镜头','available',N'F2.8 标准变焦镜头。'),(N'DJI Mic 2',N'麦克风','available',N'双通道无线麦克风套装。');
