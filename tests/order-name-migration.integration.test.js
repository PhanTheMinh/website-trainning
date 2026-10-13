const { v4: uuid } = require('uuid')
const T = require('sequelize')
const sequelize = require('../src/config/database')
const { User } = require('../src/models')
const migration = require('../migrations/20261013090000-add-order-name-counters')
const storeMigration = require('../migrations/20261013100000-scope-order-names-to-store-owner')
const suffix = uuid().replaceAll('-', '')
const tables = { orders: `test_order_names_${suffix}`, order_name_counters: `test_order_counters_${suffix}`, shops: `test_order_shops_${suffix}` }
const users = []
const q = sequelize.getQueryInterface()
let TestOrder, TestCounter, isolated

describe('Test migration ORM trên bảng database test riêng', () => {
    beforeAll(async () => {
        for (let i = 0; i < 2; i++) users.push(await User.create({ full_name: 'Migration tester',
            email: `migration-${suffix}-${i}@example.com`, password: 'test-only', role: 'user', status: 'active' }))
        await q.createTable(tables.orders, { id: { type: T.BIGINT, primaryKey: true },
            user_id: T.BIGINT, shop_id: T.BIGINT, order_name: T.STRING(100), created_at: T.DATE })
        await q.createTable(tables.shops, { id: { type: T.BIGINT, primaryKey: true }, owner_user_id: T.BIGINT })
        await q.bulkInsert(tables.shops, [{ id: 100, owner_user_id: users[1].id }, { id: 200, owner_user_id: users[0].id }])
        await q.createTable(tables.order_name_counters, require('../src/database/order-schema-v4')(T).order_name_counters)
        // Ngày bằng nhau phải sắp ID theo số: 2 trước 10, không sắp chuỗi.
        await q.bulkInsert(tables.orders, [
            { id: 10, user_id: users[0].id, shop_id: 200, order_name: 'Old B', created_at: new Date('2026-01-01') },
            { id: 2, user_id: users[0].id, shop_id: 100, order_name: 'Old A', created_at: new Date('2026-01-01') },
            { id: 5, user_id: users[1].id, shop_id: 100, order_name: 'Old C', created_at: new Date('2026-01-02') }
        ])
        await q.bulkInsert(tables.order_name_counters, [{ user_id: users[1].id, last_number: 8 }])
        // Ánh xạ migration sang bảng riêng, tuyệt đối không đổi bảng orders thật.
        isolated = {
            showAllTables: async () => ['order_name_counters'],
            showIndex: table => q.showIndex(tables[table]),
            addIndex: (table, fields, options) => q.addIndex(tables[table], fields, options),
            sequelize: {
                transaction: callback => sequelize.transaction(callback),
                define: (name, fields, options) => {
                    const model = sequelize.define(name, fields, { ...options, tableName: tables[options.tableName] })
                    if (options.tableName === 'orders') TestOrder = model
                    else if (options.tableName === 'order_name_counters') TestCounter = model
                    return model
                }
            }
        }
        await migration.up(isolated, T)
        await migration.up(isolated, T)
    }, 30000)
    afterAll(async () => {
        try {
            // Hai tên bảng cố định theo UUID test, không trỏ tới bảng ứng dụng.
            await q.dropTable(tables.order_name_counters)
            await q.dropTable(tables.orders)
            await q.dropTable(tables.shops)
            await User.destroy({ where: { id: users.map(user => user.id) } })
        } finally { await sequelize.close() }
    })
    it('Case 1 - Chuyển tên đúng thứ tự và bắt đầu riêng từng user', async () => {
        const rows = await TestOrder.findAll({ order: [['id', 'ASC']], raw: true })
        expect(rows.map(row => row.order_name)).toEqual([
            `#pl${users[0].id}_0001`, `#pl${users[1].id}_0001`, `#pl${users[0].id}_0002`
        ])
    })
    it('Case 2 - Khởi tạo bộ đếm và không giảm số đã được cấp trước đó', async () => {
        expect(String((await TestCounter.findByPk(users[0].id)).last_number)).toBe('2')
        expect(String((await TestCounter.findByPk(users[1].id)).last_number)).toBe('8')
    })
    it('Case 3 - Unique index chặn tên trùng sau khi chuyển đổi', async () => {
        await expect(TestOrder.update({ order_name: `#pl${users[0].id}_0001` }, { where: { id: 10 } }))
            .rejects.toMatchObject({ name: 'SequelizeUniqueConstraintError' })
    })
    it('Case 4 - Migration mới chuyển sang chủ shop và xử lý va chạm tên cũ an toàn', async () => {
        await storeMigration.up(isolated, T)
        const rows = await TestOrder.findAll({ order: [['id', 'ASC']], raw: true })
        expect(rows.map(row => row.order_name)).toEqual([
            `#pl${users[1].id}_0001`, `#pl${users[1].id}_0002`, `#pl${users[0].id}_0001`
        ])
        expect(String((await TestCounter.findByPk(users[0].id)).last_number)).toBe('1')
        expect(String((await TestCounter.findByPk(users[1].id)).last_number)).toBe('2')
    })
})
