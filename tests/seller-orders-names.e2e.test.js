const { spawn } = require('node:child_process')
const path = require('node:path')
const fixture = require('./helpers/seller-orders-search-fixture')
const { seed, cleanup, app, users, orders, OrderAddress } = fixture

// Chỉ chạy khi bật ORDER_SEARCH_E2E=1 vì cần API frontend và trình duyệt thật.
const run = process.env.ORDER_SEARCH_E2E === '1' ? describe : describe.skip
run('Test E2E tìm tên Order và Customer từ trình duyệt đến database', () => {
    let browser, context, page, server, vite
    const origin = 'http://127.0.0.1:5181'
    let viteLog = ''

    beforeAll(async () => {
        // Tạo dữ liệu test và cho tên người nhận khác tên khách để kiểm tra nguồn hiển thị.
        const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
        await seed()
        await OrderAddress.update({ recipient_first_name: 'SnapshotOnly', recipient_last_name: 'RecipientOnly' },
            { where: { order_id: orders[0][0].id } })
        server = await new Promise((resolve, reject) => {
            const instance = app.listen(3101, '127.0.0.1', () => resolve(instance))
            instance.on('error', reject)
        })
        vite = spawn(process.execPath, ['frontend/node_modules/vite/bin/vite.js', '--config',
            'tests/e2e/order-search-vite.config.mjs'], { cwd: path.resolve(__dirname, '..'), windowsHide: true,
            stdio: ['ignore', 'pipe', 'pipe'] })
        vite.stdout.on('data', chunk => { viteLog += chunk })
        vite.stderr.on('data', chunk => { viteLog += chunk })
        let ready = false
        for (let attempt = 0; attempt < 80; attempt++) {
            if (vite.exitCode !== null) throw new Error(`Vite stopped: ${viteLog}`)
            try { ready = (await fetch(origin)).ok } catch { /* Frontend đang khởi động. */ }
            if (ready) break
            await new Promise(resolve => setTimeout(resolve, 250))
        }
        if (!ready) throw new Error(`Vite did not start: ${viteLog}`)
        browser = await chromium.launch({ headless: true,
            channel: process.env.E2E_BROWSER_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined) })
        context = await browser.newContext()
        // Đăng nhập qua API thật; cookie được dùng khi mở trang danh sách.
        const login = await context.request.post(`${origin}/api/auth/login`, {
            data: { email: users[0].email, password: '123456' }
        })
        expect(login.status()).toBe(200)
        page = await context.newPage()
    }, 60000)

    afterAll(async () => {
        // Đóng trình duyệt tắt frontend API và xóa dữ liệu đã tạo.
        await browser?.close()
        if (vite && vite.exitCode === null) {
            await new Promise(resolve => { vite.once('exit', resolve); vite.kill() })
        }
        if (server) await new Promise(resolve => server.close(resolve))
        await cleanup()
    }, 30000)

    async function search(q, query = '') {
        // Mở bảng List Order nhập từ khóa và nhấn Enter như người dùng.
        await page.goto(`${origin}/me/manage/orders${query}`)
        const input = page.getByRole('searchbox', { name: 'Search orders or customers' })
        await input.waitFor()
        await page.getByRole('button', { name: 'Search orders', exact: true }).waitFor()
        await page.waitForFunction(() => !globalThis.document.querySelector('button[aria-label="Search orders"]')?.disabled)
        const responsePromise = page.waitForResponse(response => {
            const url = new URL(response.url())
            return url.pathname === '/api/shops/me/orders' && url.searchParams.get('q') === q.trim()
        })
        await input.fill(q)
        await input.press('Enter')
        const response = await responsePromise
        expect(response.status()).toBe(200)
        const body = await response.json()
        await page.waitForFunction(() => !globalThis.document.querySelector('button[aria-label="Search orders"]')?.disabled)
        return body
    }

    it('Case 1 - Tìm tên đơn và hiển thị đúng tên đơn cùng tên khách trong bảng', async () => {
        const target = orders[0][0]
        const result = await search(target.order_name)
        expect(result.data.map(row => row.id)).toEqual([target.id])
        const rows = page.locator('tbody tr')
        // Đối chiếu dữ liệu API với hai cột Order và Customer đang hiển thị.
        expect(await rows.count()).toBe(1)
        expect(await rows.first().locator('td').nth(0).innerText()).toContain(target.order_name)
        expect(await rows.first().locator('td').nth(1).innerText()).toBe('Search Customer')
    }, 30000)

    it('Case 2 - Tìm tên khách hàng và hiển thị các đơn liên kết đúng khách', async () => {
        const result = await search('Search Customer')
        expect(result.data.map(row => row.id).sort()).toEqual([orders[0][0].id, orders[1][0].id].sort())
        const names = await page.locator('tbody tr td.rs-list-customer-cell').allTextContents()
        expect(names.map(name => name.trim())).toEqual(['Search Customer', 'Search Customer'])
    }, 30000)

    it('Case 3 - Hiển thị thông báo không có đơn khi tên không tồn tại', async () => {
        expect((await search('NoSuchOrderOrCustomer')).data).toEqual([])
        expect(await page.locator('tbody tr').count()).toBe(0)
        await page.getByText('No orders found', { exact: true }).waitFor()
    }, 30000)

    it('Case 4 - Tìm một phần tên đơn và hiển thị đầy đủ các đơn phù hợp', async () => {
        const result = await search(`#pl${users[0].id}_`)
        expect(result.pagination.totalItems).toBe(3)
        expect(await page.locator('tbody tr').count()).toBe(3)
        const names = await page.locator('tbody tr .rs-list-order-title').allTextContents()
        expect(names.map(name => name.trim()).sort()).toEqual(orders.map(group => group[0].order_name).sort())
    }, 30000)

    it('Case 5 - Loại khoảng trắng hai đầu và giữ search khi tải lại trang', async () => {
        const target = orders[0][0]
        expect((await search(`  ${target.order_name}  `)).data.map(row => row.id)).toEqual([target.id])
        expect(new URL(page.url()).searchParams.get('q')).toBe(target.order_name)
        await page.reload()
        await page.getByRole('button', { name: 'Search orders', exact: true }).waitFor()
        await page.waitForFunction(() => !globalThis.document.querySelector('button[aria-label="Search orders"]')?.disabled)
        expect(await page.getByRole('searchbox', { name: 'Search orders or customers' }).inputValue()).toBe(target.order_name)
        expect(await page.locator('tbody tr').count()).toBe(1)
        expect(await page.locator('tbody tr .rs-list-order-title').innerText()).toBe(target.order_name)
    }, 30000)

    it('Case 6 - Xóa search sẽ tự khôi phục danh sách đơn', async () => {
        await search(orders[0][0].order_name)
        const responsePromise = page.waitForResponse(response => {
            const url = new URL(response.url())
            return url.pathname === '/api/shops/me/orders' && url.searchParams.get('q') === ''
        })
        await page.getByRole('searchbox', { name: 'Search orders or customers' }).fill('')
        const response = await responsePromise
        expect(response.status()).toBe(200)
        expect((await response.json()).pagination.totalItems).toBe(3)
        await page.waitForFunction(() => !globalThis.document.querySelector('button[aria-label="Search orders"]')?.disabled)
        expect(await page.locator('tbody tr').count()).toBe(3)
        expect(new URL(page.url()).searchParams.get('page')).toBe('1')
    }, 30000)

    it('Case 7 - Đổi từ khóa trở về trang đầu và giữ bộ lọc thanh toán', async () => {
        const result = await search('Search Customer', '?financial_status=paid&page=2')
        expect(result.data.map(row => row.id)).toEqual([orders[1][0].id])
        const url = new URL(page.url())
        expect(url.searchParams.get('page')).toBe('1')
        expect(url.searchParams.get('financial_status')).toBe('paid')
        expect(await page.locator('tbody tr').count()).toBe(1)
        expect(await page.locator('tbody tr .rs-list-payment-cell').innerText()).toBe('Paid')
    }, 30000)
})
